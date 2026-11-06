// Phone reminders over Web Push: subscription storage, the 5-minute scheduler, and the push encryption itself
// (RFC 8291 aes128gcm payload + RFC 8292 VAPID), written on WebCrypto so no library is needed.
//   env.VAPID_PUBLIC  = uncompressed P-256 public key, base64url (also given to the app)
//   env.VAPID_PRIVATE = the matching private key as a JWK JSON string (secret)

const enc = new TextEncoder();
const KINDS = ['train', 'water', 'food', 'sleep', 'quest'];
const MAX_PER_DAY = 40;          // reminders per weekday a subscription may store
const MAX_WINDOW_MS = 20 * 60 * 1000; // after an outage, only catch up on reminders from the last 20 minutes
const STALE_MS = 60 * 24 * 60 * 60 * 1000; // a phone that hasn't opened the app in 60 days stops getting reminders
const MAX_FAILS = 6;             // consecutive delivery failures (not 404/410) before the subscription is dropped
// Only the browsers' own push services may be called; anything else would let a caller make the Worker fetch any URL.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^push\.services\.mozilla\.com$/,
  /(^|\.)push\.apple\.com$/, /(^|\.)notify\.windows\.com$/, /^android\.googleapis\.com$/];

export class PushError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }

const b64u = buf => { let s = ''; new Uint8Array(buf).forEach(c => { s += String.fromCharCode(c); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = str => { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; };
const cat = (...parts) => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out; };

/* ---------- validation of what the app sends ---------- */
export function checkSub(s) {
  if (!s || typeof s !== 'object' || typeof s.endpoint !== 'string' || s.endpoint.length > 1000) throw new PushError(400, 'bad_sub', 'ข้อมูลการแจ้งเตือนไม่ถูกต้อง');
  let u; try { u = new URL(s.endpoint); } catch (e) { throw new PushError(400, 'bad_sub', 'ข้อมูลการแจ้งเตือนไม่ถูกต้อง'); }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.some(r => r.test(u.hostname))) throw new PushError(400, 'bad_host', 'เบราว์เซอร์นี้ยังไม่รองรับการแจ้งเตือน');
  const k = s.keys || {};
  if (typeof k.p256dh !== 'string' || typeof k.auth !== 'string') throw new PushError(400, 'bad_sub', 'ข้อมูลการแจ้งเตือนไม่ถูกต้อง');
  let pk, au; try { pk = unb64u(k.p256dh); au = unb64u(k.auth); } catch (e) { throw new PushError(400, 'bad_sub', 'ข้อมูลการแจ้งเตือนไม่ถูกต้อง'); }
  if (pk.length !== 65 || pk[0] !== 4 || au.length !== 16) throw new PushError(400, 'bad_sub', 'ข้อมูลการแจ้งเตือนไม่ถูกต้อง');
  return { endpoint: s.endpoint, p256dh: k.p256dh, auth: k.auth };
}
const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
export function checkSched(v) {
  if (!v || typeof v !== 'object') throw new PushError(400, 'bad_sched', 'ตารางแจ้งเตือนไม่ถูกต้อง');
  const tz = Math.round(+v.tz);
  if (!(tz >= -720 && tz <= 840)) throw new PushError(400, 'bad_sched', 'เขตเวลาไม่ถูกต้อง');
  const d = {};
  for (let i = 0; i < 7; i++) {
    const list = Array.isArray(v.d && v.d[i]) ? v.d[i] : [];
    d[i] = list.slice(0, MAX_PER_DAY).filter(r => Array.isArray(r) && Number.isInteger(r[0]) && r[0] >= 0 && r[0] < 1440 && KINDS.includes(r[1]))
      .map(r => [r[0], r[1], str(r[2], 80), str(r[3], 160)]).filter(r => r[2]);
  }
  return { tz, d };
}
export function checkState(v) {
  const o = {}, ok = s => typeof s === 'string' && /^\d{4}-\d\d-\d\d$/.test(s);
  if (v && ok(v.trained)) o.trained = v.trained;
  if (v && ok(v.quests)) o.quests = v.quests;
  return o;
}

/* ---------- which reminders fall in (from, to] for one subscription ---------- */
const localIso = ms => new Date(ms).toISOString().slice(0, 10);
export function dueReminders(sched, state, from, to) {
  const tz = sched.tz * 60000, out = [];
  const lf = from + tz, lt = to + tz;                      // "local" clock expressed as UTC milliseconds
  for (let day = Math.floor(lf / 864e5); day <= Math.floor(lt / 864e5); day++) {
    const start = day * 864e5, wd = new Date(start).getUTCDay(), today = localIso(start);
    (sched.d[wd] || []).forEach(([m, kind, title, body]) => {
      const t = start + m * 60000;
      if (t <= lf || t > lt) return;
      if (kind === 'train' && state.trained === today) return;   // already trained today
      if (kind === 'quest' && state.quests === today) return;    // every quest already cleared
      out.push({ kind, title, body, at: t - tz });
    });
  }
  return out;
}

/* ---------- VAPID + aes128gcm ---------- */
let signKey = null;
async function vapidKey(env) {
  if (!signKey) signKey = await crypto.subtle.importKey('jwk', JSON.parse(env.VAPID_PRIVATE), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return signKey;
}
async function vapidHeader(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'https://mewfit.m3wxuser.workers.dev' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, await vapidKey(env), enc.encode(head + '.' + claims));
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${env.VAPID_PUBLIC}`;
}
async function hkdf(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
export async function encryptPayload(p256dh, authSecret, text) {
  const ua = unb64u(p256dh), auth = unb64u(authSecret);
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(auth, secret, cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);                 // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, ct);
}
export async function sendPush(env, sub, msg) {
  const bodyBytes = await encryptPayload(sub.p256dh, sub.auth, JSON.stringify(msg));
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: { 'content-encoding': 'aes128gcm', 'content-type': 'application/octet-stream', ttl: '3600', urgency: 'normal',
      topic: msg.kind || 'mewfit', authorization: await vapidHeader(env, sub.endpoint) },
    body: bodyBytes,
  });
  return r.status;
}

/* ---------- table: created on first use (same SQL as migrations/0005_push.sql), so a deploy works
   even with a token that can't run D1 migrations; the migration file uses IF NOT EXISTS so applying it later is harmless ---------- */
let tableReady = false;
async function ensureTable(env) {
  if (tableReady) return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, p256dh TEXT NOT NULL, auth TEXT NOT NULL, sched TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT '{}', last_run INTEGER NOT NULL, updated INTEGER NOT NULL, fails INTEGER NOT NULL DEFAULT 0)`).run();
  tableReady = true;
}

/* ---------- API ---------- */
export async function pushSave(env, b, now) {
  const sub = checkSub(b.sub), sched = checkSched(b.sched), state = checkState(b.state);
  await ensureTable(env);
  await env.DB.prepare(`INSERT INTO push_subs (endpoint, p256dh, auth, sched, state, last_run, updated, fails) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 0)
    ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, sched = ?4, state = ?5, updated = ?6, fails = 0`)
    .bind(sub.endpoint, sub.p256dh, sub.auth, JSON.stringify(sched), JSON.stringify(state), now).run();
  return { ok: true, count: Object.values(sched.d).reduce((a, l) => a + l.length, 0) };
}
export async function pushState(env, b) {
  if (!b || typeof b.endpoint !== 'string') throw new PushError(400, 'bad_sub', 'ข้อมูลการแจ้งเตือนไม่ถูกต้อง');
  await ensureTable(env);
  const r = await env.DB.prepare('UPDATE push_subs SET state = ? WHERE endpoint = ?').bind(JSON.stringify(checkState(b.state)), b.endpoint).run();
  return { ok: true, found: !!(r.meta && r.meta.changes) };
}
export async function pushDelete(env, b) {
  if (!b || typeof b.endpoint !== 'string') throw new PushError(400, 'bad_sub', 'ข้อมูลการแจ้งเตือนไม่ถูกต้อง');
  await ensureTable(env);
  await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(b.endpoint).run();
  return { ok: true };
}
export async function pushTest(env, b) {
  const sub = checkSub(b.sub);
  const st = await sendPush(env, sub, { kind: 'test', title: 'MewFit · ระบบแจ้งเตือนพร้อมแล้ว', body: 'ถึงเวลาภารกิจเมื่อไร ระบบจะเรียกคุณแบบนี้' });
  if (st >= 300) throw new PushError(502, 'push_failed', 'ส่งแจ้งเตือนทดสอบไม่สำเร็จ ลองปิดแล้วเปิดใหม่');
  return { ok: true };
}

/* ---------- cron: every 5 minutes ---------- */
export async function runReminders(env, now = Date.now()) {
  if (!env.VAPID_PRIVATE || !env.VAPID_PUBLIC) return { sent: 0, skipped: 'no keys' };
  await ensureTable(env);
  await env.DB.prepare('DELETE FROM push_subs WHERE updated < ? OR fails >= ?').bind(now - STALE_MS, MAX_FAILS).run();
  const { results } = await env.DB.prepare('SELECT * FROM push_subs').all();
  let sent = 0;
  for (const s of results || []) {
    let due = [];
    try { due = dueReminders(JSON.parse(s.sched), JSON.parse(s.state || '{}'), Math.max(s.last_run, now - MAX_WINDOW_MS), now); } catch (e) {}
    let gone = false, failed = false;
    for (const d of due.slice(-3)) {                      // never flood: at most the 3 latest
      try {
        const st = await sendPush(env, s, { kind: d.kind, title: d.title, body: d.body, tag: d.kind });
        if (st === 404 || st === 410) { gone = true; break; }
        if (st >= 300) failed = true; else sent++;
      } catch (e) { failed = true; }
    }
    if (gone) await env.DB.prepare('DELETE FROM push_subs WHERE endpoint = ?').bind(s.endpoint).run();
    else await env.DB.prepare('UPDATE push_subs SET last_run = ?, fails = ? WHERE endpoint = ?')
      .bind(now, due.length ? (failed ? s.fails + 1 : 0) : s.fails, s.endpoint).run();
  }
  return { sent, subs: (results || []).length };
}
