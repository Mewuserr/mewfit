// MewFit API: accounts (username + 6-digit PIN) and one synced state document per user.
// Everything outside /api/* is served from static assets.

const PIN_ITER = 20000;               // PBKDF2 rounds; online guessing is stopped by the lockouts below
const MAX_FAILS = 5;                  // wrong PINs in a row before the account locks
const LOCK_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX_FAILS = 30;              // wrong PINs per IP per hour, across all accounts
const IP_MAX_SIGNUPS = 10;            // new accounts per IP per hour
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_STATE = 900 * 1024;         // bytes of JSON per user

const enc = new TextEncoder();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url.pathname);
    } catch (e) {
      if (e instanceof HttpError) return json(e.status, { error: e.message, code: e.code, ...e.extra });
      console.error(e);
      return json(500, { error: 'ระบบขัดข้อง ลองใหม่อีกครั้ง', code: 'server' });
    }
  },
};

class HttpError extends Error {
  constructor(status, code, message, extra = {}) { super(message); this.status = status; this.code = code; this.extra = extra; }
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

async function route(req, env, path) {
  const m = req.method;
  if (path === '/api/signup' && m === 'POST') return signup(req, env);
  if (path === '/api/login' && m === 'POST') return login(req, env);
  if (path === '/api/state' && m === 'GET') return getState(req, env);
  if (path === '/api/state' && m === 'PUT') return putState(req, env);
  if (path === '/api/logout' && m === 'POST') return logout(req, env);
  if (path === '/api/pin' && m === 'POST') return changePin(req, env);
  if (path === '/api/account/delete' && m === 'POST') return deleteAccount(req, env);
  throw new HttpError(404, 'not_found', 'ไม่พบหน้านี้');
}

/* ---------- input ---------- */
async function body(req) {
  if (!(req.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'bad_type', 'รูปแบบข้อมูลไม่ถูกต้อง');
  const text = await req.text();
  if (text.length > MAX_STATE + 4096) throw new HttpError(413, 'too_big', 'ข้อมูลใหญ่เกินไป');
  try { const o = JSON.parse(text); if (o && typeof o === 'object') return o; } catch (e) {}
  throw new HttpError(400, 'bad_json', 'รูปแบบข้อมูลไม่ถูกต้อง');
}

function normName(v) {
  const s = String(v ?? '').normalize('NFC').trim().toLowerCase();
  if (!/^[\p{L}\p{M}\p{N}_.-]{3,20}$/u.test(s)) throw new HttpError(400, 'bad_username', 'ชื่อผู้ใช้ต้องยาว 3–20 ตัว ใช้ตัวอักษร ตัวเลข _ . - ได้ ห้ามเว้นวรรค');
  return s;
}

function checkPin(v, forNew) {
  const p = String(v ?? '');
  if (!/^\d{6}$/.test(p)) throw new HttpError(400, 'bad_pin', 'รหัสต้องเป็นตัวเลข 6 หลัก');
  if (forNew && weakPin(p)) throw new HttpError(400, 'weak_pin', 'รหัสนี้เดาง่ายเกินไป เช่น 123456 หรือ 111111 ลองตัวเลขอื่น');
  return p;
}

function weakPin(p) {
  if (/^(\d)\1{5}$/.test(p)) return true;
  const d = [...p].map(Number);
  const step = d[1] - d[0];
  if ((step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step)) return true;
  if (/^(\d\d)\1\1$/.test(p) || /^(\d{3})\1$/.test(p)) return true;
  return false;
}

/* ---------- crypto ---------- */
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const randomBytes = n => crypto.getRandomValues(new Uint8Array(n));
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

async function hashPin(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PIN_ITER }, key, 256));
}

function sameHex(a, b) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

/* ---------- rate limits ---------- */
function clientIp(req) { return req.headers.get('cf-connecting-ip') || 'local'; }

async function ipCount(env, key, now) {
  const r = await env.DB.prepare('SELECT count, window_start FROM ip_limits WHERE key = ?').bind(key).first();
  return r && now - r.window_start < IP_WINDOW_MS ? r.count : 0;
}

async function ipBump(env, key, now) {
  await env.DB.prepare(`INSERT INTO ip_limits (key, count, window_start) VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN ?2 - window_start < ?3 THEN count + 1 ELSE 1 END,
      window_start = CASE WHEN ?2 - window_start < ?3 THEN window_start ELSE ?2 END`)
    .bind(key, now, IP_WINDOW_MS).run();
}

/* ---------- sessions ---------- */
async function newSession(env, userId, now) {
  const token = b64url(randomBytes(32));
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, last_seen) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now).run();
  return token;
}

async function auth(req, env) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.get('authorization') || '');
  if (!m) throw new HttpError(401, 'no_session', 'กรุณาเข้าสู่ระบบอีกครั้ง');
  const th = await sha256(m[1]);
  const now = Date.now();
  const s = await env.DB.prepare('SELECT s.user_id, s.last_seen, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(th).first();
  if (!s || now - s.last_seen > SESSION_MS) {
    if (s) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run();
    throw new HttpError(401, 'no_session', 'กรุณาเข้าสู่ระบบอีกครั้ง');
  }
  if (now - s.last_seen > 24 * 60 * 60 * 1000) await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(now, th).run();
  return { userId: s.user_id, username: s.username, tokenHash: th };
}

/* ---------- PIN verification with lockouts ---------- */
async function verifyPin(env, req, user, pin, now) {
  const ipKey = 'fail:' + clientIp(req);
  if (await ipCount(env, ipKey, now) >= IP_MAX_FAILS) throw new HttpError(429, 'ip_limited', 'ลองผิดหลายครั้งเกินไป รอ 1 ชั่วโมงแล้วลองใหม่', { retryAfter: 3600 });
  if (user.locked_until > now) {
    const sec = Math.ceil((user.locked_until - now) / 1000);
    throw new HttpError(429, 'locked', `ใส่รหัสผิดหลายครั้ง บัญชีถูกล็อกไว้ อีก ${Math.ceil(sec / 60)} นาทีลองใหม่ได้`, { retryAfter: sec });
  }
  if (sameHex(await hashPin(pin, user.pin_salt), user.pin_hash)) {
    if (user.failed) await env.DB.prepare('UPDATE users SET failed = 0, locked_until = 0 WHERE id = ?').bind(user.id).run();
    return;
  }
  await ipBump(env, ipKey, now);
  const failed = user.failed + 1;
  if (failed >= MAX_FAILS) {
    await env.DB.prepare('UPDATE users SET failed = 0, locked_until = ? WHERE id = ?').bind(now + LOCK_MS, user.id).run();
    throw new HttpError(429, 'locked', 'ใส่รหัสผิด 5 ครั้ง บัญชีถูกล็อกไว้ 15 นาที', { retryAfter: LOCK_MS / 1000 });
  }
  await env.DB.prepare('UPDATE users SET failed = ? WHERE id = ?').bind(failed, user.id).run();
  throw new HttpError(401, 'wrong_pin', `ชื่อผู้ใช้หรือรหัสไม่ถูกต้อง (เหลืออีก ${MAX_FAILS - failed} ครั้งก่อนล็อก)`);
}

/* ---------- handlers ---------- */
async function signup(req, env) {
  const b = await body(req);
  const username = normName(b.username);
  const pin = checkPin(b.pin, true);
  const data = stateText(b.data, true);
  const now = Date.now();
  const ipKey = 'signup:' + clientIp(req);
  if (await ipCount(env, ipKey, now) >= IP_MAX_SIGNUPS) throw new HttpError(429, 'ip_limited', 'สมัครหลายบัญชีเกินไป รอ 1 ชั่วโมงแล้วลองใหม่', { retryAfter: 3600 });
  const id = crypto.randomUUID();
  const salt = hex(randomBytes(16));
  const ph = await hashPin(pin, salt);
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, username, pin_hash, pin_salt, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, username, ph, salt, now),
      env.DB.prepare('INSERT INTO states (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)').bind(id, data, now),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, 'taken', 'ชื่อผู้ใช้นี้มีคนใช้แล้ว ลองชื่ออื่น');
    throw e;
  }
  await ipBump(env, ipKey, now);
  const token = await newSession(env, id, now);
  return json(201, { token, username, version: 1, updatedAt: now });
}

async function login(req, env) {
  const b = await body(req);
  let username;
  try { username = normName(b.username); } catch (e) { throw new HttpError(401, 'wrong_pin', 'ชื่อผู้ใช้หรือรหัสไม่ถูกต้อง'); }
  const pin = checkPin(b.pin, false);
  const now = Date.now();
  const user = await env.DB.prepare('SELECT id, pin_hash, pin_salt, failed, locked_until FROM users WHERE username = ?').bind(username).first();
  if (!user) {
    const ipKey = 'fail:' + clientIp(req);
    if (await ipCount(env, ipKey, now) >= IP_MAX_FAILS) throw new HttpError(429, 'ip_limited', 'ลองผิดหลายครั้งเกินไป รอ 1 ชั่วโมงแล้วลองใหม่', { retryAfter: 3600 });
    await ipBump(env, ipKey, now);
    throw new HttpError(401, 'wrong_pin', 'ชื่อผู้ใช้หรือรหัสไม่ถูกต้อง');
  }
  await verifyPin(env, req, user, pin, now);
  const token = await newSession(env, user.id, now);
  const st = await env.DB.prepare('SELECT data, version, updated_at FROM states WHERE user_id = ?').bind(user.id).first();
  return json(200, { token, username, version: st ? st.version : 0, updatedAt: st ? st.updated_at : 0, data: st ? JSON.parse(st.data) : null });
}

function stateText(v, allowNull) {
  if (v == null && allowNull) return JSON.stringify(null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'bad_state', 'ข้อมูลไม่ถูกต้อง');
  const t = JSON.stringify(v);
  if (enc.encode(t).length > MAX_STATE) throw new HttpError(413, 'too_big', 'ข้อมูลใหญ่เกินที่เก็บได้');
  return t;
}

async function getState(req, env) {
  const a = await auth(req, env);
  const st = await env.DB.prepare('SELECT data, version, updated_at FROM states WHERE user_id = ?').bind(a.userId).first();
  return json(200, { username: a.username, version: st ? st.version : 0, updatedAt: st ? st.updated_at : 0, data: st ? JSON.parse(st.data) : null });
}

async function putState(req, env) {
  const a = await auth(req, env);
  const b = await body(req);
  const base = Number(b.baseVersion);
  if (!Number.isInteger(base) || base < 0) throw new HttpError(400, 'bad_version', 'ข้อมูลไม่ถูกต้อง');
  const data = stateText(b.data, false);
  const now = Date.now();
  // compare-and-swap on version: a stale device gets 409 and must merge first
  const r = base === 0
    ? await env.DB.prepare('INSERT INTO states (user_id, data, version, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id) DO NOTHING')
      .bind(a.userId, data, now).run()
    : await env.DB.prepare('UPDATE states SET data = ?, version = version + 1, updated_at = ? WHERE user_id = ? AND version = ?')
      .bind(data, now, a.userId, base).run();
  if (r.meta.changes === 1) return json(200, { version: base + 1, updatedAt: now });
  const st = await env.DB.prepare('SELECT data, version, updated_at FROM states WHERE user_id = ?').bind(a.userId).first();
  return json(409, { code: 'conflict', error: 'ข้อมูลในเครื่องอื่นใหม่กว่า', version: st ? st.version : 0, updatedAt: st ? st.updated_at : 0, data: st ? JSON.parse(st.data) : null });
}

async function logout(req, env) {
  const a = await auth(req, env);
  await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(a.tokenHash).run();
  return json(200, { ok: true });
}

async function changePin(req, env) {
  const a = await auth(req, env);
  const b = await body(req);
  const pin = checkPin(b.pin, false);
  const newPin = checkPin(b.newPin, true);
  const now = Date.now();
  const user = await env.DB.prepare('SELECT id, pin_hash, pin_salt, failed, locked_until FROM users WHERE id = ?').bind(a.userId).first();
  await verifyPin(env, req, user, pin, now);
  const salt = hex(randomBytes(16));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_hash = ?, pin_salt = ? WHERE id = ?').bind(await hashPin(newPin, salt), salt, a.userId),
    // sign out every other device
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(a.userId, a.tokenHash),
  ]);
  return json(200, { ok: true });
}

async function deleteAccount(req, env) {
  const a = await auth(req, env);
  const b = await body(req);
  const pin = checkPin(b.pin, false);
  const now = Date.now();
  const user = await env.DB.prepare('SELECT id, pin_hash, pin_salt, failed, locked_until FROM users WHERE id = ?').bind(a.userId).first();
  await verifyPin(env, req, user, pin, now);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(a.userId),
    env.DB.prepare('DELETE FROM states WHERE user_id = ?').bind(a.userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(a.userId),
  ]);
  return json(200, { ok: true });
}
