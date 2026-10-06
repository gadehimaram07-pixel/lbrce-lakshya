const express = require('express');
const router = express.Router();
const { getOne } = require('../db');
const rz = require('../utils/razorpay');

// GET /api/payments/config — tells frontend if Razorpay is live + public key
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: rz.isEnabled(),
      keyId: rz.isEnabled() ? process.env.RAZORPAY_KEY_ID : null
    }
  });
});

// POST /api/payments/order — create a Razorpay order for an event fee
router.post('/order', async (req, res) => {
  try {
    const { event_id, email } = req.body;
    if (!event_id) {
      return res.status(400).json({ success: false, message: 'event_id is required.' });
    }
    const event = await getOne('SELECT * FROM events WHERE id = ?', [String(event_id).trim()]);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    const fee = Number(event.fee) || 0;
    if (fee <= 0) {
      return res.json({ success: true, free: true, message: 'This is a free event — no payment needed.' });
    }
    if (!rz.isEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'Online payments are not configured yet. Please pay via UPI QR and enter the UTR ID.'
      });
    }
    const receipt = `LAK-${Date.now().toString().slice(-10)}`;
    const order = await rz.createOrder({
      amountPaise: fee * 100,
      receipt,
      notes: { event_id: event.id, event_name: event.name, email: (email || '').trim().toLowerCase() }
    });
    res.json({
      success: true,
      data: {
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        event_id: event.id,
        event_name: event.name,
        fee
      }
    });
  } catch (err) {
    console.error('razorpay order error:', err);
    res.status(500).json({ success: false, message: 'Failed to create payment order. Please try again.' });
  }
});

// POST /api/payments/verify — verify Razorpay signature, return payment token for registration
router.post('/verify', async (req, res) => {
  try {
    const { order_id, payment_id, signature, event_id } = req.body;
    if (!order_id || !payment_id || !signature || !event_id) {
      return res.status(400).json({ success: false, message: 'order_id, payment_id, signature and event_id are required.' });
    }
    if (!rz.isEnabled()) {
      return res.status(503).json({ success: false, message: 'Online payments are not configured.' });
    }
    const event = await getOne('SELECT * FROM events WHERE id = ?', [String(event_id).trim()]);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }
    const ok = rz.verifySignature({ orderId: order_id, paymentId: payment_id, signature });
    if (!ok) {
      return res.status(400).json({ success: false, message: 'Payment verification failed. Signature mismatch.' });
    }
    const fee = Number(event.fee) || 0;
    const paymentToken = rz.issuePaymentToken({ event_id: event.id, order_id, payment_id, amount: fee });
    res.json({
      success: true,
      message: `Payment of ₹${fee} verified for ${event.name}.`,
      data: { paymentToken, payment_id, order_id, amount: fee }
    });
  } catch (err) {
    console.error('razorpay verify error:', err);
    res.status(500).json({ success: false, message: 'Payment verification failed.' });
  }
});

module.exports = router;
