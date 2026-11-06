// Phone reminders: payload encryption round-trip (decrypted the way a browser would, RFC 8291),
// the scheduler's time maths, and the /api/push/* endpoints against `wrangler dev --local --test-scheduled`.
//   node tests/push.test.mjs            (unit tests only)
//   BASE=http://127.0.0.1:8799 node tests/push.test.mjs   (plus API tests)
import { encryptPayload, dueReminders, checkSched } from '../push.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ok  ', m); } else { fail++; console.log('  FAIL', m); } };
const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = b => Buffer.from(b).toString('base64url');
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; p.forEach(x => { o.set(x, i); i += x.length; }); return o; };
async function hkdf(salt, ikm, info, len) { const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8)); }

console.log('encryption');
{
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', ua.publicKey)), auth = crypto.getRandomValues(new Uint8Array(16));
  const msg = JSON.stringify({ title: 'ถึงเวลาภารกิจหลัก', body: 'ทดสอบ ภาษาไทย 💪' });
  const bodyBytes = await encryptPayload(b64u(uaPub), b64u(auth), msg);
  const salt = bodyBytes.slice(0, 16), rs = new DataView(bodyBytes.buffer).getUint32(16), idlen = bodyBytes[20], asPub = bodyBytes.slice(21, 21 + idlen), ct = bodyBytes.slice(21 + idlen);
  ok(rs === 4096 && idlen === 65 && asPub[0] === 4, 'header: rs 4096, 65-byte sender key');
  const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, ua.privateKey, 256));
  const ikm = await hkdf(auth, secret, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
  ok(pt[pt.length - 1] === 2, 'last-record delimiter 0x02');
  ok(dec.decode(pt.slice(0, -1)) === msg, 'decrypts back to the same Thai text');
}

console.log('scheduler');
{
  const sched = checkSched({ tz: 420, d: { 0: [], 1: [], 2: [], 3: [], 4: [[18 * 60 + 30, 'train', 'ฝึก', 'x'], [21 * 60, 'quest', 'เควส', 'y']], 5: [[7 * 60, 'water', 'น้ำ', ''], [8 * 60, 'bad', 'x', '']], 6: [] } });
  ok(sched.d[5].length === 1, 'unknown kinds are dropped');
  // Thursday 2026-11-05 18:30 Bangkok = 11:30 UTC
  const t = Date.UTC(2026, 10, 5, 11, 30);
  ok(dueReminders(sched, {}, t - 5 * 60000, t).length === 1, 'reminder due exactly at its minute');
  ok(dueReminders(sched, {}, t, t + 5 * 60000).length === 0, 'not sent twice in the next window');
  ok(dueReminders(sched, { trained: '2026-11-05' }, t - 5 * 60000, t).length === 0, 'training reminder skipped when trained today');
  ok(dueReminders(sched, { trained: '2026-11-04' }, t - 5 * 60000, t).length === 1, 'yesterday\'s workout does not skip today');
  const q = Date.UTC(2026, 10, 5, 14, 0);
  ok(dueReminders(sched, { quests: '2026-11-05' }, q - 5 * 60000, q).length === 0, 'quest reminder skipped when all quests done');
  // Friday 07:00 Bangkok = Thursday 00:00 UTC; crossing UTC midnight must pick Friday's table
  const w = Date.UTC(2026, 10, 6, 0, 0);
  const due = dueReminders(sched, {}, w - 5 * 60000, w);
  ok(due.length === 1 && due[0].kind === 'water', 'weekday follows the phone\'s local date');
  let bad = false; try { checkSched({ tz: 9999, d: {} }); } catch (e) { bad = true; }
  ok(bad, 'impossible time zone refused');
}

const BASE = process.env.BASE;
if (BASE) {
  console.log('api', BASE);
  const post = async (p, b) => { const r = await fetch(BASE + '/api' + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) }); return { s: r.status, b: await r.json().catch(() => ({})) }; };
  const cfg = await (await fetch(BASE + '/api/config')).json();
  ok(typeof cfg.vapid === 'string' && cfg.vapid.length > 80, '/api/config gives the VAPID public key');
  const ua = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const keys = { p256dh: b64u(await crypto.subtle.exportKey('raw', ua.publicKey)), auth: b64u(crypto.getRandomValues(new Uint8Array(16))) };
  const endpoint = 'https://fcm.googleapis.com/fcm/send/mewfit-test-' + Date.now();
  const sched = { tz: 420, d: { 0: [[600, 'water', 'น้ำ', '']], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] } };
  let r = await post('/push/save', { sub: { endpoint: 'https://evil.example.com/x', keys }, sched });
  ok(r.s === 400 && r.b.code === 'bad_host', 'non-push-service endpoint refused (no fetch to arbitrary URLs)');
  r = await post('/push/save', { sub: { endpoint, keys: { p256dh: 'abc', auth: 'x' } }, sched });
  ok(r.s === 400, 'malformed keys refused');
  r = await post('/push/save', { sub: { endpoint, keys }, sched, state: {} });
  ok(r.s === 200 && r.b.count === 1, 'subscription saved');
  r = await post('/push/state', { endpoint, state: { trained: '2026-11-06', quests: 'nope' } });
  ok(r.s === 200 && r.b.found, 'state updated');
  r = await post('/push/state', { endpoint: endpoint + 'x', state: {} });
  ok(r.s === 200 && !r.b.found, 'unknown subscription reported as not found');
  const sc = await fetch(BASE + '/__scheduled?cron=*/5+*+*+*+*');
  ok(sc.status === 200, 'cron handler runs without crashing (fake endpoint just fails)');
  r = await post('/push/delete', { endpoint });
  ok(r.s === 200, 'subscription deleted');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
