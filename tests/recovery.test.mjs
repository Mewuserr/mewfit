// Recovery code and device pairing: node tests/recovery.test.mjs [baseUrl]
// Uses 1 sign-up; clear ip_limits between runs (see api.test.mjs).
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
const user = 'rec' + Math.random().toString(36).slice(2, 8);

let r = await call('/signup', 'POST', { username: user, pin: '582947', data: { v: 2, profile: { name: 'r' }, workouts: [], weights: [], body: [], food: {}, habits: {} } });
ok(r.s === 201 && /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(r.b.recoveryCode) && r.b.recovery === true, 'signup returns a recovery code', r.b && r.b.recoveryCode);
const t1 = r.b.token, rc = r.b.recoveryCode;
r = await call('/login', 'POST', { username: user, pin: '582947' });
const t2 = r.b.token;
ok(r.s === 200 && r.b.recovery === true && !r.b.recoveryCode, 'login reports a recovery code exists, never the code', r.b && Object.keys(r.b));

// forgot the PIN
r = await call('/recover', 'POST', { username: user, code: 'AAAA-BBBB-CCCC-DDDD', newPin: '739204' });
ok(r.s === 401 && r.b.code === 'bad_recovery', 'wrong recovery code refused', r);
r = await call('/recover', 'POST', { username: user, code: rc, newPin: '123456' });
ok(r.s === 400 && r.b.code === 'weak_pin', 'weak new pin refused', r);
r = await call('/recover', 'POST', { username: user.toUpperCase(), code: rc.toLowerCase().replace(/-/g, ' '), newPin: '739204' });
ok(r.s === 200 && r.b.token && r.b.data.profile.name === 'r' && r.b.recoveryCode && r.b.recoveryCode !== rc, 'recover with lowercase/spaced code signs in and issues a new code', r.b && { ...r.b, token: !!r.b.token, data: !!r.b.data });
const t3 = r.b.token, rc2 = r.b.recoveryCode;
r = await call('/state', 'GET', undefined, t1);
ok(r.s === 401, 'old sessions signed out after recovery', r);
r = await call('/recover', 'POST', { username: user, code: rc, newPin: '739204' });
ok(r.s === 401, 'used recovery code no longer works', r);
r = await call('/login', 'POST', { username: user, pin: '582947' });
ok(r.s === 401, 'old pin no longer works', r);
r = await call('/login', 'POST', { username: user, pin: '739204' });
ok(r.s === 200, 'new pin works', r);

// regenerate the recovery code
r = await call('/recovery/new', 'POST', {}, t3);
ok(r.s === 200 && r.b.recoveryCode && r.b.recoveryCode !== rc2, 'new recovery code issued', r);
const rc3 = r.b.recoveryCode;
r = await call('/recover', 'POST', { username: user, code: rc2, newPin: '739204' });
ok(r.s === 401, 'previous code replaced', r);

// set a new PIN from a signed-in device without the old one
r = await call('/pin', 'POST', { newPin: '846201' }, t3);
ok(r.s === 200, 'pin reset from signed-in device', r);
r = await call('/login', 'POST', { username: user, pin: '846201' });
ok(r.s === 200, 'reset pin works', r);

// pair a new device
r = await call('/pair/start', 'POST', {});
ok(r.s === 401, 'pairing needs a session', r);
r = await call('/pair/start', 'POST', {}, t3);
ok(r.s === 200 && /^\d{6}$/.test(r.b.code) && r.b.expiresIn === 300, 'pair code issued', r);
const pc = r.b.code;
r = await call('/pair/redeem', 'POST', { code: '000000' === pc ? '000001' : '000000' });
ok(r.s === 400 && r.b.code === 'bad_pair', 'wrong pair code refused', r);
r = await call('/pair/redeem', 'POST', { code: pc.slice(0, 3) + ' ' + pc.slice(3) });
ok(r.s === 200 && r.b.token && r.b.username === user && r.b.data.profile.name === 'r', 'pair code (with a space) signs the new device in', r.b && { ...r.b, token: !!r.b.token, data: !!r.b.data });
r = await call('/pair/redeem', 'POST', { code: pc });
ok(r.s === 400, 'pair code is single-use', r);
r = await call('/pair/start', 'POST', {}, t3);
const pc2 = r.b.code;
r = await call('/pair/start', 'POST', {}, t3);
r = await call('/pair/redeem', 'POST', { code: pc2 });
ok(r.s === 400, 'asking for a new pair code cancels the previous one', r);

// clean up
r = await call('/account/delete', 'POST', { pin: '846201' }, t3);
ok(r.s === 200, 'account deleted', r);
r = await call('/recover', 'POST', { username: user, code: rc3, newPin: '739204' });
ok(r.s === 401, 'no recovery for a deleted account', r);

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
