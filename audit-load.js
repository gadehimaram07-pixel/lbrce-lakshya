// Audit + load test: real routers, no rate limiters, no SMTP (dev mail fallback).
process.env.PORT = '3002';
const express = require('express');

async function main() {
  process.on('unhandledRejection', (e) => console.error('UNHANDLED REJECTION:', e));
  process.on('uncaughtException', (e) => console.error('UNCAUGHT:', e));
  await require('./db').initDB();
  const { runQuery, getOne, getAll } = require('./db');

  const app = express();
  app.use(express.json());
  app.use('/api/events', require('./routes/events'));
  app.use('/api/register', require('./routes/register'));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/payments', require('./routes/payments'));
  app.use('/api/admin', require('./routes/admin'));
  const server = app.listen(3002);
  const base = 'http://localhost:3002';
  const get = (u) => fetch(base + u).then(async (r) => ({ s: r.status, j: await r.json() }));
  const post = (u, b) => fetch(base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(async (r) => ({ s: r.status, j: await r.json() }));
  let pass = 0, fail = 0;
  const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

  console.log('=== A. Functionality audit ===');
  // 1 events rich fields
  let r = await get('/api/events');
  const hack = r.j.data.find((e) => e.id === 'hackathon-code');
  check('events list (9)', r.s === 200 && r.j.count >= 9, `count=${r.j.count}`);
  check('rich fields (prizes/rounds/rules/coordinators/team/deadline)',
    Boolean(hack?.prizes?.first && hack?.rounds?.length === 2 && hack?.rules?.length >= 2 && hack?.coordinators?.length >= 1 && hack?.team_size_label && hack?.reg_deadline));
  // 2 team event detail
  r = await get('/api/events/lan-gaming');
  check('team event detail', r.j.data.team_max === 4 && r.j.data.featured === true);
  // 3 solo+member rejected
  r = await post('/api/register', { event_id: 'hackathon-code', name: 'A', roll_number: 'AUDIT01', email: 'a@t.com', phone: '9876543210', college: 'L', department: 'CSE', year: '3rd Year', payment_method: 'UPI', transaction_id: 'UTR1234', members: [{ name: 'M', roll_number: 'AUDIT02', email: 'm@t.com', phone: '9876543211' }] });
  check('solo event rejects members', r.s === 400);
  // 4 team signup + lookup team
  await runQuery("DELETE FROM registrations WHERE roll_number LIKE 'AUDIT%'");
  r = await post('/api/register', { event_id: 'lan-gaming', name: 'Lead', roll_number: 'AUDIT10', email: 'lead@t.com', phone: '9876543210', college: 'L', department: 'CSE', year: '3rd Year', payment_method: 'UPI', transaction_id: 'UTR9999', team_name: 'AuditSquad', members: [{ name: 'M1', roll_number: 'AUDIT11', email: 'm1@t.com', phone: '9876543211' }] });
  check('team signup', r.s === 201 && r.j.data.team_size === 2 && Boolean(r.j.data.entry_token), `mailSent=${r.j.mailSent}`);
  r = await get('/api/register/lookup?event_id=lan-gaming&roll_number=AUDIT10');
  check('lookup returns team+token+QR', r.j.data.team_name === 'AuditSquad' && Boolean(r.j.data.entryQrDataUrl));
  // 5 duplicate via member roll
  r = await post('/api/register', { event_id: 'lan-gaming', name: 'X', roll_number: 'AUDIT20', email: 'x@t.com', phone: '9876543210', college: 'L', department: 'CSE', year: '3rd Year', payment_method: 'UPI', transaction_id: 'UTR0000', members: [{ name: 'M1', roll_number: 'AUDIT11', email: 'm1@t.com', phone: '9876543211' }] });
  check('member-duplicate blocked', r.s === 409);
  // 6 resend-pass (audit env has no SMTP → 502 "could not deliver" is the correct behavior;
  // real delivery is verified against the live SMTP-configured server separately)
  r = await post('/api/register/resend-pass', { event_id: 'lan-gaming', roll_number: 'AUDIT10' });
  check('resend-pass validates + attempts delivery', (r.s === 200 && r.j.success === true) || (r.s === 502 && /Could not deliver/.test(r.j.message || '')), `status=${r.s}`);
  // 7 payments config + order fallback (no keys here)
  r = await get('/api/payments/config');
  check('payments config', r.s === 200 && r.j.data.enabled === false && r.j.data.keyId === null);
  // 8 payment-qr
  r = await get('/api/register/payment-qr?event_id=hackathon-code');
  check('payment-qr', r.j.success && r.j.data.qrDataUrl.startsWith('data:image'));
  // 9 admin login + stats + export
  r = await post('/api/admin', { username: 'admin', password: 'Lakshya@2026' }).catch(() => null);
  const login = await post('/api/admin/login', { username: 'admin', password: 'Lakshya@2026' });
  const tok = login.j.token;
  const stats = await fetch(base + '/api/admin/stats', { headers: { Authorization: 'Bearer ' + tok } }).then((x) => x.json());
  check('admin login+stats', login.s === 200 && stats.success && stats.data.totalRegistrations >= 1);
  const csv = await fetch(base + '/api/admin/export', { headers: { Authorization: 'Bearer ' + tok } }).then((x) => x.text());
  check('csv has team columns', csv.includes('Team Name') && csv.includes('Team Members'));
  await runQuery("DELETE FROM registrations WHERE roll_number LIKE 'AUDIT%'");

  console.log('\n=== B. Load test: concurrent event reads (ramp 50 → 150 → 300) ===');
  for (const n of [50, 150, 300]) {
    const t0 = Date.now();
    const times = await Promise.all(Array.from({ length: n }, async () => {
      const s = Date.now();
      try {
        const rr = await fetch(base + '/api/events');
        await rr.json();
        return { ms: Date.now() - s, ok: rr.status === 200 };
      } catch (e) {
        return { ms: Date.now() - s, ok: false, err: String(e?.cause?.code || e.message) };
      }
    }));
    const okReads = times.filter((t) => t.ok).length;
    const sorted = times.map((t) => t.ms).sort((a, b) => a - b);
    const errs = [...new Set(times.filter((t) => !t.ok).map((t) => t.err))];
    console.log(`reads x${n}: ${okReads}/${n} ok in ${Date.now() - t0}ms | p50=${sorted[Math.floor(n / 2)]}ms p95=${sorted[Math.floor(n * 0.95) - 1]}ms max=${sorted[n - 1]}ms ${errs.length ? '| errs: ' + errs.join(',') : ''}`);
    if (n === 300) check('300 concurrent reads', okReads === 300);
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n=== C. Load test: 100 concurrent registrations (writes) ===');
  await runQuery("DELETE FROM registrations WHERE roll_number LIKE 'LOAD%'");
  const t1 = Date.now();
  const results = await Promise.all(Array.from({ length: 100 }, (_, i) => {
    const n = String(i).padStart(3, '0');
    return post('/api/register', {
      event_id: 'web-craft', name: 'Load User ' + n, roll_number: 'LOAD' + n,
      email: `load${n}@t.com`, phone: '9' + String(100000000 + i).slice(0, 9),
      college: 'LBRCE', department: 'IT', year: '2nd Year',
      payment_method: 'UPI', transaction_id: 'LOADUTR' + n
    }).then((x) => ({ ...x, ms: Date.now() - t1 }));
  }));
  const okWrites = results.filter((x) => x.s === 201).length;
  const badWrites = results.filter((x) => x.s !== 201);
  if (badWrites.length) console.log('write failures:', JSON.stringify(badWrites.slice(0, 5).map((x) => ({ s: x.s, msg: (x.j.message || '').slice(0, 100) }))));
  const wtimes = results.map((x) => x.ms).sort((a, b) => a - b);
  console.log(`writes: ${okWrites}/100 ok in ${Date.now() - t1}ms | p50=${wtimes[50]}ms p95=${wtimes[94]}ms max=${wtimes[99]}ms`);
  const cnt = await getOne('SELECT COUNT(*) c FROM registrations WHERE roll_number LIKE ?', ['LOAD%']);
  check('100 concurrent writes all persisted, no dupes lost', okWrites === 100 && cnt.c === 100, `db=${cnt.c}`);
  await runQuery("DELETE FROM registrations WHERE roll_number LIKE 'LOAD%'");

  console.log('\n=== D. Race test: 20 concurrent signups, SAME roll (exactly 1 must win) ===');
  const race = await Promise.all(Array.from({ length: 20 }, (_, i) => post('/api/register', {
    event_id: 'web-craft', name: 'Racer', roll_number: 'RACER001',
    email: `racer${i}@t.com`, phone: '9' + String(200000000 + i).slice(0, 9),
    college: 'LBRCE', department: 'IT', year: '2nd Year',
    payment_method: 'UPI', transaction_id: 'RACEUTR' + i
  })));
  const raceWins = race.filter((x) => x.s === 201).length;
  const raceDupes = race.filter((x) => x.s === 409).length;
  const raceCnt = await getOne('SELECT COUNT(*) c FROM registrations WHERE roll_number = ?', ['RACER001']);
  console.log(`race: ${raceWins} created, ${raceDupes} rejected as duplicates, db rows=${raceCnt.c}`);
  check('no double-registration under concurrency', raceWins === 1 && raceDupes === 19 && raceCnt.c === 1);
  await runQuery("DELETE FROM registrations WHERE roll_number = 'RACER001'");
  console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
  server.close();
  setTimeout(() => process.exit(fail ? 1 : 0), 300);
}

main().catch((e) => { console.error('AUDIT CRASH:', e); process.exit(1); });
