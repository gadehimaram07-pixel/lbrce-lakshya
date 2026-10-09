const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASS = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || 'Lakshya 2026 <no-reply@lbrce.ac.in>';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

let transporter = null;

function isMailConfigured() {
  return Boolean(SMTP_USER && SMTP_PASS);
}

function getTransporter() {
  if (!isMailConfigured()) return null;
  if (transporter) return transporter;

  const isGmail = SMTP_HOST.toLowerCase().includes('gmail') || SMTP_USER.toLowerCase().endsWith('@gmail.com');
  const transportOpts = isGmail
    ? {
        service: 'gmail',
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        connectionTimeout: 6000,
        greetingTimeout: 6000,
        socketTimeout: 6000
      }
    : {
        host: SMTP_HOST || 'smtp.gmail.com',
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        connectionTimeout: 6000,
        greetingTimeout: 6000,
        socketTimeout: 6000
      };

  transporter = nodemailer.createTransport(transportOpts);
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  if (!isMailConfigured()) {
    console.log('----------------------------------------------------------------');
    console.log(`[MAIL-DEV] To: ${to}\nSubject: ${subject}\n${text || html?.slice(0, 500)}`);
    console.log('----------------------------------------------------------------');
    console.log('TIP: Configure SMTP_HOST/SMTP_USER/SMTP_PASS in .env to send real emails.');
    return { sent: false, dev: true };
  }
  try {
    const sendPromise = getTransporter().sendMail({ from: MAIL_FROM, to, subject, html, text });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('SMTP timeout after 7000ms')), 7000)
    );
    const info = await Promise.race([sendPromise, timeoutPromise]);
    console.log(`Email sent to ${to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error('Failed to send email to', to, err.message);
    return { sent: false, error: err.message };
  }
}

function otpEmailHtml(otp, purpose) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#0284c7,#4f46e5);padding:24px;color:#fff;text-align:center">
      <h1 style="margin:0;font-size:22px;letter-spacing:1px">LAKSHYA 2026 • LBRCE</h1>
      <p style="margin:6px 0 0;opacity:.9;font-size:13px">${purpose === 'admin' ? 'Admin Login Verification' : 'Login Verification'}</p>
    </div>
    <div style="padding:28px;text-align:center;color:#111827">
      <p style="font-size:15px">Your one-time password (OTP) is:</p>
      <div style="font-size:36px;font-weight:800;letter-spacing:8px;background:#f1f5f9;border:1px dashed #94a3b8;border-radius:12px;padding:12px 8px;margin:16px 0">${otp}</div>
      <p style="font-size:13px;color:#6b7280">Valid for <b>5 minutes</b>. Do not share this code with anyone.<br/>If you did not request this, ignore this email.</p>
    </div>
    <div style="background:#f8fafc;padding:12px;text-align:center;font-size:11px;color:#94a3b8">Lakireddy Bali Reddy College of Engineering, Mylavaram</div>
  </div>`;
}

async function sendOtpMail(to, otp, purpose = 'login') {
  return sendMail({
    to,
    subject: `Lakshya 2026 - Your login OTP is ${otp}`,
    html: otpEmailHtml(otp, purpose),
    text: `Your Lakshya 2026 login OTP is ${otp}. Valid for 5 minutes.`
  });
}

function passEmailHtml(data, entryQrDataUrl) {
  const members = Array.isArray(data.members) ? data.members : [];
  const teamRows = members.length
    ? `<tr><td style="padding:8px;border:1px solid #e5e7eb;color:#64748b">Team</td><td style="padding:8px;border:1px solid #e5e7eb">${data.team_name ? `<b>${data.team_name}</b> (${members.length + 1} members)<br/>` : ''}${members.map((m, i) => `${i + 1}. ${m.name} (${m.roll_number})`).join('<br/>')}</td></tr>`
    : '';
  return `
  <div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#059669,#0284c7);padding:24px;color:#fff;text-align:center">
      <h1 style="margin:0">🎉 Registration Confirmed!</h1>
      <p style="margin:6px 0 0;opacity:.92">LAKSHYA 2026 • ${data.event_name}</p>
    </div>
    <div style="padding:24px;color:#111827">
      <p>Hi <b>${data.name}</b>,</p>
      <p>Your seat for <b>${data.event_name}</b> is confirmed. Show this pass + entry token QR at the venue gate.</p>
      <table style="width:100%;font-size:14px;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:8px;border:1px solid #e5e7eb;color:#64748b">Pass ID</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700;font-family:monospace">${data.registration_id}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;color:#64748b">Entry Token</td><td style="padding:8px;border:1px solid #e5e7eb;font-weight:700;font-family:monospace">${data.entry_token}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;color:#64748b">Event</td><td style="padding:8px;border:1px solid #e5e7eb">${data.event_name}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;color:#64748b">Venue / Time</td><td style="padding:8px;border:1px solid #e5e7eb">${data.venue} • ${data.date_time}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;color:#64748b">Student</td><td style="padding:8px;border:1px solid #e5e7eb">${data.name} (${data.roll_number})</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;color:#64748b">Payment</td><td style="padding:8px;border:1px solid #e5e7eb">₹${data.amount_paid} via ${data.payment_method} • ${data.transaction_id} • ${data.payment_status}</td></tr>
        ${teamRows}
      </table>
      ${entryQrDataUrl ? `<div style="text-align:center;margin:16px 0"><p style="font-size:13px;color:#475569">Entry Token QR — scan at venue gate</p><img src="${entryQrDataUrl}" alt="Entry QR" style="width:180px;height:180px;border:8px solid #fff;box-shadow:0 4px 16px rgba(0,0,0,.15);border-radius:12px"/></div>` : ''}
      <p style="font-size:13px;color:#64748b">You can re-download your pass anytime from ${FRONTEND_URL} → Find My Pass.</p>
    </div>
  </div>`;
}

async function sendRegistrationMail(to, data, entryQrDataUrl) {
  return sendMail({
    to,
    subject: `Lakshya 2026 Pass Confirmed: ${data.event_name} • ${data.registration_id}`,
    html: passEmailHtml(data, entryQrDataUrl),
    text: `Hi ${data.name}, your Lakshya 2026 registration is confirmed. Pass: ${data.registration_id}, Entry Token: ${data.entry_token}, Event: ${data.event_name}, Venue: ${data.venue}, Time: ${data.date_time}. Amount paid: Rs.${data.amount_paid} via ${data.payment_method} (${data.transaction_id}).${data.team_name ? ` Team: ${data.team_name} (${(data.members || []).length + 1} members).` : ''}`
  });
}

module.exports = { isMailConfigured, sendMail, sendOtpMail, sendRegistrationMail };
