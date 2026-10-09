const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, 'lakshya.db');

// Rich event metadata (demo-style: prizes, rounds, rules, coordinators, team sizes, deadlines).
// team_min stays 1 everywhere so solo signups keep working; team_max opens team entries.
const RICH_EVENT_META = {
  'hackathon-code': {
    team_min: 1, team_max: 1, team_size_label: 'Individual', featured: 1, accent_color: '#6366f1',
    reg_deadline: 'March 18, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹10,000 + Certificate', second: '₹5,000', third: '₹2,500' }),
    rounds: JSON.stringify([
      { name: 'Round 1: Online Screening', description: 'Timed algorithmic puzzles on HackerRank-style platform.' },
      { name: 'Round 2: Onsite Grand Finale', description: 'Head-to-head rapid coding duel with live leaderboard.' }
    ]),
    rules: JSON.stringify(['C, C++, Java or Python allowed.', 'Individual participation; no external devices.', 'Plagiarism leads to instant disqualification.']),
    coordinators: JSON.stringify([{ name: 'CSE Tech Club', role: 'Student Lead', phone: '+91 98765 00001' }])
  },
  'paper-tech-cse': {
    team_min: 1, team_max: 2, team_size_label: '1 - 2 Members', accent_color: '#06b6d4',
    reg_deadline: 'March 18, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹5,000 + Certificate', second: '₹3,000', third: '₹1,500' }),
    rounds: JSON.stringify([
      { name: 'Round 1: Abstract Screening', description: 'Submit 250-word abstract; shortlisted teams present onsite.' },
      { name: 'Round 2: Final Presentation', description: '8-min talk + 2-min jury Q&A with working demo if any.' }
    ]),
    rules: JSON.stringify(['IEEE-format paper, max 6 pages.', 'Original work; max 15% similarity.', 'Bring PPT + full paper on event day.']),
    coordinators: JSON.stringify([{ name: 'CSE Dept. Association', role: 'Faculty Coordinator', phone: '+91 98765 00002' }])
  },
  'paper-tech-ece': {
    team_min: 1, team_max: 2, team_size_label: '1 - 2 Members', accent_color: '#ec4899',
    reg_deadline: 'March 18, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹5,000 + Certificate', second: '₹3,000', third: '₹1,500' }),
    rounds: JSON.stringify([
      { name: 'Round 1: Abstract Screening', description: 'Domain experts shortlist papers for finale.' },
      { name: 'Round 2: Final Presentation', description: 'Hardware demo carries bonus marks.' }
    ]),
    rules: JSON.stringify(['IEEE-format paper, max 6 pages.', 'At least one author must present.', 'Working prototype earns bonus points.']),
    coordinators: JSON.stringify([{ name: 'ECE Dept. Association', role: 'Faculty Coordinator', phone: '+91 98765 00003' }])
  },
  'project-expo': {
    team_min: 1, team_max: 4, team_size_label: '1 - 4 Members', featured: 1, accent_color: '#10b981',
    reg_deadline: 'March 18, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹12,000 + Trophy', second: '₹6,000', third: '₹3,000' }),
    rounds: JSON.stringify([
      { name: 'Round 1: Model Demonstration', description: 'Live working-model demo at your stall.' },
      { name: 'Round 2: Jury Viva', description: 'Technical Q&A with academic + industry jury.' }
    ]),
    rules: JSON.stringify(['Working hardware/software prototype mandatory.', 'Display poster required at stall.', 'Power supply provided; bring extension cords.']),
    coordinators: JSON.stringify([{ name: 'Central Tech Committee', role: 'Student Lead', phone: '+91 98765 00004' }])
  },
  'robo-race': {
    team_min: 1, team_max: 3, team_size_label: '1 - 3 Members', featured: 1, accent_color: '#f59e0b',
    reg_deadline: 'March 18, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹12,000 + Trophy', second: '₹6,000', third: '₹2,500' }),
    rounds: JSON.stringify([
      { name: 'Round 1: Arena Time Trial', description: 'Timed run across hurdles, bridge and slope sections.' },
      { name: 'Round 2: Knockout Duel', description: 'Fastest bots race head-to-head for the trophy.' }
    ]),
    rules: JSON.stringify(['Wired or wireless bots allowed; max 12V onboard.', 'Bot must fit 30x30 cm start box.', 'Damaging the arena = disqualification.']),
    coordinators: JSON.stringify([{ name: 'Robotics Club', role: 'Student Lead', phone: '+91 98765 00005' }])
  },
  'circuit-mania': {
    team_min: 1, team_max: 2, team_size_label: '1 - 2 Members', accent_color: '#a855f7',
    reg_deadline: 'March 18, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹5,000 + Certificate', second: '₹3,000', third: '₹1,500' }),
    rounds: JSON.stringify([
      { name: 'Round 1: Fault Hunt', description: 'Find planted faults on populated PCBs against the clock.' },
      { name: 'Round 2: Design Sprint', description: 'Wire a working circuit for a surprise specification.' }
    ]),
    rules: JSON.stringify(['Components and test gear provided on-site.', 'Safety protocols strictly enforced.', 'Rough sheets provided for calculations.']),
    coordinators: JSON.stringify([{ name: 'EEE Dept. Association', role: 'Faculty Coordinator', phone: '+91 98765 00006' }])
  },
  'web-craft': {
    team_min: 1, team_max: 2, team_size_label: '1 - 2 Members', accent_color: '#06b6d4',
    reg_deadline: 'March 19, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹6,000 + Certificate', second: '₹3,000', third: '₹1,500' }),
    rounds: JSON.stringify([
      { name: 'Sprint: 90-min Build', description: 'Design + code a landing page on the secret theme.' },
      { name: 'Showcase & Judging', description: 'Live walkthrough judged on UI, responsiveness and creativity.' }
    ]),
    rules: JSON.stringify(['Use any framework; internet provided.', 'Theme revealed on the spot.', 'Submit GitHub/hosted link before time ends.']),
    coordinators: JSON.stringify([{ name: 'IT Dept. Web Club', role: 'Student Lead', phone: '+91 98765 00007' }])
  },
  'cad-clash': {
    team_min: 1, team_max: 1, team_size_label: 'Individual', accent_color: '#f43f5e',
    reg_deadline: 'March 18, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹5,000 + Certificate', second: '₹3,000', third: '₹1,500' }),
    rounds: JSON.stringify([
      { name: 'Round 1: 2D to 3D Sprint', description: 'Model a solid part from orthographic drawings.' },
      { name: 'Round 2: Assembly Challenge', description: 'Assemble a mechanism and generate drafting views.' }
    ]),
    rules: JSON.stringify(['SolidWorks / Fusion 360 provided in lab.', 'Individual participation.', 'Time + dimensional accuracy decide ranks.']),
    coordinators: JSON.stringify([{ name: 'MECH Dept. Association', role: 'Faculty Coordinator', phone: '+91 98765 00008' }])
  },
  'lan-gaming': {
    team_min: 1, team_max: 4, team_size_label: 'Squad (1 - 4)', featured: 1, accent_color: '#ec4899',
    reg_deadline: 'March 19, 2027 - 11:59 PM',
    prizes: JSON.stringify({ first: '₹8,000 + Trophy', second: '₹4,000', third: '₹2,000' }),
    rounds: JSON.stringify([
      { name: 'Round 1: Qualifiers', description: 'Group-stage matches across BGMI + Valorant brackets.' },
      { name: 'Round 2: Grand Finals', description: 'LAN finals on stage systems for the trophy.' }
    ]),
    rules: JSON.stringify(['College ID mandatory for every squad member.', 'No emulators/hacks; fair-play checks apply.', 'Bring your own peripherals if needed.']),
    coordinators: JSON.stringify([{ name: 'Gaming & Cultural Club', role: 'Student Lead', phone: '+91 98765 00009' }])
  }
};
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
    // WAL mode: readers don't block writers — needed for fest-day concurrency
    try {
      await runQuery('PRAGMA journal_mode = WAL');
    } catch (e) {
      console.error('WAL mode warning:', e.message);
    }

    // Events table (includes demo-style rich fields: prizes, rounds, rules, coordinators, teams, deadlines)
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
        prizes TEXT DEFAULT NULL,
        rounds TEXT DEFAULT NULL,
        rules TEXT DEFAULT NULL,
        coordinators TEXT DEFAULT NULL,
        team_min INTEGER DEFAULT 1,
        team_max INTEGER DEFAULT 1,
        team_size_label TEXT DEFAULT NULL,
        reg_deadline TEXT DEFAULT NULL,
        featured INTEGER DEFAULT 0,
        accent_color TEXT DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Lightweight migration for events table (older DBs created before rich fields)
    const eventInfo = await getAll('PRAGMA table_info(events)');
    const eventCols = eventInfo.map((c) => c.name);
    const ensureEventCol = async (name, ddl) => {
      if (!eventCols.includes(name)) await runQuery(`ALTER TABLE events ADD COLUMN ${ddl}`);
    };
    await ensureEventCol('prizes', 'prizes TEXT DEFAULT NULL');
    await ensureEventCol('rounds', 'rounds TEXT DEFAULT NULL');
    await ensureEventCol('rules', 'rules TEXT DEFAULT NULL');
    await ensureEventCol('coordinators', 'coordinators TEXT DEFAULT NULL');
    await ensureEventCol('team_min', 'team_min INTEGER DEFAULT 1');
    await ensureEventCol('team_max', 'team_max INTEGER DEFAULT 1');
    await ensureEventCol('team_size_label', 'team_size_label TEXT DEFAULT NULL');
    await ensureEventCol('reg_deadline', 'reg_deadline TEXT DEFAULT NULL');
    await ensureEventCol('featured', 'featured INTEGER DEFAULT 0');
    await ensureEventCol('accent_color', 'accent_color TEXT DEFAULT NULL');

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
        payment_status TEXT DEFAULT 'SUCCESS',
        payment_method TEXT DEFAULT 'UPI',
        transaction_id TEXT,
        amount_paid INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
        UNIQUE(event_id, roll_number)
      )
    `);

    // Schema migration for existing registrations table if payment columns are absent
    const tableInfo = await getAll('PRAGMA table_info(registrations)');
    const columnNames = tableInfo.map((c) => c.name);
    if (!columnNames.includes('payment_status')) {
      await runQuery("ALTER TABLE registrations ADD COLUMN payment_status TEXT DEFAULT 'SUCCESS'");
    }
    if (!columnNames.includes('payment_method')) {
      await runQuery("ALTER TABLE registrations ADD COLUMN payment_method TEXT DEFAULT 'UPI'");
    }
    if (!columnNames.includes('transaction_id')) {
      await runQuery("ALTER TABLE registrations ADD COLUMN transaction_id TEXT");
    }
    if (!columnNames.includes('amount_paid')) {
      await runQuery("ALTER TABLE registrations ADD COLUMN amount_paid INTEGER DEFAULT 0");
    }
    if (!columnNames.includes('entry_token')) {
      await runQuery("ALTER TABLE registrations ADD COLUMN entry_token TEXT");
    }
    if (!columnNames.includes('email_verified')) {
      await runQuery("ALTER TABLE registrations ADD COLUMN email_verified INTEGER DEFAULT 0");
    }
    if (!columnNames.includes('team_name')) {
      await runQuery("ALTER TABLE registrations ADD COLUMN team_name TEXT");
    }
    if (!columnNames.includes('members')) {
      await runQuery("ALTER TABLE registrations ADD COLUMN members TEXT");
    }

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

    // OTP table for email login verification (students + admins)
    await runQuery(`
      CREATE TABLE IF NOT EXISTS otps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        otp TEXT NOT NULL,
        purpose TEXT DEFAULT 'login',
        expires_at DATETIME NOT NULL,
        attempts INTEGER DEFAULT 0,
        consumed INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await runQuery(`CREATE INDEX IF NOT EXISTS idx_otps_email ON otps(email)`);

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
          fee: 0
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
        const meta = RICH_EVENT_META[ev.id] || {};
        await runQuery(
          `INSERT INTO events (id, name, category, department, description, venue, date_time, max_participants, fee,
            prizes, rounds, rules, coordinators, team_min, team_max, team_size_label, reg_deadline, featured, accent_color)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ev.id, ev.name, ev.category, ev.department, ev.description, ev.venue, ev.date_time, ev.max_participants, ev.fee,
            meta.prizes || null, meta.rounds || null, meta.rules || null, meta.coordinators || null,
            meta.team_min ?? 1, meta.team_max ?? 1, meta.team_size_label || null, meta.reg_deadline || null,
            meta.featured ?? 0, meta.accent_color || null]
        );
      }
      console.log('Seeded', defaultEvents.length, 'default Lakshya events.');
    }

    // Backfill rich metadata for databases seeded before these fields existed.
    // Content fields (prizes/rounds/rules/coordinators) only fill blanks so admin edits survive;
    // team config + flags for the built-in seed events always sync to defaults.
    try {
      const metaIds = Object.keys(RICH_EVENT_META);
      for (const mid of metaIds) {
        const meta = RICH_EVENT_META[mid];
        await runQuery(
          `UPDATE events SET
            prizes = COALESCE(prizes, ?),
            rounds = COALESCE(rounds, ?),
            rules = COALESCE(rules, ?),
            coordinators = COALESCE(coordinators, ?),
            reg_deadline = COALESCE(reg_deadline, ?)
           WHERE id = ?`,
          [meta.prizes || null, meta.rounds || null, meta.rules || null, meta.coordinators || null,
            meta.reg_deadline || null, mid]
        );
        await runQuery(
          `UPDATE events SET
            team_min = ?, team_max = ?, team_size_label = ?, featured = ?, accent_color = ?
           WHERE id = ?`,
          [meta.team_min ?? 1, meta.team_max ?? 1, meta.team_size_label || null,
            meta.featured ?? 0, meta.accent_color || null, mid]
        );
      }
    } catch (e) {
      console.error('Event metadata backfill warning:', e.message);
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
