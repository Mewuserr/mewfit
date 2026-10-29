// Multi-device account and sync check in a real browser: node tests/sync.e2e.cjs [baseUrl] [shotDir]
// Needs puppeteer-core and a Chrome; set CHROME to its path. Deletes its own account at the end.
const puppeteer = require('puppeteer-core');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8799';
const SHOTS = process.argv[3] || '';
const CHROME = process.env.CHROME;
let pass = 0, fail = 0;
const ok = (c, name, x) => { if (c) pass++; else { fail++; console.log('FAIL', name, x !== undefined ? JSON.stringify(x) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
// poll until fn() is truthy (network round trips to production take longer than to localhost)
const until = async (fn, ms = 10000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(250); } return false; };
const user = 'e2e' + Math.random().toString(36).slice(2, 8), PIN = '583920';

async function device(browser) {
  const ctx = await browser.createBrowserContext();
  const pg = await ctx.newPage();
  await pg.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  pg.errs = [];
  pg.on('pageerror', e => pg.errs.push(e.message));
  return pg;
}
const state = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('mewfit.v1') || 'null'));
const sync = async pg => (await pg.evaluate(() => JSON.parse(localStorage.getItem('mewfit.sync') || 'null'))) || {};
const click = async (pg, sel) => { await pg.$eval(sel, el => el.scrollIntoView({ block: 'center' })); await pg.click(sel); };
async function fillAndSubmit(pg, fields) {
  for (const [name, v] of Object.entries(fields)) {
    await pg.$eval(`#acct form [name="${name}"]`, el => { el.value = ''; });
    await pg.type(`#acct form [name="${name}"]`, v);
  }
  // the floating nav covers the bottom of the screen; bring the button to the middle first, like a thumb scroll
  await click(pg, '#acct form button:not([type="button"])');
}
async function addWeight(pg, d, kg) {
  await pg.evaluate(() => { location.hash = 'progress'; }); await wait(300);
  await pg.$eval('#w-d', (el, v) => { el.value = v; }, d);
  await pg.type('#w-kg', String(kg));
  await click(pg, '[data-act="w-add"]');
}
async function shot(pg, name) { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  let lastToken = null;
  try {
    // a phone that only browses the demo gets no account
    const G = await device(browser);
    await G.goto(BASE + '/'); await wait(1500);
    ok(!(await sync(G)).token, 'no account for an empty device');

    // device A: has a local profile -> account appears by itself, nothing typed
    const A = await device(browser);
    await A.goto(BASE + '/');
    await A.evaluate(() => localStorage.setItem('mewfit.v1', JSON.stringify({ v: 2, seenDemo: true, guideDone: true, profile: { name: 'มิว', days: [1, 3, 5], minutes: 30 }, weights: [{ d: '2026-10-20', kg: 76 }] })));
    await A.reload();
    ok(await until(async () => (await sync(A)).token), 'A got an automatic account', await sync(A));
    let sy = await sync(A);
    lastToken = sy.token;
    ok(/^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/.test(sy.rcPending) && !sy.pin && !sy.user, 'recovery code kept to show, no name or PIN', sy);
    const rc = sy.rcPending;
    await A.evaluate(() => { location.hash = 'today'; }); await wait(400);
    ok(await A.$('.banner a[href="#profile"]') !== null, 'today reminds to keep the recovery code');
    await A.evaluate(() => { location.hash = 'profile'; }); await wait(500);
    ok(((await A.$eval('#acct .rc-box code', el => el.textContent).catch(() => '')) === rc), 'profile shows the recovery code');
    await A.$eval('#acct', el => el.scrollIntoView());
    await shot(A, 'acct-auto');
    await A.$eval('[data-act="acct-rc-done"]', el => el.click()); await wait(200);
    ok(!(await sync(A)).rcPending && await A.$('#acct .rc-box') === null, 'recovery code put away');

    // A logs a weight -> pushed
    await addWeight(A, '2026-10-25', 75.4);
    ok(await until(async () => { const x = await sync(A); return x.version === 2 && !x.dirty; }), 'A change pushed', await sync(A));

    // A optionally sets a username + PIN
    await A.evaluate(() => { location.hash = 'profile'; }); await wait(300);
    await A.$eval('[data-act="acct-open"][data-o="name"]', el => el.click()); await wait(200);
    await fillAndSubmit(A, { username: user, pin: PIN, pin2: '583921' }); await wait(300);
    ok((await A.$eval('#acct', el => el.textContent)).includes('ไม่ตรงกัน'), 'pin mismatch message');
    await fillAndSubmit(A, { username: user, pin: PIN, pin2: PIN });
    ok(await until(async () => (await sync(A)).user === user), 'A named the account', await sync(A));

    // device B: logs in by name + PIN from the welcome screen
    const B = await device(browser);
    await B.goto(BASE + '/'); await wait(1200);
    await click(B, '[data-act="acct-login"]'); await wait(800);
    ok(B.url().endsWith('#profile'), 'welcome sign-in button goes to profile', B.url());
    await click(B, '[data-act="acct-mode"][data-m="login"]'); await wait(200);
    await fillAndSubmit(B, { username: user.toUpperCase(), pin: PIN });
    ok(await until(async () => { const x = await state(B); return x && x.profile && x.weights.length === 2; }), 'B got A data', await state(B));

    // both edit while A is offline -> merge keeps both
    await A.setOfflineMode(true);
    await addWeight(A, '2026-10-26', 75.1);
    await wait(2600);
    ok((await sync(A)).dirty === true, 'A offline change kept dirty', await sync(A));
    await addWeight(B, '2026-10-27', 74.9);
    ok(await until(async () => !(await sync(B)).dirty), 'B pushed', await sync(B));
    await A.setOfflineMode(false);
    await A.evaluate(() => window.dispatchEvent(new Event('online')));
    ok(await until(async () => (await state(A)).weights.length === 4 && !(await sync(A)).dirty), 'A merged both offline edits', (await state(A)).weights);
    await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    ok(await until(async () => (await state(B)).weights.length === 4), 'B pulled merged data', (await state(B)).weights);

    // wrong pin on a third device shows the server message
    const C = await device(browser);
    await C.goto(BASE + '/#profile'); await wait(1200);
    await click(C, '[data-act="acct-mode"][data-m="login"]'); await wait(300);
    await fillAndSubmit(C, { username: user, pin: '000000' });
    ok(await until(async () => (await C.$eval('#acct', el => el.textContent)).includes('ไม่ถูกต้อง'), 4000), 'wrong pin message shown');

    // pair a new device from A: QR link, then the 6 digits
    await A.evaluate(() => { location.hash = 'profile'; }); await wait(500);
    await A.$eval('[data-act="acct-pair"]', el => el.click());
    await until(() => A.$('#acct .pair-code'));
    await wait(800);   // QR library load
    const pc = (await A.$eval('#acct .pair-code', el => el.textContent)).replace(/\D/g, '');
    ok(/^\d{6}$/.test(pc) && await A.$('#pair-qr svg') !== null, 'pair code and QR shown on A', pc);
    await A.$eval('#acct .pair-box', el => el.scrollIntoView({ block: 'center' }));
    await shot(A, 'acct-pair');
    const D = await device(browser);
    await D.goto(BASE + '/?pair=' + pc + '#profile');
    ok(await until(async () => { const x = await state(D); return x && x.weights && x.weights.length === 4; }), 'QR link signs the new device in with the data', await sync(D));
    ok(!D.url().includes('pair='), 'pair code removed from the address bar', D.url());
    await A.$eval('[data-act="acct-pair"]', el => el.click());
    await until(async () => { const t = await A.$eval('#acct .pair-code', el => el.textContent).catch(() => ''); return t && t.replace(/\D/g, '') !== pc; });
    const pc2 = (await A.$eval('#acct .pair-code', el => el.textContent)).replace(/\D/g, '');
    const E = await device(browser);
    await E.goto(BASE + '/#profile'); await wait(1200);
    await fillAndSubmit(E, { code: pc2 });   // pairing is the default way in
    ok(await until(async () => { const x = await state(E); return x && x.weights && x.weights.length === 4; }), 'typing the 6 digits signs the device in', await sync(E));

    // lost phone: the recovery code alone gets back in
    const F = await device(browser);
    await F.goto(BASE + '/#profile'); await wait(1200);
    await click(F, '[data-act="acct-mode"][data-m="recover"]'); await wait(300);
    await shot(F, 'acct-recover');
    await fillAndSubmit(F, { code: rc.toLowerCase() });
    ok(await until(async () => { const x = await state(F); return x && x.weights && x.weights.length === 4; }), 'recovery code alone signs in with all data', await sync(F));
    const syF = await sync(F);
    ok(syF.rcPending && syF.rcPending !== rc && syF.user === user, 'a fresh recovery code is shown, name kept', syF);
    lastToken = syF.token;

    // the recovery signed the other devices out
    await B.reload(); await wait(1500);
    ok(!(await sync(B)).token, 'recovery signed the other devices out', await sync(B));

    for (const [n, p] of [['G', G], ['A', A], ['B', B], ['C', C], ['D', D], ['E', E], ['F', F]]) ok(p.errs.length === 0, n + ' no page errors', p.errs);
  } catch (e) { fail++; console.log('ERROR', e.message); }
  // remove the test account so a run against production leaves nothing behind
  if (lastToken) {
    const r = await fetch(BASE + '/api/account/delete', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + lastToken }, body: JSON.stringify({ pin: PIN, confirm: 'ลบ' }) });
    ok(r.status === 200, 'test account deleted', r.status);
  }
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
