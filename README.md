# 🚀 LBRCE Lakshya 2026 - College Event Registration Portal

A lightweight, high-performance full-stack web application designed for **LBRCE Lakshya** (National Level Technical & Cultural Fest). Built specifically to handle student registrations reliably, prevent duplicate signups, provide instant printable entry passes, and give organizers a live admin dashboard with 1-click CSV export.

---

## 🌟 Key Features

### 👨‍🎓 Student Portal (`/`)
- **Event Directory**: Browse 9+ flagship Lakshya events (Technical, Coding, Robotics, Cultural/Gaming) with category filters.
- **Live Seat Availability**: Real-time progress bar showing registered count vs. maximum event capacity.
- **Duplicate Prevention**: Database-level unique constraint on `(event_id, roll_number)` — prevents duplicate or accidental multiple submissions.
- **Client & Server Validation**: Validates Roll Number, Email, 10-digit Phone, Department, and Year of study.
- **Digital Registration Pass Card**: Instantly generates a unique entry pass (e.g., `LAK-3201598`) with print/save as PDF support.
- **Find My Pass**: Allows students to retrieve and re-print their existing pass anytime using their Roll Number and Event.

### 🛡️ Organizer Admin Console (`/admin`)
- **Password-Protected Login**: Secure authentication with JWT tokens and bcrypt password hashing.
- **Live Metrics Dashboard**: Real-time counters for Total Registrations, Unique Students, Active Events, and fill rates.
- **Event Progress Grid**: Mini cards showing capacity utilization for each Lakshya event.
- **Searchable & Filterable Table**: Filter by event, filter by department, or search by Student Name, Roll Number, Phone, or Email.
- **1-Click CSV Export**: Direct download (`lakshya-registrations-YYYY-MM-DD.csv`) pre-formatted for Microsoft Excel and Google Sheets.
- **Record Management**: Delete duplicate or invalid test entries with automatic confirmation.

### ⚡ Reliability & Performance
- **Rate Limiting**: `express-rate-limit` prevents spam, bot traffic, and rapid form double-clicks.
- **Zero-Config Database**: SQLite (`lakshya.db`) works out of the box with zero external database setup required.
- **Dual Cloud Compatibility**: Can be connected to hosted PostgreSQL (Supabase, Neon, Railway) by providing `DATABASE_URL`.

---

## 📂 Project Structure

```
lbrce-lakshya-portal/
├── public/
│   ├── index.html         # Student portal (Hero, Events, Registration Modal, Ticket Pass)
│   ├── admin.html         # Organizer admin console (Login, Metrics, Search Table)
│   ├── style.css          # Modern dark/light tech-fest theme with print styling
│   ├── app.js             # Student portal frontend logic (AJAX, validation, ticket rendering)
│   └── admin.js           # Admin portal frontend logic (auth, live filters, CSV export)
├── routes/
│   ├── events.js          # GET /api/events, GET /api/events/:id
│   ├── register.js        # POST /api/register, GET /api/register/lookup
│   └── admin.js           # POST /api/admin/login, GET /stats, GET /registrations, GET /export
├── middleware/
│   └── auth.js            # JWT verification middleware
├── .env                   # Environment config (Port, JWT Secret, Admin Credentials)
├── .env.example           # Config template
├── db.js                  # Database connection, auto-schema creation, and seed data
├── server.js              # Express app entrypoint with security and rate limiting
├── package.json           # Dependencies and scripts
└── test-api.js            # 11-step automated verification suite
```

---

## 🚀 Quick Start (Running Locally)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
*Or run in auto-reload development mode:*
```bash
npm run dev
```

The portal will be live at:
- **Student Registration Portal**: [http://localhost:3000](http://localhost:3000)
- **Organizer Admin Console**: [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 🔐 Default Admin Credentials

- **Username**: `admin`
- **Password**: `Lakshya@2026`

*(You can customize these in `.env`)*

---

## 🧪 Running Automated Tests

To run the end-to-end API test suite:
```bash
node test-api.js
```

This verifies:
1. `GET /api/events` retrieval
2. Successful student registration
3. Duplicate registration blocking (`409 Conflict`)
4. Multi-event signup for the same student
5. Pass lookup functionality
6. Validation checks (invalid email/phone rejection)
7. Admin login authentication
8. Metrics calculation
9. Search and filtering
10. CSV export formatting
11. Unauthorized access security barriers

---

## 🌐 Deploying to Production

### Free Tier Hosting Options:
1. **Render / Railway**:
   - Push this repo to GitHub.
   - Connect repository to Render (Web Service) or Railway.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Add environment variables (`JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`).
2. **Supabase / Neon (Optional Postgres)**:
   - If deploying on serverless (e.g. Vercel) where persistent disk SQLite is read-only, replace the SQLite query wrapper in `db.js` with `pg` / `@neondatabase/serverless` using `DATABASE_URL`.
