// MewFit API: accounts (username + 6-digit PIN, recovery code, device pairing; optional Sign in with Google)
// and one synced state document per user.
// Everything outside /api/* is served from static assets.

const PIN_ITER = 20000;               // PBKDF2 rounds; online guessing is stopped by the lockouts below
const MAX_FAILS = 5;                  // wrong PINs in a row before the account locks
const LOCK_MS = 15 * 60 * 1000;
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX_FAILS = 30;              // wrong PINs per IP per hour, across all accounts
const IP_MAX_SIGNUPS = 10;            // new accounts per IP per hour
const SESSION_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_STATE = 900 * 1024;         // bytes of JSON per user
const OAUTH_STATE_MS = 10 * 60 * 1000; // time allowed on Google's screen
const OAUTH_CODE_MS = 2 * 60 * 1000;   // time for the page to redeem the one-time code
const PAIR_MS = 5 * 60 * 1000;         // a pairing code shown on a signed-in device lives this long
const RC_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I: easy to copy by hand

const enc = new TextEncoder();

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url);
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

async function route(req, env, url) {
  const m = req.method, path = url.pathname;
  if (path === '/api/config' && m === 'GET') return json(200, { google: googleOn(env) });
  if (path === '/api/auth/google/start' && m === 'GET') return googleStart(env, url);
  if (path === '/api/auth/google/link' && m === 'POST') return googleLink(req, env, url);
  if (path === '/api/auth/google/callback' && m === 'GET') return googleCallback(env, url);
  if (path === '/api/auth/redeem' && m === 'POST') return redeem(req, env);
  if (path === '/api/recover' && m === 'POST') return recover(req, env);
  if (path === '/api/recovery/new' && m === 'POST') return newRecovery(req, env);
  if (path === '/api/pair/start' && m === 'POST') return pairStart(req, env);
  if (path === '/api/pair/redeem' && m === 'POST') return pairRedeem(req, env);
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
  const s = await env.DB.prepare('SELECT s.user_id, s.last_seen, u.username, u.email, u.google_sub, u.pin_hash, u.recovery_hash FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(th).first();
  if (!s || now - s.last_seen > SESSION_MS) {
    if (s) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run();
    throw new HttpError(401, 'no_session', 'กรุณาเข้าสู่ระบบอีกครั้ง');
  }
  if (now - s.last_seen > 24 * 60 * 60 * 1000) await env.DB.prepare('UPDATE sessions SET last_seen = ? WHERE token_hash = ?').bind(now, th).run();
  return { userId: s.user_id, username: s.username, tokenHash: th, who: who(s) };
}

// what the page shows and which controls apply: Google accounts have no PIN unless one was set
const who = u => ({ username: u.email || u.username, google: !!u.google_sub, pin: !!u.pin_hash, recovery: !!u.recovery_hash });

/* ---------- PIN verification with lockouts ---------- */
async function verifyPin(env, req, user, pin, now) {
  const ipKey = 'fail:' + clientIp(req);
  if (await ipCount(env, ipKey, now) >= IP_MAX_FAILS) throw new HttpError(429, 'ip_limited', 'ลองผิดหลายครั้งเกินไป รอ 1 ชั่วโมงแล้วลองใหม่', { retryAfter: 3600 });
  if (user.locked_until > now) {
    const sec = Math.ceil((user.locked_until - now) / 1000);
    throw new HttpError(429, 'locked', `ใส่รหัสผิดหลายครั้ง บัญชีถูกล็อกไว้ อีก ${Math.ceil(sec / 60)} นาทีลองใหม่ได้`, { retryAfter: sec });
  }
  if (user.pin_hash && sameHex(await hashPin(pin, user.pin_salt), user.pin_hash)) {
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
  const recovery = recoveryCode();
  try {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO users (id, username, pin_hash, pin_salt, created_at, recovery_hash) VALUES (?, ?, ?, ?, ?, ?)').bind(id, username, ph, salt, now, await sha256(normRecovery(recovery))),
      env.DB.prepare('INSERT INTO states (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)').bind(id, data, now),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) throw new HttpError(409, 'taken', 'ชื่อผู้ใช้นี้มีคนใช้แล้ว ลองชื่ออื่น');
    throw e;
  }
  await ipBump(env, ipKey, now);
  const token = await newSession(env, id, now);
  return json(201, { token, username, google: false, pin: true, recovery: true, recoveryCode: recovery, version: 1, updatedAt: now });
}

async function login(req, env) {
  const b = await body(req);
  let username;
  try { username = normName(b.username); } catch (e) { throw new HttpError(401, 'wrong_pin', 'ชื่อผู้ใช้หรือรหัสไม่ถูกต้อง'); }
  const pin = checkPin(b.pin, false);
  const now = Date.now();
  const user = await env.DB.prepare('SELECT id, pin_hash, pin_salt, failed, locked_until, google_sub, email, recovery_hash FROM users WHERE username = ?').bind(username).first();
  if (!user || !user.pin_hash) {
    const ipKey = 'fail:' + clientIp(req);
    if (await ipCount(env, ipKey, now) >= IP_MAX_FAILS) throw new HttpError(429, 'ip_limited', 'ลองผิดหลายครั้งเกินไป รอ 1 ชั่วโมงแล้วลองใหม่', { retryAfter: 3600 });
    await ipBump(env, ipKey, now);
    throw new HttpError(401, 'wrong_pin', 'ชื่อผู้ใช้หรือรหัสไม่ถูกต้อง');
  }
  await verifyPin(env, req, user, pin, now);
  return json(200, await sessionPayload(env, user.id, { ...who(user), username: user.email || username }, now));
}

function stateText(v, allowNull) {
  if (v == null && allowNull) return JSON.stringify(null);
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'bad_state', 'ข้อมูลไม่ถูกต้อง');
  const t = JSON.stringify(v);
  if (enc.encode(t).length > MAX_STATE) throw new HttpError(413, 'too_big', 'ข้อมูลใหญ่เกินที่เก็บได้');
  return t;
}

async function sessionPayload(env, userId, w, now) {
  const token = await newSession(env, userId, now);
  const st = await env.DB.prepare('SELECT data, version, updated_at FROM states WHERE user_id = ?').bind(userId).first();
  return { token, ...w, version: st ? st.version : 0, updatedAt: st ? st.updated_at : 0, data: st ? JSON.parse(st.data) : null };
}

async function getState(req, env) {
  const a = await auth(req, env);
  const st = await env.DB.prepare('SELECT data, version, updated_at FROM states WHERE user_id = ?').bind(a.userId).first();
  return json(200, { ...a.who, version: st ? st.version : 0, updatedAt: st ? st.updated_at : 0, data: st ? JSON.parse(st.data) : null });
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
  const newPin = checkPin(b.newPin, true);
  const salt = hex(randomBytes(16));
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_hash = ?, pin_salt = ?, failed = 0, locked_until = 0 WHERE id = ?').bind(await hashPin(newPin, salt), salt, a.userId),
    // sign out every other device
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(a.userId, a.tokenHash),
  ]);
  return json(200, { ok: true });
}

async function deleteAccount(req, env) {
  const a = await auth(req, env);
  const b = await body(req);
  const now = Date.now();
  const user = await env.DB.prepare('SELECT id, pin_hash, pin_salt, failed, locked_until FROM users WHERE id = ?').bind(a.userId).first();
  // a PIN account proves it with the PIN; a Google-only account types the word ลบ
  if (user.pin_hash) await verifyPin(env, req, user, checkPin(b.pin, false), now);
  else if (String(b.confirm || '').trim() !== 'ลบ') throw new HttpError(400, 'confirm', 'พิมพ์คำว่า ลบ เพื่อยืนยัน');
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_codes WHERE user_id = ?').bind(a.userId),
    env.DB.prepare('DELETE FROM pair_codes WHERE user_id = ?').bind(a.userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(a.userId),
    env.DB.prepare('DELETE FROM states WHERE user_id = ?').bind(a.userId),
    env.DB.prepare('DELETE FROM users WHERE id = ?').bind(a.userId),
  ]);
  return json(200, { ok: true });
}

/* ---------- Sign in with Google (authorization-code flow) ---------- */
const googleOn = env => !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
const back = (url, q) => Response.redirect(url.origin + '/?' + q + '#profile', 302);

async function googleUrl(env, url, linkUserId) {
  const state = b64url(randomBytes(24));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_states WHERE created_at < ?').bind(now - OAUTH_STATE_MS),
    env.DB.prepare('INSERT INTO oauth_states (state, user_id, created_at) VALUES (?, ?, ?)').bind(state, linkUserId, now),
  ]);
  const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/api/auth/google/callback', response_type: 'code', scope: 'openid email profile', state, prompt: 'select_account' });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
}

async function googleStart(env, url) {
  if (!googleOn(env)) return back(url, 'g=off');
  return Response.redirect(await googleUrl(env, url, null), 302);
}

async function googleLink(req, env, url) {
  const a = await auth(req, env);
  if (!googleOn(env)) throw new HttpError(503, 'google_off', 'ยังเปิดใช้ Google ไม่ได้');
  return json(200, { url: await googleUrl(env, url, a.userId) });
}

async function googleCallback(env, url) {
  const p = url.searchParams, now = Date.now();
  if (!googleOn(env)) return back(url, 'g=off');
  const st = p.get('state') ? await env.DB.prepare('SELECT user_id, created_at FROM oauth_states WHERE state = ?').bind(p.get('state')).first() : null;
  if (st) await env.DB.prepare('DELETE FROM oauth_states WHERE state = ?').bind(p.get('state')).run();
  if (!st || now - st.created_at > OAUTH_STATE_MS) return back(url, 'g=expired');
  if (p.get('error') || !p.get('code')) return back(url, 'g=cancel');
  const tr = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code: p.get('code'), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: url.origin + '/api/auth/google/callback', grant_type: 'authorization_code' }),
  });
  const tok = await tr.json().catch(() => ({}));
  if (!tr.ok || !tok.id_token) return back(url, 'g=fail');
  // the id_token came straight from Google's token endpoint over TLS, so its payload is trusted after the claim checks
  let c;
  try { c = JSON.parse(atob(tok.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch (e) { return back(url, 'g=fail'); }
  if (c.aud !== env.GOOGLE_CLIENT_ID || !/^(https:\/\/)?accounts\.google\.com$/.test(c.iss) || !c.sub || c.exp * 1000 < now) return back(url, 'g=fail');
  const email = c.email_verified ? String(c.email || '').toLowerCase() : null;
  const owner = await env.DB.prepare('SELECT id FROM users WHERE google_sub = ?').bind(c.sub).first();
  if (st.user_id) {
    if (owner && owner.id !== st.user_id) return back(url, 'g=taken');
    await env.DB.prepare('UPDATE users SET google_sub = ?, email = ? WHERE id = ?').bind(c.sub, email, st.user_id).run();
    return back(url, 'g=linked');
  }
  let id = owner && owner.id;
  if (!id) {
    id = crypto.randomUUID();
    const handle = 'g' + hex(randomBytes(6));   // internal; Google accounts sign in without it
    await env.DB.batch([
      env.DB.prepare("INSERT INTO users (id, username, pin_hash, pin_salt, created_at, google_sub, email) VALUES (?, ?, '', '', ?, ?, ?)").bind(id, handle, now, c.sub, email),
      env.DB.prepare('INSERT INTO states (user_id, data, version, updated_at) VALUES (?, ?, 1, ?)').bind(id, 'null', now),
    ]);
  } else if (email) await env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, id).run();
  const code = b64url(randomBytes(24));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM oauth_codes WHERE created_at < ?').bind(now - OAUTH_CODE_MS),
    env.DB.prepare('INSERT INTO oauth_codes (code, user_id, created_at) VALUES (?, ?, ?)').bind(code, id, now),
  ]);
  return back(url, 'gauth=' + code);
}

async function redeem(req, env) {
  const b = await body(req);
  const code = String(b.code || '');
  const now = Date.now();
  const r = /^[A-Za-z0-9_-]{20,64}$/.test(code) ? await env.DB.prepare('SELECT user_id, created_at FROM oauth_codes WHERE code = ?').bind(code).first() : null;
  if (r) await env.DB.prepare('DELETE FROM oauth_codes WHERE code = ?').bind(code).run();
  if (!r || now - r.created_at > OAUTH_CODE_MS) throw new HttpError(400, 'bad_code', 'ลิงก์เข้าสู่ระบบหมดอายุ ลองกดเข้าสู่ระบบด้วย Google อีกครั้ง');
  const u = await env.DB.prepare('SELECT username, email, google_sub, pin_hash, recovery_hash FROM users WHERE id = ?').bind(r.user_id).first();
  if (!u) throw new HttpError(400, 'bad_code', 'ไม่พบบัญชีนี้แล้ว');
  return json(200, await sessionPayload(env, r.user_id, who(u), now));
}

/* ---------- recovery code (shown once, only its hash kept) ---------- */
function recoveryCode() {
  const b = randomBytes(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += RC_ALPHABET[b[i] % RC_ALPHABET.length] + (i % 4 === 3 && i < 15 ? '-' : '');
  return out;   // 16 characters from 32 symbols: 80 bits
}
const normRecovery = v => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');   // dashes and spaces optional

async function newRecovery(req, env) {
  const a = await auth(req, env);
  const code = recoveryCode();
  await env.DB.prepare('UPDATE users SET recovery_hash = ? WHERE id = ?').bind(await sha256(normRecovery(code)), a.userId).run();
  return json(200, { recoveryCode: code });
}

// forgot the PIN: username + recovery code sets a new PIN, signs out every other device and signs this one in
async function recover(req, env) {
  const b = await body(req);
  const newPin = checkPin(b.newPin, true);
  const now = Date.now();
  const ipKey = 'fail:' + clientIp(req);
  if (await ipCount(env, ipKey, now) >= IP_MAX_FAILS) throw new HttpError(429, 'ip_limited', 'ลองผิดหลายครั้งเกินไป รอ 1 ชั่วโมงแล้วลองใหม่', { retryAfter: 3600 });
  let username;
  try { username = normName(b.username); } catch (e) { username = ''; }
  const user = username ? await env.DB.prepare('SELECT id, username, email, google_sub, recovery_hash FROM users WHERE username = ?').bind(username).first() : null;
  const given = normRecovery(b.code);
  if (!user || !user.recovery_hash || given.length !== 16 || !sameHex(await sha256(given), user.recovery_hash)) {
    await ipBump(env, ipKey, now);
    throw new HttpError(401, 'bad_recovery', 'ชื่อผู้ใช้หรือรหัสกู้คืนไม่ถูกต้อง');
  }
  const salt = hex(randomBytes(16));
  const fresh = recoveryCode();   // the used code is spent; hand out the next one
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pin_hash = ?, pin_salt = ?, failed = 0, locked_until = 0, recovery_hash = ? WHERE id = ?').bind(await hashPin(newPin, salt), salt, await sha256(normRecovery(fresh)), user.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
  ]);
  return json(200, { ...(await sessionPayload(env, user.id, { username: user.email || user.username, google: !!user.google_sub, pin: true, recovery: true }, now)), recoveryCode: fresh });
}

/* ---------- pairing a new device from a signed-in one ---------- */
async function pairStart(req, env) {
  const a = await auth(req, env);
  const now = Date.now();
  await env.DB.prepare('DELETE FROM pair_codes WHERE created_at < ? OR user_id = ?').bind(now - PAIR_MS, a.userId).run();
  for (let i = 0; i < 5; i++) {
    const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1000000;
    const code = String(n).padStart(6, '0');
    const r = await env.DB.prepare('INSERT INTO pair_codes (code, user_id, created_at) VALUES (?, ?, ?) ON CONFLICT(code) DO NOTHING').bind(code, a.userId, now).run();
    if (r.meta.changes === 1) return json(200, { code, expiresIn: PAIR_MS / 1000 });
  }
  throw new HttpError(503, 'busy', 'ระบบไม่ว่าง ลองใหม่อีกครั้ง');
}

async function pairRedeem(req, env) {
  const b = await body(req);
  const code = String(b.code || '').replace(/\D/g, '');
  const now = Date.now();
  const ipKey = 'fail:' + clientIp(req);
  if (await ipCount(env, ipKey, now) >= IP_MAX_FAILS) throw new HttpError(429, 'ip_limited', 'ลองผิดหลายครั้งเกินไป รอ 1 ชั่วโมงแล้วลองใหม่', { retryAfter: 3600 });
  const r = code.length === 6 ? await env.DB.prepare('SELECT user_id, created_at FROM pair_codes WHERE code = ?').bind(code).first() : null;
  if (!r || now - r.created_at > PAIR_MS) {
    await ipBump(env, ipKey, now);
    throw new HttpError(400, 'bad_pair', 'รหัสจับคู่ไม่ถูกต้องหรือหมดอายุ ขอรหัสใหม่จากเครื่องที่เข้าสู่ระบบอยู่');
  }
  await env.DB.prepare('DELETE FROM pair_codes WHERE code = ?').bind(code).run();
  const u = await env.DB.prepare('SELECT username, email, google_sub, pin_hash, recovery_hash FROM users WHERE id = ?').bind(r.user_id).first();
  if (!u) throw new HttpError(400, 'bad_pair', 'ไม่พบบัญชีนี้แล้ว');
  return json(200, await sessionPayload(env, r.user_id, who(u), now));
}
