const QRCode = require('qrcode');

const UPI_ID = process.env.UPI_ID || 'lakshya2026@sbi';
const UPI_PAYEE = process.env.UPI_PAYEE || 'LBRCE Lakshya 2026';

function buildUpiString({ amount = 0, note = 'Lakshya' }) {
  const am = Number(amount) || 0;
  return `upi://pay?pa=${UPI_ID}&pn=${encodeURIComponent(UPI_PAYEE)}&am=${am}&cu=INR&tn=${encodeURIComponent(String(note).slice(0, 40))}`;
}

async function toDataUrl(text, opts = {}) {
  return QRCode.toDataURL(text, { width: 220, margin: 1, ...opts });
}

async function paymentQr(eventFee, eventName) {
  const upiString = buildUpiString({ amount: eventFee, note: eventName });
  const qrDataUrl = await toDataUrl(upiString);
  return { upiString, qrDataUrl, upiId: UPI_ID };
}

async function entryQr(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const qrDataUrl = await toDataUrl(text);
  return { text, qrDataUrl };
}

function generateEntryToken() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `LAK-TKN-${s}`;
}

module.exports = { buildUpiString, toDataUrl, paymentQr, entryQr, generateEntryToken, UPI_ID };
