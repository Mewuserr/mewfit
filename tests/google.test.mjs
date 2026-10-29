// Google sign-in plumbing without Google: node tests/google.test.mjs [baseUrl]
// Needs the local worker running with GOOGLE_CLIENT_ID/SECRET set in .dev.vars, and the local D1 migrated.
// Simulates Google's return by planting a one-time code with `wrangler d1 execute --local` (the step only Google can do).
import { execSync } from 'node:child_process';
const BASE = process.argv[2] || 'http://127.0.0.1:8799';
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x) : ''); } };
const sql = q => execSync(`npx wrangler d1 execute mewfit --local --command "${q}"`, { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
async function call(path, method = 'GET', body, token, redirect = 'follow') {
  const h = {};
  if (body !== undefined) h['content-type'] = 'application/json';
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect });
  let b = null; try { b = await r.json(); } catch (e) {}
  return { s: r.status, b, loc: r.headers.get('location') };
}

let r = await call('/config');
ok(r.s === 200 && r.b.google === true, 'config says google on', r);

r = await call('/auth/google/start', 'GET', undefined, null, 'manual');
const u = r.loc ? new URL(r.loc) : null;
ok(r.s === 302 && u && u.host === 'accounts.google.com', 'start redirects to Google', r);
ok(u && u.searchParams.get('redirect_uri') === BASE + '/api/auth/google/callback', 'redirect_uri points back here', u && u.searchParams.get('redirect_uri'));
ok(u && u.searchParams.get('scope') === 'openid email profile' && u.searchParams.get('state').length >= 30, 'scope and state set');

r = await call('/auth/google/callback?state=nope&code=x', 'GET', undefined, null, 'manual');
ok(r.s === 302 && r.loc.endsWith('/?g=expired#profile'), 'unknown state rejected', r.loc);
const st = u.searchParams.get('state');
r = await call(`/auth/google/callback?state=${st}&error=access_denied`, 'GET', undefined, null, 'manual');
ok(r.s === 302 && r.loc.endsWith('/?g=cancel#profile'), 'user cancel handled', r.loc);
r = await call(`/auth/google/callback?state=${st}&code=x`, 'GET', undefined, null, 'manual');
ok(r.loc && r.loc.endsWith('/?g=expired#profile'), 'state is single-use', r.loc);

r = await call('/auth/redeem', 'POST', { code: 'x'.repeat(32) });
ok(r.s === 400 && r.b.code === 'bad_code', 'unknown code rejected', r);
r = await call('/auth/google/link', 'POST', {});
ok(r.s === 401, 'link needs a session', r);

// a Google account as the callback would have created it
const id = 'gtest-' + Date.now(), code = 'C' + Date.now() + 'abcdefghijklmnopq';
sql(`INSERT INTO users (id, username, pin_hash, pin_salt, created_at, google_sub, email) VALUES ('${id}', 'g${Date.now()}', '', '', 0, 'sub-${id}', 'mew@example.com'); INSERT INTO states (user_id, data, version, updated_at) VALUES ('${id}', 'null', 1, 0); INSERT INTO oauth_codes (code, user_id, created_at) VALUES ('${code}', '${id}', ${Date.now()})`);
r = await call('/auth/redeem', 'POST', { code });
ok(r.s === 200 && r.b.token && r.b.username === 'mew@example.com' && r.b.google === true && r.b.pin === false, 'redeem gives a session', r.b && { ...r.b, token: !!r.b.token });
const t = r.b.token;
r = await call('/auth/redeem', 'POST', { code });
ok(r.s === 400, 'code is single-use', r);
r = await call('/state', 'GET', undefined, t);
ok(r.s === 200 && r.b.google === true && r.b.username === 'mew@example.com', 'state reports google account', r.b);
r = await call('/state', 'PUT', { data: { v: 2, n: 1 }, baseVersion: 1 }, t);
ok(r.s === 200 && r.b.version === 2, 'google account syncs', r);
r = await call('/pin', 'POST', { pin: '000000', newPin: '582947' }, t);
ok(r.s === 400 && r.b.code === 'no_pin', 'google-only account has no pin to change', r);
r = await call('/login', 'POST', { username: 'mew@example.com', pin: '000000' });
ok(r.s === 401, 'pin login refused for google-only account', r);
r = await call('/auth/google/link', 'POST', {}, t);
ok(r.s === 200 && r.b.url.startsWith('https://accounts.google.com/'), 'link returns a Google url', r);
r = await call('/account/delete', 'POST', { confirm: 'no' }, t);
ok(r.s === 400 && r.b.code === 'confirm', 'delete needs the word', r);
r = await call('/account/delete', 'POST', { confirm: 'ลบ' }, t);
ok(r.s === 200, 'google account deleted', r);
r = await call('/state', 'GET', undefined, t);
ok(r.s === 401, 'session gone after delete', r);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
