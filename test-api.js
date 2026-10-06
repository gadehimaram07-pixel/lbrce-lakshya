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

    // 2. Test Payment Required for Paid Event (Missing payment rejection)
    console.log('\n[2] Testing Payment Requirement (Attempting signup without payment on paid event)...');
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

    const noPayRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student1)
    });
    const noPayData = await noPayRes.json();
    if (noPayRes.status !== 400 || !noPayData.message.includes('Payment is required')) {
      throw new Error(`Expected 400 Payment Required, got status ${noPayRes.status}: ${JSON.stringify(noPayData)}`);
    }
    console.log(`✅ Passed: Registration without payment correctly blocked: "${noPayData.message}"`);

    // 3. Test POST /api/register (Successful registration with UPI payment)
    console.log('\n[3] Testing POST /api/register with UPI payment verification...');
    const student1WithPay = {
      ...student1,
      payment_method: 'UPI',
      transaction_id: '408192837461'
    };

    const reg1Res = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student1WithPay)
    });
    const reg1Data = await reg1Res.json();
    if (
      reg1Res.status !== 201 || 
      !reg1Data.success || 
      !reg1Data.data.registration_id ||
      reg1Data.data.amount_paid !== 100 ||
      reg1Data.data.transaction_id !== '408192837461'
    ) {
      throw new Error(`Registration failed: ${JSON.stringify(reg1Data)}`);
    }
    const passCode1 = reg1Data.data.registration_id;
    console.log(`✅ Passed: Successfully registered with payment. Pass ID: ${passCode1}, Amount Paid: ₹${reg1Data.data.amount_paid}, UTR: ${reg1Data.data.transaction_id}`);

    // 4. Test Duplicate Registration Prevention (Same roll number, same event)
    console.log('\n[4] Testing Duplicate Registration Prevention...');
    const dupRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student1WithPay)
    });
    const dupData = await dupRes.json();
    if (dupRes.status !== 409 || dupData.success !== false) {
      throw new Error(`Expected 409 Conflict for duplicate registration, got status ${dupRes.status}`);
    }
    console.log(`✅ Passed: Duplicate signup correctly blocked with 409 Conflict: "${dupData.message}"`);

    // 5. Test Cross-Event Registration with Instant Payment Simulation
    console.log('\n[5] Testing Cross-Event Registration with Instant Payment Simulation...');
    const student1Event2 = {
      ...student1,
      event_id: 'project-expo',
      payment_method: 'CARD',
      transaction_id: 'TXN-987654'
    };
    const reg2Res = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(student1Event2)
    });
    const reg2Data = await reg2Res.json();
    if (reg2Res.status !== 201 || !reg2Data.success || reg2Data.data.amount_paid !== 200) {
      throw new Error(`Cross-event registration failed: ${JSON.stringify(reg2Data)}`);
    }
    console.log(`✅ Passed: Same student registered for second event. Pass ID: ${reg2Data.data.registration_id}, Fee: ₹${reg2Data.data.amount_paid}`);

    // 6. Test Pass Lookup (Ticket pass with payment details)
    console.log('\n[6] Testing GET /api/register/lookup (Pass lookup with payment confirmation)...');
    const lookupRes = await fetch(`${baseUrl}/api/register/lookup?event_id=hackathon-code&roll_number=22761A0501`);
    const lookupData = await lookupRes.json();
    if (
      lookupRes.status !== 200 || 
      lookupData.data.registration_id !== passCode1 ||
      lookupData.data.amount_paid !== 100 ||
      lookupData.data.transaction_id !== '408192837461'
    ) {
      throw new Error(`Pass lookup mismatch: ${JSON.stringify(lookupData)}`);
    }
    console.log(`✅ Passed: Retrieved pass for ${lookupData.data.name}. Payment Status: ${lookupData.data.payment_status}, Fee: ₹${lookupData.data.amount_paid}, Txn: ${lookupData.data.transaction_id}`);

    // 7. Test Input Validation (Bad email & phone)
    console.log('\n[7] Testing Input Validation (Invalid email/phone)...');
    const invalidRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...student1WithPay,
        email: 'not-an-email',
        phone: '123'
      })
    });
    const invalidData = await invalidRes.json();
    if (invalidRes.status !== 400) {
      throw new Error(`Expected 400 Bad Request, got ${invalidRes.status}`);
    }
    console.log(`✅ Passed: Input validation caught invalid data: "${invalidData.message}"`);

    // 8. Test Admin Login
    console.log('\n[8] Testing Admin Authentication (POST /api/admin/login)...');
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

    // 9. Test Admin Metrics & Revenue (GET /api/admin/stats)
    console.log('\n[9] Testing Admin Stats & Total Revenue (GET /api/admin/stats)...');
    const statsRes = await fetch(`${baseUrl}/api/admin/stats`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const statsData = await statsRes.json();
    if (!statsData.success || statsData.data.totalRegistrations < 2 || statsData.data.totalRevenue < 300) {
      throw new Error(`Stats mismatch: ${JSON.stringify(statsData)}`);
    }
    console.log(`✅ Passed: Total Registrations: ${statsData.data.totalRegistrations}, Unique Students: ${statsData.data.uniqueStudents}, Total Revenue: ₹${statsData.data.totalRevenue}`);

    // 10. Test Admin Registrations Table Search by Transaction ID
    console.log('\n[10] Testing Admin Registrations Search by UTR / Transaction ID...');
    const searchRes = await fetch(`${baseUrl}/api/admin/registrations?search=408192837461`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const searchData = await searchRes.json();
    if (!searchData.success || searchData.data.length !== 1 || searchData.data[0].transaction_id !== '408192837461') {
      throw new Error(`Expected 1 record for UTR search query, got ${searchData.data.length}`);
    }
    console.log(`✅ Passed: UTR Search found registration for ${searchData.data[0].name} (Fee: ₹${searchData.data[0].amount_paid}, Method: ${searchData.data[0].payment_method}).`);

    // 11. Test CSV Export with Payment Columns (GET /api/admin/export)
    console.log('\n[11] Testing CSV Export with Payment Columns (GET /api/admin/export)...');
    const exportRes = await fetch(`${baseUrl}/api/admin/export`, {
      headers: { 'Authorization': `Bearer ${adminToken}` }
    });
    const csvContent = await exportRes.text();
    const contentType = exportRes.headers.get('content-type');
    if (
      !contentType.includes('text/csv') || 
      !csvContent.includes('Payment Status') ||
      !csvContent.includes('Amount Paid (INR)') ||
      !csvContent.includes('Transaction / UTR ID')
    ) {
      throw new Error(`CSV export header invalid: ${csvContent.slice(0, 150)}`);
    }
    console.log(`✅ Passed: CSV generated with all payment fields included. Size: ${csvContent.length} bytes.`);
    console.log('Sample CSV snippet:\n' + csvContent.split('\n').slice(0, 3).join('\n'));

    // 12. Test Security / Protection on Admin Endpoint
    console.log('\n[12] Testing Security: Unauthorized access without token...');
    const unauthRes = await fetch(`${baseUrl}/api/admin/stats`);
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`);
    }
    console.log(`✅ Passed: Protected route blocked unauthenticated request with 401.`);

    // 13. Test ₹0 Event with UPI Payment Option
    console.log('\n[13] Testing ₹0 Event with UPI Payment (WebCraft)...');
    const studentZeroPay = {
      event_id: 'web-craft',
      name: 'Ananya Reddy',
      roll_number: '22761A0502',
      email: 'ananya.reddy@gmail.com',
      phone: '9123456780',
      college: 'LBRCE',
      department: 'IT',
      year: '2nd Year',
      payment_method: 'UPI',
      transaction_id: 'UPI-0-TEST9999'
    };
    const zeroRes = await fetch(`${baseUrl}/api/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(studentZeroPay)
    });
    const zeroData = await zeroRes.json();
    if (
      zeroRes.status !== 201 || 
      !zeroData.success || 
      zeroData.data.amount_paid !== 0 ||
      zeroData.data.payment_method !== 'UPI' ||
      zeroData.data.transaction_id !== 'UPI-0-TEST9999'
    ) {
      throw new Error(`Zero-fee UPI registration failed: ${JSON.stringify(zeroData)}`);
    }
    console.log(`✅ Passed: Successfully registered for ₹0 event with UPI method. Amount Paid: ₹${zeroData.data.amount_paid}, Method: ${zeroData.data.payment_method}, UTR: ${zeroData.data.transaction_id}`);

    console.log('\n======================================================');
    console.log('🎉 ALL 13 VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
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
