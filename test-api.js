const http = require('http');

async function runTests() {
  console.log('--- Starting LBRCE Lakshya Portal Automated Verification ---');

  // Load app
  process.env.PORT = '3001';
  process.env.JWT_SECRET = 'test_secret_key_123';
  
  const { initDB, runQuery } = require('./db');
  await initDB();

  // Clear test registrations from any previous run
  await runQuery("DELETE FROM registrations WHERE roll_number IN ('22761A0501', '22761A0502')");

  // Spin up test server
  const express = require('express');
  const cors = require('cors');
  const eventsRouter = require('./routes/events');
  const registerRouter = require('./routes/register');
  const adminRouter = require('./routes/admin');

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api/events', eventsRouter);
  app.use('/api/register', registerRouter);
  app.use('/api/admin', adminRouter);

  const server = app.listen(3001);
  console.log('Test server listening on port 3001');

  const baseUrl = 'http://localhost:3001';

  try {
    // 1. Test GET /api/events
    console.log('\n[1] Testing GET /api/events...');
    const eventsRes = await fetch(`${baseUrl}/api/events`);
    const eventsData = await eventsRes.json();
    if (!eventsData.success || eventsData.count < 9) {
      throw new Error(`Expected at least 9 events, got ${eventsData.count}`);
    }
    console.log(`✅ Passed: Found ${eventsData.count} active Lakshya events.`);

    // 2. Test POST /api/register (Successful registration)
    console.log('\n[2] Testing POST /api/register (First-time valid signup)...');
    const student1 = {
      event_id: 'hackathon-code',
      name: 'Rohan Varma',
      roll_number: '22761A0501',
      email: 'rohan.varma@gmail.com',
      phone: '9876543210',
      college: 'LBRCE',
      department: 'CSE',
      year: '3rd Year'
    };

    const reg1Res = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student1)
    });
    const reg1Data = await reg1Res.json();
    if (reg1Res.status !== 201 || !reg1Data.success || !reg1Data.data.registration_id) {
      throw new Error(`Registration failed: ${JSON.stringify(reg1Data)}`);
    }
    const passCode1 = reg1Data.data.registration_id;
    console.log(`✅ Passed: Successfully registered. Pass ID generated: ${passCode1}`);

    // 3. Test Duplicate Registration Prevention (Same roll number, same event)
    console.log('\n[3] Testing Duplicate Registration Prevention...');
    const dupRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student1)
    });
    const dupData = await dupRes.json();
    if (dupRes.status !== 409 || dupData.success !== false) {
      throw new Error(`Expected 409 Conflict for duplicate registration, got status ${dupRes.status}`);
    }
    console.log(`✅ Passed: Duplicate signup correctly blocked with 409 Conflict: "${dupData.message}"`);

    // 4. Test Cross-Event Registration (Same student registering for a different event is allowed)
    console.log('\n[4] Testing Cross-Event Registration (Same student in another event)...');
    const student1Event2 = {
      ...student1,
      event_id: 'project-expo'
    };
    const reg2Res = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student1Event2)
    });
    const reg2Data = await reg2Res.json();
    if (reg2Res.status !== 201 || !reg2Data.success) {
      throw new Error(`Cross-event registration failed: ${JSON.stringify(reg2Data)}`);
    }
    console.log(`✅ Passed: Same student can participate in multiple distinct events. Pass ID: ${reg2Data.data.registration_id}`);

    // 5. Test Pass Lookup (Student retrieving ticket pass)
    console.log('\n[5] Testing GET /api/register/lookup (Pass lookup)...');
    const lookupRes = await fetch(`${baseUrl}/api/register/lookup?event_id=hackathon-code&roll_number=22761A0501`);
    const lookupData = await lookupRes.json();
    if (lookupRes.status !== 200 || lookupData.data.registration_id !== passCode1) {
      throw new Error(`Pass lookup mismatch: ${JSON.stringify(lookupData)}`);
    }
    console.log(`✅ Passed: Retrieved pass for ${lookupData.data.name} (${lookupData.data.roll_number})`);

    // 6. Test Input Validation (Bad email & phone)
    console.log('\n[6] Testing Input Validation (Invalid email/phone)...');
    const invalidRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...student1,
        email: 'not-an-email',
        phone: '123'
      })
    });
    const invalidData = await invalidRes.json();
    if (invalidRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${invalidRes.status}`);
    }
    console.log(`✅ Passed: Input validation caught invalid data: "${invalidData.message}"`);

    // 7. Test Admin Login
    console.log('\n[7] Testing Admin Authentication (POST /api/admin/login)...');
    const loginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        password: 'Lakshya@2026'
      })
    });
    const loginData = await loginRes.json();
    if (loginRes.status !== 200 || !loginData.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(loginData)}`);
    }
    const adminToken = loginData.token;
    console.log(`✅ Passed: Admin authenticated successfully. JWT received.`);

    // 8. Test Admin Metrics (GET /api/admin/stats)
    console.log('\n[8] Testing Admin Stats (GET /api/admin/stats)...');
    const statsRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const statsData = await statsRes.json();
    if (!statsData.success || statsData.data.totalRegistrations < 2) {
      throw new Error(`Stats mismatch: ${JSON.stringify(statsData)}`);
    }
    console.log(`✅ Passed: Total Registrations: ${statsData.data.totalRegistrations}, Unique Students: ${statsData.data.uniqueStudents}`);

    // 9. Test Admin Registrations Table with Search
    console.log('\n[9] Testing Admin Registrations Table & Search...');
    const searchRes = await fetch(`${baseUrl}/api/admin/registrations?search=22761A0501`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const searchData = await searchRes.json();
    if (!searchData.success || searchData.data.length !== 2) {
      throw new Error(`Expected 2 records for search query, got ${searchData.data.length}`);
    }
    console.log(`✅ Passed: Search returned ${searchData.data.length} records for roll number 22761A0501.`);

    // 10. Test CSV Export (GET /api/admin/export)
    console.log('\n[10] Testing CSV Export (GET /api/admin/export)...');
    const exportRes = await fetch(`${baseUrl}/api/admin/export`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const csvContent = await exportRes.text();
    const contentType = exportRes.headers.get('content-type');
    if (!contentType.includes('text/csv') || !csvContent.includes('Pass ID,Event Name')) {
      throw new Error(`CSV export header invalid: ${csvContent.slice(0, 100)}`);
    }
    console.log(`✅ Passed: CSV generated successfully. Size: ${csvContent.length} bytes.`);
    console.log('Sample CSV snippet:\n' + csvContent.split('\n').slice(0, 3).join('\n'));

    // 11. Test Security / Protection on Admin Endpoint
    console.log('\n[11] Testing Security: Unauthorized access without token...');
    const unauthRes = await fetch(`${baseUrl}/api/admin/stats`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`);
    }
    console.log(`✅ Passed: Protected route blocked unauthenticated request with 401.`);

    console.log('\n======================================================');
    console.log('🎉 ALL 11 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
    console.log('======================================================\n');
  } finally {
    server.close();
  }
}

runTests().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
