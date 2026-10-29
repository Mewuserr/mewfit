// Automatic accounts: node tests/anon.test.mjs [baseUrl]   (uses 2 automatic accounts and no sign-ups)
const BASE = process.argv[2] || 'http://127.0.0.1:8799';
let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) pass++; else { fail++; console.log('FAIL', n, x !== undefined ? JSON.stringify(x) : ''); } };
async function call(path, method = 'GET', body, token) {
  const h = {};
  if (body !== undefined) h['content-type'] = 'application/json';
  if (token) h.authorization = 'Bearer ' + token;
  const r = await fetch(BASE + '/api' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  let b = null; try { b = await r.json(); } catch (e) {}
  return { s: r.status, b };
}
const name = 'an' + Math.random().toString(36).slice(2, 8);

let r = await call('/anon', 'POST', { data: { v: 2, profile: { name: 'a' }, workouts: [], weights: [{ d: '2026-10-01', kg: 70 }], body: [], food: {}, habits: {} } });
ok(r.s === 201 && r.b.token && r.b.username === null && r.b.pin === false && /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(r.b.recoveryCode), 'automatic account: token + recovery code, no name or PIN', r.b && { ...r.b, token: !!r.b.token });
const t1 = r.b.token, rc = r.b.recoveryCode;
r = await call('/state', 'GET', undefined, t1);
ok(r.s === 200 && r.b.data.weights[0].kg === 70 && r.b.username === null && r.b.pin === false, 'data stored, still unnamed', r.b);
r = await call('/anon', 'POST', { data: [1] });
ok(r.s === 400, 'bad data refused', r);

// name it
r = await call('/name', 'POST', { username: name, pin: '111111' }, t1);
ok(r.s === 400 && r.b.code === 'weak_pin', 'weak PIN refused when naming', r);
r = await call('/name', 'POST', { username: name, pin: '583920' }, t1);
ok(r.s === 200 && r.b.username === name, 'account named', r);
r = await call('/login', 'POST', { username: name, pin: '583920' });
ok(r.s === 200 && r.b.data.weights.length === 1, 'named account logs in by name', r.s);
const r2 = await call('/anon', 'POST', { data: null });
const t2 = r2.b.token;
r = await call('/name', 'POST', { username: name.toUpperCase(), pin: '583920' }, t2);
ok(r.s === 409 && r.b.code === 'taken', 'name already taken', r);

// recovery code alone, no new PIN
r = await call('/recover', 'POST', { code: rc });
ok(r.s === 200 && r.b.token && r.b.username === name && r.b.pin === true && r.b.recoveryCode !== rc, 'recovery code alone signs in; PIN kept', r.b && { ...r.b, token: !!r.b.token, data: !!r.b.data });
const t3 = r.b.token;
r = await call('/login', 'POST', { username: name, pin: '583920' });
ok(r.s === 200, 'old PIN still works after code-only recovery', r.s);

// clean up
r = await call('/account/delete', 'POST', { pin: '583920' }, t3);
ok(r.s === 200, 'named account deleted', r);
r = await call('/account/delete', 'POST', { confirm: 'ลบ' }, t2);
ok(r.s === 200, 'unnamed account deleted with the word', r);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
