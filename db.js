const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'lakshya.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to connect to SQLite database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Promisified query helpers
const runQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const getOne = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

const getAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

// Initialize schema and seed default data
const initDB = async () => {
  try {
    // Enable foreign keys
    await runQuery('PRAGMA foreign_keys = ON');

    // Events table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        department TEXT NOT NULL,
        description TEXT,
        venue TEXT,
        date_time TEXT,
        max_participants INTEGER,
        fee INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Registrations table with unique constraint on (event_id, roll_number)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS registrations (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        name TEXT NOT NULL,
        roll_number TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        college TEXT NOT NULL,
        department TEXT NOT NULL,
        year TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        UNIQUE(event_id, roll_number)
      )
    `);

    // Index for quick lookups
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_reg_event ON registrations(event_id)`);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_reg_roll ON registrations(roll_number)`);

    // Admins table
    await runQuery(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed Events if table is empty
    const existingEvents = await getOne('SELECT COUNT(*) as count FROM events');
    if (existingEvents.count === 0) {
      console.log('Seeding initial Lakshya events...');
      const defaultEvents = [
        {
          id: 'hackathon-code',
          name: 'Code-A-Thon (Rapid Coding Challenge)',
          category: 'Coding',
          department: 'CSE & IT',
          description: 'Intense 2-round algorithmic programming and competitive problem solving contest. Showcase your data structures and coding speed.',
          venue: 'Central Computing Center Lab-1',
          date_time: 'March 20, 2026 - 10:00 AM',
          max_participants: 120,
          fee: 100
        },
        {
          id: 'paper-tech-cse',
          name: 'TechPPT - CSE Technical Paper Presentation',
          category: 'Technical',
          department: 'CSE',
          description: 'Present original research or innovative concepts in Artificial Intelligence, Web3, Cloud Computing, or Cybersecurity.',
          venue: 'Seminar Hall 2G01',
          date_time: 'March 20, 2026 - 11:30 AM',
          max_participants: 60,
          fee: 150
        },
        {
          id: 'paper-tech-ece',
          name: 'ElectroVision - ECE Paper Presentation',
          category: 'Technical',
          department: 'ECE',
          description: 'Innovations in VLSI, Embedded Systems, Signal & Image Processing, and Next-Gen Wireless Communications.',
          venue: 'ECE Department Seminar Hall',
          date_time: 'March 20, 2026 - 11:30 AM',
          max_participants: 50,
          fee: 150
        },
        {
          id: 'project-expo',
          name: 'Prathibha - Mega Project Expo',
          category: 'Technical',
          department: 'Central',
          description: 'Live working model and hardware/software prototype showcase open to all engineering streams. Cash prizes for best innovations.',
          venue: 'Main Indoor Sports Complex',
          date_time: 'March 20, 2026 - 01:30 PM',
          max_participants: 80,
          fee: 200
        },
        {
          id: 'robo-race',
          name: 'Robo-Rush (Obstacle Robot Race)',
          category: 'Robotics',
          department: 'MECH & EEE',
          description: 'Steer your custom wired or wireless robotic vehicle across hurdles, bridges, slopes, and treacherous terrain against the clock.',
          venue: 'Open Air Auditorium Arena',
          date_time: 'March 21, 2026 - 10:00 AM',
          max_participants: 40,
          fee: 200
        },
        {
          id: 'circuit-mania',
          name: 'Circuiter - Circuit Debugging & Design',
          category: 'Technical',
          department: 'EEE & ECE',
          description: 'Test your knowledge of analog/digital electronics, breadboard wiring speed, and rapid fault diagnosis.',
          venue: 'Simulation Lab - EEE Block',
          date_time: 'March 21, 2026 - 10:30 AM',
          max_participants: 60,
          fee: 100
        },
        {
          id: 'web-craft',
          name: 'WebCraft - UI/UX & Web Design Sprint',
          category: 'Coding',
          department: 'IT',
          description: 'Craft a stunning, responsive web app landing page within 90 minutes based on a secret design theme announced on spot.',
          venue: 'IT Department Lab 3',
          date_time: 'March 21, 2026 - 01:30 PM',
          max_participants: 50,
          fee: 100
        },
        {
          id: 'cad-clash',
          name: 'CAD Maestro - 3D Mechanical Modeling',
          category: 'Technical',
          department: 'MECH',
          description: 'Model intricate 3D mechanical components with precision and speed using CAD software tools.',
          venue: 'CAD/CAM Central Lab',
          date_time: 'March 21, 2026 - 11:00 AM',
          max_participants: 40,
          fee: 100
        },
        {
          id: 'lan-gaming',
          name: 'Pixel Wars - BGMI & Valorant Showdown',
          category: 'Cultural/Gaming',
          department: 'Central',
          description: 'High-adrenaline esports championship. Squad up with your friends and battle for the Lakshya Gaming Trophy.',
          venue: 'Student Activity Center',
          date_time: 'March 21, 2026 - 02:00 PM',
          max_participants: 100,
          fee: 150
        }
      ];

      for (const ev of defaultEvents) {
        await runQuery(
          `INSERT INTO events (id, name, category, department, description, venue, date_time, max_participants, fee)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ev.id, ev.name, ev.category, ev.department, ev.description, ev.venue, ev.date_time, ev.max_participants, ev.fee]
        );
      }
      console.log('Seeded', defaultEvents.length, 'default Lakshya events.');
    }

    // Seed default admin if none exists
    const adminCount = await getOne('SELECT COUNT(*) as count FROM admins');
    if (adminCount.count === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'Lakshya@2026';
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(password, salt);

      await runQuery('INSERT INTO admins (username, password_hash) VALUES (?, ?)', [username, hash]);
      console.log(`Default admin account created with username: "${username}"`);
    }

    console.log('Database initialization completed successfully.');
  } catch (err) {
    console.error('Error during database initialization:', err);
  }
};

module.exports = {
  db,
  runQuery,
  getOne,
  getAll,
  initDB
};
