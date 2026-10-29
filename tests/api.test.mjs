// API checks against a running worker: node tests/api.test.mjs [baseUrl]
// Local: `npx wrangler d1 migrations apply mewfit --local` then `npx wrangler dev --local --port 8799`.
// Uses up to 6 sign-ups (the per-IP limit is 10 per hour), so clear ip_limits between runs.
const BASE = process.argv[2] || 'http://127.0.0.1:8799';
let pass = 0, fail = 0;
const ok = (cond, name, extra) => { if (cond) pass++; else { fail++; console.log('FAIL', name, extra !== undefined ? JSON.stringify(extra) : ''); } };
async function call(path, method = 'GET', body, token) {
  const h = {};
  if (body !== undefined) h['content-type'] = 'application/json';
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let b = null; try { b = await r.json(); } catch (e) {}
  return { s: r.status, b };
}
const rnd = Math.random().toString(36).slice(2, 8);
const u1 = 'test' + rnd, u2 = 'ทดสอบ' + rnd;

// validation
let r = await call('/signup', 'POST', { username: 'ab', pin: '482913' });
ok(r.s === 400 && r.b.code === 'bad_username', 'short username rejected', r);
r = await call('/signup', 'POST', { username: 'has space', pin: '482913' });
ok(r.s === 400, 'space in username rejected', r);
r = await call('/signup', 'POST', { username: u1, pin: '12345' });
ok(r.s === 400 && r.b.code === 'bad_pin', '5-digit pin rejected', r);
for (const weak of ['123456', '111111', '654321', '121212', '123123']) {
  r = await call('/signup', 'POST', { username: u1, pin: weak });
  ok(r.s === 400 && r.b.code === 'weak_pin', 'weak pin rejected ' + weak, r);
}
r = await fetch(BASE + '/api/signup', { method: 'POST', body: 'x' }).then(x => x.status);
ok(r === 415, 'non-json rejected', r);
r = await call('/nope');
ok(r.s === 404, 'unknown route 404', r);
r = await call('/state');
ok(r.s === 401, 'state needs auth', r);
r = await call('/state', 'GET', undefined, 'x'.repeat(43));
ok(r.s === 401, 'bad token 401', r);

// signup + state
const data1 = { v: 2, profile: { name: 'มิว' }, workouts: [], weights: [{ d: '2026-10-01', kg: 75 }], body: [], food: {}, habits: {} };
r = await call('/signup', 'POST', { username: u1.toUpperCase(), pin: '482913', data: data1 });
ok(r.s === 201 && r.b.token && r.b.username === u1 && r.b.version === 1, 'signup ok, username lowercased', r);
const t1 = r.b.token;
r = await call('/signup', 'POST', { username: u1, pin: '482913' });
ok(r.s === 409 && r.b.code === 'taken', 'duplicate username 409', r);
r = await call('/state', 'GET', undefined, t1);
ok(r.s === 200 && r.b.version === 1 && r.b.data.weights[0].kg === 75, 'state round-trips', r);

// second device logs in
r = await call('/login', 'POST', { username: u1, pin: '482913' });
ok(r.s === 200 && r.b.version === 1 && r.b.data.profile.name === 'มิว', 'login returns data', r);
const t2 = r.b.token;

// compare-and-swap
r = await call('/state', 'PUT', { data: { ...data1, n: 1 }, baseVersion: 1 }, t1);
ok(r.s === 200 && r.b.version === 2, 'put v1->v2', r);
r = await call('/state', 'PUT', { data: { ...data1, n: 2 }, baseVersion: 1 }, t2);
ok(r.s === 409 && r.b.version === 2 && r.b.data.n === 1, 'stale put gets 409 with server copy', r);
r = await call('/state', 'PUT', { data: { ...data1, n: 3 }, baseVersion: 2 }, t2);
ok(r.s === 200 && r.b.version === 3, 'put after merge ok', r);
r = await call('/state', 'PUT', { data: [1, 2], baseVersion: 3 }, t2);
ok(r.s === 400, 'array state rejected', r);
r = await call('/state', 'PUT', { data: { big: 'x'.repeat(950 * 1024) }, baseVersion: 3 }, t2);
ok(r.s === 413, 'oversized state rejected', r);
r = await call('/state', 'PUT', { data: data1, baseVersion: 'x' }, t2);
ok(r.s === 400, 'bad version rejected', r);

// thai username, null data at signup
r = await call('/signup', 'POST', { username: u2, pin: '582047' });
ok(r.s === 201 && r.b.username === u2, 'thai username ok', r);
const t3 = r.b.token;
r = await call('/state', 'GET', undefined, t3);
ok(r.s === 200 && r.b.data === null && r.b.version === 1, 'empty account state null', r);
r = await call('/state', 'GET', undefined, t1);
ok(r.b.data.n === 3, 'accounts isolated', r.b);

// wrong pin -> lockout after 5
for (let i = 1; i <= 4; i++) {
  r = await call('/login', 'POST', { username: u1, pin: '000001' });
  ok(r.s === 401 && r.b.code === 'wrong_pin', 'wrong pin ' + i, r);
}
r = await call('/login', 'POST', { username: u1, pin: '000001' });
ok(r.s === 429 && r.b.code === 'locked', '5th wrong pin locks', r);
r = await call('/login', 'POST', { username: u1, pin: '482913' });
ok(r.s === 429 && r.b.code === 'locked', 'right pin still locked', r);
r = await call('/state', 'GET', undefined, t1);
ok(r.s === 200, 'existing session unaffected by lock', r);
r = await call('/login', 'POST', { username: 'nobody' + rnd, pin: '482913' });
ok(r.s === 401 && r.b.code === 'wrong_pin', 'unknown user looks like wrong pin', r);

// change pin on device 3's account: signs out other sessions
r = await call('/login', 'POST', { username: u2, pin: '582047' });
const t4 = r.b.token;
r = await call('/pin', 'POST', { pin: '582047', newPin: '111111' }, t3);
ok(r.s === 400 && r.b.code === 'weak_pin', 'weak new pin rejected', r);
r = await call('/pin', 'POST', { pin: '582047', newPin: '739204' }, t3);
ok(r.s === 200, 'pin changed', r);
r = await call('/state', 'GET', undefined, t4);
ok(r.s === 401, 'other session signed out after pin change', r);
r = await call('/state', 'GET', undefined, t3);
ok(r.s === 200, 'own session kept after pin change', r);
r = await call('/login', 'POST', { username: u2, pin: '739204' });
ok(r.s === 200, 'login with new pin', r);

// logout
r = await call('/logout', 'POST', {}, t2);
ok(r.s === 200, 'logout', r);
r = await call('/state', 'GET', undefined, t2);
ok(r.s === 401, 'token dead after logout', r);

// delete account
r = await call('/account/delete', 'POST', { pin: '000000' }, t3);
ok(r.s === 401, 'delete needs right pin', r);
r = await call('/account/delete', 'POST', { pin: '739204' }, t3);
ok(r.s === 200, 'account deleted', r);
r = await call('/login', 'POST', { username: u2, pin: '739204' });
ok(r.s === 401, 'deleted account cannot log in', r);
r = await call('/signup', 'POST', { username: u2, pin: '582047' });
ok(r.s === 201, 'deleted username reusable', r);

// static assets still served, private files not
for (const [path, code] of [['/', 200], ['/manifest.json', 200], ['/worker.js', 404], ['/wrangler.jsonc', 404], ['/migrations/0001_init.sql', 404]]) {
  const s = await fetch(BASE + path).then(x => x.status);
  ok(s === code, `asset ${path} -> ${code}`, s);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
