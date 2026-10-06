const { getAll } = require('./db');

async function inspectDB() {
  console.log('\n========================================');
  console.log('   LBRCE LAKSHYA DATABASE INSPECTION');
  console.log('========================================\n');

  try {
    // 1. Events Table
    const events = await getAll('SELECT id, name, category, department, max_participants FROM events');
    console.log(`📌 EVENTS TABLE (${events.length} records):`);
    console.table(events);

    // 2. Registrations Table
    const registrations = await getAll(`
      SELECT 
        r.id as pass_id, 
        r.roll_number, 
        r.name, 
        e.name as event_name, 
        r.amount_paid,
        r.payment_method as mode,
        r.transaction_id,
        r.payment_status as status,
        r.created_at
      FROM registrations r
      JOIN events e ON r.event_id = e.id
      ORDER BY r.created_at DESC
    `);
    console.log(`\n👥 REGISTRATIONS TABLE (${registrations.length} records):`);
    if (registrations.length === 0) {
      console.log('   (No registrations recorded yet. Register on http://localhost:3000 to see data here!)');
    } else {
      console.table(registrations);
    }

    // 3. Admins Table
    const admins = await getAll('SELECT id, username, created_at FROM admins');
    console.log(`\n🔐 ADMINS TABLE (${admins.length} records):`);
    console.table(admins);

    console.log('\nDatabase File: lakshya.db\n');
  } catch (err) {
    console.error('Error reading database:', err);
  } finally {
    process.exit(0);
  }
}

inspectDB();
