const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../middleware/auth');

const KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';

function isEnabled() {
  return Boolean(KEY_ID && KEY_SECRET);
}

let client = null;
function getClient() {
  if (!isEnabled()) return null;
  if (!client) {
    const Razorpay = require('razorpay');
    client = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });
  }
  return client;
}

async function createOrder({ amountPaise, receipt, notes }) {
  const rz = getClient();
  if (!rz) throw new Error('Razorpay is not configured.');
  return rz.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: String(receipt).slice(0, 40),
    notes: notes || {}
  });
}

function verifySignature({ orderId, paymentId, signature }) {
  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return expected === signature;
}

// Short-lived token proving a Razorpay payment was verified (attached to registration)
function issuePaymentToken({ event_id, order_id, payment_id, amount }) {
  return jwt.sign({ event_id, order_id, payment_id, amount, via: 'RAZORPAY' }, JWT_SECRET, { expiresIn: '30m' });
}

function readPaymentToken(token, event_id, amount) {
  try {
    const d = jwt.verify(token, JWT_SECRET);
    if (!d || d.via !== 'RAZORPAY') return null;
    if (event_id && d.event_id !== event_id) return null;
    if (amount !== undefined && Number(d.amount) !== Number(amount)) return null;
    return d;
  } catch (e) {
    return null;
  }
}

module.exports = { isEnabled, getClient, createOrder, verifySignature, issuePaymentToken, readPaymentToken, KEY_ID };
