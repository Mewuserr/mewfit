// Two-device sync check in a real browser: node tests/sync.e2e.cjs [baseUrl] [shotDir]
// Needs puppeteer-core and a Chrome; set CHROME to its path.
const puppeteer = require('puppeteer-core');
const path = require('path');
const BASE = process.argv[2] || 'http://127.0.0.1:8799';
const SHOTS = process.argv[3] || '';
const CHROME = process.env.CHROME;
let pass = 0, fail = 0;
const ok = (c, name, x) => { if (c) pass++; else { fail++; console.log('FAIL', name, x !== undefined ? JSON.stringify(x) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
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
const sync = pg => pg.evaluate(() => JSON.parse(localStorage.getItem('mewfit.sync') || 'null'));
async function fillAndSubmit(pg, fields) {
  for (const [name, v] of Object.entries(fields)) {
    await pg.$eval(`#acct form [name="${name}"]`, el => { el.value = ''; });
    await pg.type(`#acct form [name="${name}"]`, v);
  }
  // the floating nav covers the bottom of the screen; bring the button to the middle first, like a thumb scroll
  await pg.$eval('#acct form button:not([type="button"])', el => el.scrollIntoView({ block: 'center' }));
  await pg.click('#acct form button:not([type="button"])');
}
async function addWeight(pg, d, kg) {
  await pg.evaluate(() => { location.hash = 'progress'; }); await wait(300);
  await pg.$eval('#w-d', (el, v) => { el.value = v; }, d);
  await pg.type('#w-kg', String(kg));
  await pg.$eval('[data-act="w-add"]', el => el.scrollIntoView({ block: 'center' }));
  await pg.click('[data-act="w-add"]');
}
async function shot(pg, name) { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png') }); }

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  // device A: has a local profile before any account exists
  const A = await device(browser);
  await A.goto(BASE + '/');
  await A.evaluate(() => localStorage.setItem('mewfit.v1', JSON.stringify({ v: 2, seenDemo: true, guideDone: true, profile: { name: 'มิว', days: [1, 3, 5], minutes: 30 }, weights: [{ d: '2026-10-20', kg: 76 }] })));
  await A.goto(BASE + '/#today'); await A.reload(); await wait(500);   // reload: the app reads storage only at start
  ok(await A.$('.banner a[href="#profile"]') !== null, 'today shows create-account nudge');
  await A.goto(BASE + '/#profile'); await wait(400);
  await shot(A, 'acct-signup');
  // mismatched pins stay local
  await fillAndSubmit(A, { username: user, pin: PIN, pin2: '583921' });
  await wait(300);
  ok((await A.$eval('#acct', el => el.textContent)).includes('ไม่ตรงกัน'), 'pin mismatch message');
  await fillAndSubmit(A, { username: user, pin: PIN, pin2: PIN });
  await wait(1500);
  let sy = await sync(A);
  ok(sy && sy.token && sy.user === user && sy.version === 1 && !sy.dirty, 'A signed up', sy);
  await shot(A, 'acct-signedin');

  // A logs a weight -> pushed
  await addWeight(A, '2026-10-25', 75.4);
  await wait(2600);
  sy = await sync(A);
  ok(sy.version === 2 && !sy.dirty, 'A change pushed', sy);

  // device B: fresh phone, logs in from the welcome screen
  const B = await device(browser);
  await B.goto(BASE + '/'); await wait(400);
  await B.click('[data-act="acct-login"]'); await wait(400);
  ok(B.url().endsWith('#profile'), 'welcome login button goes to profile', B.url());
  await fillAndSubmit(B, { username: user.toUpperCase(), pin: PIN });
  await wait(1500);
  let sB = await state(B);
  ok(sB && sB.profile && sB.profile.name === 'มิว' && sB.weights.length === 2, 'B got A data', sB && sB.weights);
  ok(B.url().endsWith('#profile') || B.url().endsWith('#today'), 'B on app after login', B.url());

  // both edit while A is offline -> merge keeps both
  await A.setOfflineMode(true);
  await addWeight(A, '2026-10-26', 75.1);
  await wait(2600);
  sy = await sync(A);
  ok(sy.dirty === true, 'A offline change kept dirty', sy);
  await addWeight(B, '2026-10-27', 74.9);
  await wait(2600);
  ok(!(await sync(B)).dirty, 'B pushed', await sync(B));
  await A.setOfflineMode(false);
  await A.evaluate(() => window.dispatchEvent(new Event('online')));
  await wait(3000);
  const sA = await state(A);
  ok(sA.weights.map(w => w.d).join() === '2026-10-20,2026-10-25,2026-10-26,2026-10-27', 'A merged both offline edits', sA.weights);
  ok(!(await sync(A)).dirty, 'A clean after merge', await sync(A));
  // B picks up A's merged change when it comes back to the foreground
  await B.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await wait(2000);
  sB = await state(B);
  ok(sB.weights.length === 4, 'B pulled merged data', sB.weights);

  // wrong pin on a third device shows the server message
  const C = await device(browser);
  await C.goto(BASE + '/#profile'); await wait(400);
  await C.click('[data-act="acct-mode"][data-m="login"]'); await wait(200);
  await fillAndSubmit(C, { username: user, pin: '000000' });
  await wait(1200);
  ok((await C.$eval('#acct', el => el.textContent)).includes('ไม่ถูกต้อง'), 'wrong pin message shown');
  await shot(C, 'acct-wrongpin');

  // logout on B clears that phone only
  await B.goto(BASE + '/#profile'); await wait(400);
  await B.$eval('[data-act="acct-open"][data-o="logout"]', el => el.scrollIntoView({ block: 'center' }));
  await B.click('[data-act="acct-open"][data-o="logout"]'); await wait(200);
  await B.$eval('[data-act="acct-logout"]', el => el.scrollIntoView({ block: 'center' }));
  await B.click('[data-act="acct-logout"]'); await wait(1500);
  ok((await state(B)).profile === null && !(await sync(B)).token, 'B logged out and cleared', await sync(B));
  ok(B.url().endsWith('#start'), 'B back at welcome', B.url());
  const sA2 = await state(A);
  ok(sA2.profile && sA2.weights.length === 4, 'A untouched by B logout');

  for (const [n, p] of [['A', A], ['B', B], ['C', C]]) ok(p.errs.length === 0, n + ' no page errors', p.errs);
  await browser.close();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
