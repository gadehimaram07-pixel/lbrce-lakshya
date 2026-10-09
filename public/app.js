// Login-first: the main portal requires an email-OTP login (see / login.html)
try {
  const _t = localStorage.getItem('lakshya_email_token');
  const _e = localStorage.getItem('lakshya_verified_email');
  if (!_t || !_e) location.replace('/');
} catch (e) { /* storage unavailable — let page render */ }

// Lakshya 2026 — Student portal logic (OTP login + server QR + emailed tokens)
let allEvents = [];
let currentCategory = 'all';
let currentStep = 1;
let currentPaymentMethod = 'UPI';
let generatedInstantTxnId = '';

let verifiedEmail = localStorage.getItem('lakshya_verified_email') || '';
let emailToken = localStorage.getItem('lakshya_email_token') || '';
let inTeamStep = false;

// Razorpay online-payment state
let razorpayEnabled = false;
let razorpayKeyId = null;
let razorpayPaymentToken = '';
let razorpayPaymentId = '';
let lastTicketData = null;

const eventsContainer = document.getElementById('eventsContainer');
const categoryFilters = document.getElementById('categoryFilters');
const registrationModal = document.getElementById('registrationModal');
const ticketModal = document.getElementById('ticketModal');
const lookupModal = document.getElementById('lookupModal');
const authModal = document.getElementById('authModal');

const registrationForm = document.getElementById('registrationForm');
const eventSelect = document.getElementById('eventSelect');
const lookupEventSelect = document.getElementById('lookupEventSelect');
const regErrorBox = document.getElementById('regErrorBox');
const regErrorMessage = document.getElementById('regErrorMessage');
const btnSubmitReg = document.getElementById('btnSubmitReg');
const btnRegText = document.getElementById('btnRegText');
const btnRegSpinner = document.getElementById('btnRegSpinner');

document.addEventListener('DOMContentLoaded', () => {
  loadEvents();
  loadPaymentConfig();
  setupEventListeners();
  refreshUserBadge();
});

// Ask backend whether Razorpay live payments are configured
async function loadPaymentConfig() {
  try {
    const res = await fetch('/api/payments/config');
    const data = await res.json();
    if (data.success && data.data.enabled) {
      razorpayEnabled = true;
      razorpayKeyId = data.data.keyId;
      loadRazorpayScript();
    }
  } catch { /* gateway stays in fallback mode */ }
  refreshGatewayUI();
}

function loadRazorpayScript() {
  if (document.getElementById('razorpayCheckoutJs')) return;
  const s = document.createElement('script');
  s.id = 'razorpayCheckoutJs';
  s.src = 'https://checkout.razorpay.com/v1/checkout.js';
  document.head.appendChild(s);
}

function refreshGatewayUI() {
  const rzBox = document.getElementById('razorpayBox');
  const simBox = document.getElementById('simulateBox');
  if (rzBox) rzBox.style.display = razorpayEnabled ? 'block' : 'none';
  if (simBox) simBox.style.display = razorpayEnabled ? 'none' : 'block';
  const badge = document.getElementById('gatewayBadgeText');
  if (badge) badge.textContent = razorpayEnabled ? 'Razorpay Secure Checkout' : 'Fast Mock Checkout Gateway';
  const desc = document.getElementById('gatewayDescText');
  if (desc) desc.textContent = razorpayEnabled
    ? 'Pay by UPI, card, netbanking or wallet through Razorpay. Verified instantly.'
    : 'Live gateway keys are not configured — demo simulation. Set RAZORPAY_KEY_ID/SECRET in .env for real payments.';
}

async function payWithRazorpay() {
  hideRegError();
  const event_id = eventSelect.value;
  const ev = selectedEvent();
  const fee = ev ? Number(ev.fee) || 0 : 0;
  if (fee <= 0) return showRegError('This is a free event — no payment needed.');
  if (typeof Razorpay === 'undefined') return showRegError('Razorpay checkout failed to load. Check connection and retry.');
  const btn = document.getElementById('btnRazorpayPay');
  btn.disabled = true;
  try {
    const res = await fetch('/api/payments/order', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id, email: verifiedEmail || document.getElementById('studentEmail').value.trim() })
    });
    const data = await res.json();
    if (!data.success) return showRegError(data.message || 'Could not start payment.');
    if (data.free) return showRegError('This is a free event.');
    const order = data.data;
    const rzp = new Razorpay({
      key: razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      name: 'LBRCE Lakshya 2026',
      description: order.event_name,
      order_id: order.orderId,
      prefill: {
        name: document.getElementById('studentName').value.trim(),
        email: document.getElementById('studentEmail').value.trim(),
        contact: document.getElementById('studentPhone').value.trim()
      },
      theme: { color: '#4f46e5' },
      handler: async function (resp) {
        try {
          if (!resp || !resp.razorpay_payment_id || !resp.razorpay_signature) {
            throw new Error('empty response from checkout');
          }
          await verifyRazorpayPayment({
            order_id: resp.razorpay_order_id,
            payment_id: resp.razorpay_payment_id,
            signature: resp.razorpay_signature,
            event_id
          });
        } catch (err) {
          console.error('razorpay handler error:', err);
          showRegError(`Payment left the checkout but confirmation failed (${err.message || 'unknown error'}). No pass was created — click Pay again to retry.`);
          btn.disabled = false;
        }
      },
      modal: { ondismiss: function () { btn.disabled = false; } }
    });
    rzp.on('payment.failed', function () {
      showRegError('Razorpay payment failed. Please try again or use UPI QR.');
      btn.disabled = false;
    });
    rzp.open();
  } catch {
    showRegError('Could not start Razorpay payment.');
    btn.disabled = false;
  }
}

async function verifyRazorpayPayment(payload) {
  const btn = document.getElementById('btnRazorpayPay');
  try {
    const res = await fetch('/api/payments/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) return showRegError(data.message || 'Payment verification failed.');
    razorpayPaymentToken = data.data.paymentToken;
    razorpayPaymentId = data.data.payment_id;
    currentPaymentMethod = 'RAZORPAY';
    const notice = document.getElementById('instantPaySuccessNotice');
    const code = document.getElementById('instantTxnIdDisplay');
    if (notice && code) { code.innerText = razorpayPaymentId; notice.style.display = 'block'; }
    toast('Payment verified! Confirm your pass below.', 'success');
  } catch {
    showRegError('Payment verification failed. Try again.');
  } finally {
    if (btn) btn.disabled = false;
  }
}

function toast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) { alert(msg); return; }
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.classList.add('show'), 30);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3800);
}

function refreshUserBadge() {
  const badge = document.getElementById('userBadge');
  const emailEl = document.getElementById('userBadgeEmail');
  const loginBtn = document.getElementById('btnOpenAuth');
  if (verifiedEmail && emailToken) {
    if (badge) badge.style.display = 'inline-flex';
    if (emailEl) emailEl.textContent = verifiedEmail;
    if (loginBtn) loginBtn.textContent = 'Logout';
  } else {
    if (badge) badge.style.display = 'none';
    if (loginBtn) loginBtn.textContent = 'Login';
  }
  const vBadge = document.getElementById('emailVerifiedBadge');
  if (vBadge) {
    const curEmail = document.getElementById('studentEmail')?.value.trim().toLowerCase();
    if (verifiedEmail && curEmail && curEmail === verifiedEmail) {
      vBadge.textContent = '✓ Email verified';
      vBadge.className = 'verify-badge verified';
    } else if (verifiedEmail) {
      vBadge.textContent = `✓ Logged in as ${verifiedEmail} — verify this email to link`;
      vBadge.className = 'verify-badge unverified';
    } else {
      vBadge.textContent = '⚪ Email not verified';
      vBadge.className = 'verify-badge unverified';
    }
  }
}

function setupEventListeners() {
  if (categoryFilters) {
    categoryFilters.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-pill');
      if (!btn) return;
      document.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.category;
      renderEvents();
    });
  }

  document.getElementById('btnCloseRegModal')?.addEventListener('click', closeRegistrationModal);
  document.getElementById('btnCancelReg')?.addEventListener('click', closeRegistrationModal);
  document.getElementById('btnCancelReg2')?.addEventListener('click', closeRegistrationModal);
  document.getElementById('btnCloseTicketModal')?.addEventListener('click', closeTicketModal);
  document.getElementById('btnDoneTicket')?.addEventListener('click', closeTicketModal);
  document.getElementById('btnGoToPayment')?.addEventListener('click', proceedFromDetails);
  document.getElementById('btnGoToPayment2')?.addEventListener('click', proceedFromTeam);
  document.getElementById('btnBackToStep1')?.addEventListener('click', backFromPayment);
  document.getElementById('btnAddMember')?.addEventListener('click', () => addMemberRow());
  eventSelect?.addEventListener('change', updateEventFeeBadge);
  document.getElementById('studentEmail')?.addEventListener('input', refreshUserBadge);

  const tabUpiBtn = document.getElementById('tabUpiBtn');
  const tabInstantBtn = document.getElementById('tabInstantBtn');
  const panelUpi = document.getElementById('panelUpi');
  const panelInstant = document.getElementById('panelInstant');

  tabUpiBtn?.addEventListener('click', () => {
    tabUpiBtn.classList.add('active');
    tabInstantBtn.classList.remove('active');
    if (panelUpi) panelUpi.style.display = 'block';
    if (panelInstant) panelInstant.style.display = 'none';
    currentPaymentMethod = 'UPI';
  });

  tabInstantBtn?.addEventListener('click', () => {
    tabInstantBtn.classList.add('active');
    tabUpiBtn.classList.remove('active');
    if (panelInstant) panelInstant.style.display = 'block';
    if (panelUpi) panelUpi.style.display = 'none';
    currentPaymentMethod = razorpayEnabled ? 'RAZORPAY' : (document.getElementById('instantModeSelect')?.value || 'CARD');
  });

  document.getElementById('instantModeSelect')?.addEventListener('change', (e) => {
    if (!razorpayEnabled) currentPaymentMethod = e.target.value;
  });

  document.getElementById('btnRazorpayPay')?.addEventListener('click', payWithRazorpay);

  document.getElementById('btnCopyUpiId')?.addEventListener('click', () => {
    const upiId = document.getElementById('upiIdText')?.innerText || 'lakshya2026@sbi';
    navigator.clipboard.writeText(upiId).then(() => {
      const btn = document.getElementById('btnCopyUpiId');
      if (btn) { const o = btn.innerText; btn.innerText = '✓ Copied!'; setTimeout(() => { btn.innerText = o; }, 2000); }
    }).catch(() => {});
  });

  document.getElementById('btnFillDemoUtr')?.addEventListener('click', () => {
    const input = document.getElementById('transactionIdInput');
    if (input) { input.value = '4081' + Math.floor(10000000 + Math.random() * 90000000); input.focus(); }
  });

  document.getElementById('btnSimulateInstantPay')?.addEventListener('click', () => {
    generatedInstantTxnId = 'TXN-' + Math.floor(100000 + Math.random() * 900000);
    const notice = document.getElementById('instantPaySuccessNotice');
    const code = document.getElementById('instantTxnIdDisplay');
    if (notice && code) { code.innerText = generatedInstantTxnId; notice.style.display = 'block'; }
  });

  document.getElementById('btnOpenLookup')?.addEventListener('click', openLookupModal);
  document.getElementById('btnQuickLookupHero')?.addEventListener('click', openLookupModal);
  document.getElementById('btnCloseLookupModal')?.addEventListener('click', closeLookupModal);
  document.getElementById('btnCancelLookup')?.addEventListener('click', closeLookupModal);

  // Auth modal
  document.getElementById('btnOpenAuth')?.addEventListener('click', handleAuthButton);
  document.getElementById('btnCloseAuthModal')?.addEventListener('click', () => authModal?.classList.remove('active'));
  document.getElementById('btnRequestAuthOtp')?.addEventListener('click', requestAuthOtp);
  document.getElementById('btnVerifyAuthOtp')?.addEventListener('click', verifyAuthOtp);
  document.getElementById('btnResendAuthOtp')?.addEventListener('click', requestAuthOtp);
  document.getElementById('btnBackAuthEmail')?.addEventListener('click', () => {
    document.getElementById('authStepOtp').style.display = 'none';
    document.getElementById('authStepEmail').style.display = 'block';
  });

  // Inline registration email OTP
  document.getElementById('btnSendRegOtp')?.addEventListener('click', requestRegOtp);
  document.getElementById('btnVerifyRegOtp')?.addEventListener('click', verifyRegOtp);

  [registrationModal, ticketModal, lookupModal, authModal].forEach((modal) => {
    modal?.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('active'); });
  });

  document.getElementById('btnPrintTicket')?.addEventListener('click', () => window.print());
  document.getElementById('btnResendPass')?.addEventListener('click', resendPassEmail);
  if (registrationForm) registrationForm.addEventListener('submit', handleRegistrationSubmit);
  document.getElementById('lookupForm')?.addEventListener('submit', handleLookupSubmit);
}

// ---------- Auth (email OTP login) ----------
function openAuthModal() {
  hideAuthMsg();
  document.getElementById('authStepEmail').style.display = 'block';
  document.getElementById('authStepOtp').style.display = 'none';
  if (verifiedEmail) document.getElementById('authEmail').value = verifiedEmail;
  authModal?.classList.add('active');
}

function handleAuthButton() {
  if (verifiedEmail && emailToken) {
    if (confirm(`Logout from ${verifiedEmail}?`)) {
      verifiedEmail = ''; emailToken = '';
      localStorage.removeItem('lakshya_verified_email');
      localStorage.removeItem('lakshya_email_token');
      location.replace('/');
    }
    return;
  }
  openAuthModal();
}

function showAuthMsg(kind, msg) {
  const eBox = document.getElementById('authErrorBox');
  const sBox = document.getElementById('authSuccessBox');
  if (kind === 'error') {
    document.getElementById('authErrorMessage').innerText = msg;
    eBox.style.display = 'flex'; sBox.style.display = 'none';
  } else {
    document.getElementById('authSuccessMessage').innerText = msg;
    sBox.style.display = 'flex'; eBox.style.display = 'none';
  }
}
function hideAuthMsg() {
  document.getElementById('authErrorBox').style.display = 'none';
  document.getElementById('authSuccessBox').style.display = 'none';
}

async function requestAuthOtp() {
  hideAuthMsg();
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showAuthMsg('error', 'Enter a valid email address.');
  const btn = document.getElementById('btnRequestAuthOtp');
  btn.disabled = true; btn.textContent = 'Sending OTP…';
  try {
    const res = await fetch('/api/auth/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, purpose: 'login' })
    });
    const data = await res.json();
    if (!data.success) return showAuthMsg('error', data.message);
    showAuthMsg('ok', data.message || `OTP sent to ${email}. Check your inbox and spam folder — valid for 5 minutes.`);
    if (data.debugOtp) {
      const otpInput = document.getElementById('authOtpInput');
      if (otpInput) otpInput.value = data.debugOtp;
    }
    document.getElementById('authStepEmail').style.display = 'none';
    document.getElementById('authStepOtp').style.display = 'block';
  } catch { showAuthMsg('error', 'Network error. Try again.'); }
  finally { btn.disabled = false; btn.textContent = 'Send OTP to Mail'; }
}

async function verifyAuthOtp() {
  hideAuthMsg();
  const email = document.getElementById('authEmail').value.trim().toLowerCase();
  const otp = document.getElementById('authOtpInput').value.trim();
  if (otp.length !== 6) return showAuthMsg('error', 'Enter the 6-digit OTP.');
  const btn = document.getElementById('btnVerifyAuthOtp');
  btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, purpose: 'login' })
    });
    const data = await res.json();
    if (!data.success) return showAuthMsg('error', data.message);
    verifiedEmail = data.email; emailToken = data.emailToken;
    localStorage.setItem('lakshya_verified_email', verifiedEmail);
    localStorage.setItem('lakshya_email_token', emailToken);
    const se = document.getElementById('studentEmail');
    if (se && !se.value) se.value = verifiedEmail;
    refreshUserBadge();
    showAuthMsg('ok', `Welcome! ${verifiedEmail} verified.`);
    toast(`Logged in as ${verifiedEmail}`, 'success');
    setTimeout(() => authModal?.classList.remove('active'), 900);
  } catch { showAuthMsg('error', 'Network error.'); }
  finally { btn.disabled = false; btn.textContent = 'Verify & Login'; }
}

// Inline OTP inside registration form (same backend, purpose=login)
async function requestRegOtp() {
  hideRegError();
  const emailEl = document.getElementById('studentEmail');
  const email = emailEl.value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showRegError('Enter a valid email first, then Send OTP.');
  const btn = document.getElementById('btnSendRegOtp');
  btn.disabled = true; btn.textContent = 'Sending…';
  try {
    const res = await fetch('/api/auth/request-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, purpose: 'login' })
    });
    const data = await res.json();
    if (!data.success) return showRegError(data.message);
    document.getElementById('regOtpBox').style.display = 'flex';
    document.getElementById('regOtpHint').textContent = data.message || `OTP sent to ${email}. Enter it below (valid 5 min, check spam too).`;
    if (data.debugOtp) {
      const regInput = document.getElementById('regOtpInput');
      if (regInput) regInput.value = data.debugOtp;
    }
    toast(data.message || `OTP sent to ${email}`, 'success');
  } catch { showRegError('Failed to send OTP. Try again.'); }
  finally { btn.disabled = false; btn.textContent = 'Send OTP'; }
}

async function verifyRegOtp() {
  const email = document.getElementById('studentEmail').value.trim().toLowerCase();
  const otp = document.getElementById('regOtpInput').value.trim();
  if (otp.length !== 6) return showRegError('Enter the 6-digit OTP sent to your mail.');
  try {
    const res = await fetch('/api/auth/verify-otp', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, otp, purpose: 'login' })
    });
    const data = await res.json();
    if (!data.success) return showRegError(data.message);
    verifiedEmail = data.email; emailToken = data.emailToken;
    localStorage.setItem('lakshya_verified_email', verifiedEmail);
    localStorage.setItem('lakshya_email_token', emailToken);
    refreshUserBadge();
    document.getElementById('regOtpHint').textContent = `✓ ${email} verified. Pass + token will be mailed here.`;
    toast('Email verified!', 'success');
  } catch { showRegError('Verification failed. Try again.'); }
}

// ---------- Events ----------
async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    if (data.success) {
      allEvents = data.data;
      renderEvents();
      populateEventDropdowns();
    } else {
      eventsContainer.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--accent-rose)">Failed to load events: ${data.message}</div>`;
    }
  } catch (err) {
    eventsContainer.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--accent-rose)">Error connecting to server.</div>`;
  }
}

function populateEventDropdowns() {
  const options = allEvents.map((ev) => {
    const fullText = ev.is_full ? ' [FULL]' : '';
    const feeText = ev.fee > 0 ? ` (₹${ev.fee})` : ' (Free)';
    return `<option value="${ev.id}">${ev.name}${feeText}${fullText}</option>`;
  }).join('');
  if (eventSelect) eventSelect.innerHTML = '<option value="">-- Choose an Event --</option>' + options;
  if (lookupEventSelect) lookupEventSelect.innerHTML = '<option value="">-- Select Event --</option>' + options;
}

function updateEventFeeBadge() {
  const badge = document.getElementById('eventFeeBadge');
  if (!badge) return;
  const ev = allEvents.find((e) => e.id === eventSelect.value);
  if (ev) { badge.style.display = 'inline-block'; badge.innerText = ev.fee > 0 ? `Fee: ₹${ev.fee}` : 'Free Entry'; }
  else badge.style.display = 'none';
}

function renderEvents() {
  if (!eventsContainer) return;
  const filtered = currentCategory === 'all' ? allEvents : allEvents.filter((ev) => ev.category.toLowerCase().includes(currentCategory.toLowerCase()));
  if (!filtered.length) {
    eventsContainer.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem 0;color:var(--text-secondary)"><p>No events found in this category.</p></div>`;
    return;
  }
  eventsContainer.innerHTML = filtered.map((ev) => {
    const isFull = Boolean(ev.is_full);
    const badgeClass = getCategoryBadgeClass(ev.category);
    const maxCap = ev.max_participants || 100;
    const regCount = ev.registered_count || 0;
    const totalP = ev.total_participants || regCount;
    const pct = Math.min(100, Math.round((regCount / maxCap) * 100));
    const prizeFirst = ev.prizes?.first || '';
    const teamLabel = ev.team_size_label || (Number(ev.team_max) > 1 ? `1 - ${ev.team_max} Members` : 'Individual');
    const accent = ev.accent_color || '#6366f1';
    const rounds = Array.isArray(ev.rounds) ? ev.rounds : [];
    const rules = Array.isArray(ev.rules) ? ev.rules : [];
    const coords = Array.isArray(ev.coordinators) ? ev.coordinators : [];
    const hasDetails = rounds.length || rules.length || coords.length;
    return `
      <div class="event-card ${ev.featured ? 'event-featured' : ''}" id="card-${ev.id}" style="--ev-accent:${accent}">
        <div>
          <div class="event-badges">
            <span class="badge ${badgeClass}">${ev.category}</span>
            <span style="display:flex;gap:.35rem;align-items:center">
              ${ev.featured ? '<span class="badge badge-feat">★ Featured</span>' : ''}
              <span class="badge badge-dept">${ev.department}</span>
            </span>
          </div>
          <h4 class="event-title">${ev.name}</h4>
          <p class="event-desc">${ev.description || ''}</p>
          ${prizeFirst ? `<div class="event-prize">🏆 ${prizeFirst}</div>` : ''}
          <div class="event-details">
            <div class="event-detail-item"><span>📅</span><span>${ev.date_time || 'TBA'}</span></div>
            <div class="event-detail-item"><span>📍</span><span>${ev.venue || 'LBRCE Campus'}</span></div>
            <div class="event-detail-item"><span>👥</span><span>${teamLabel}</span></div>
            ${ev.reg_deadline ? `<div class="event-detail-item"><span>⏳</span><span>Register by: ${ev.reg_deadline}</span></div>` : ''}
          </div>
          ${hasDetails ? `
          <details class="event-more">
            <summary>Event details: rounds, rules & coordinators</summary>
            <div class="event-more-body">
              ${rounds.length ? `<div class="ev-more-title">Rounds</div><ol>${rounds.map((r) => `<li><strong>${r.name || ''}</strong>${r.description ? ` — ${r.description}` : ''}</li>`).join('')}</ol>` : ''}
              ${rules.length ? `<div class="ev-more-title">Rules</div><ul>${rules.map((r) => `<li>${r}</li>`).join('')}</ul>` : ''}
              ${coords.length ? `<div class="ev-more-title">Coordinators</div><ul>${coords.map((c) => `<li>${c.name || ''}${c.role ? ` (${c.role})` : ''}${c.phone ? ` — ${c.phone}` : ''}</li>`).join('')}</ul>` : ''}
            </div>
          </details>` : ''}
        </div>
        <div>
          <div class="event-capacity-bar">
            <div class="capacity-labels">
              <span>Entries: <strong>${regCount}</strong> / ${ev.max_participants || '∞'}${totalP !== regCount ? ` <span style="color:var(--text-muted)">(${totalP} players)</span>` : ''}</span>
              <span>${isFull ? '<strong style="color:var(--accent-rose)">Housefull</strong>' : `${ev.spots_left} spots left`}</span>
            </div>
            <div class="progress-track"><div class="progress-fill ${isFull ? 'full' : ''}" style="width:${pct}%"></div></div>
          </div>
          <div class="event-footer">
            <div class="event-fee">${ev.fee > 0 ? `₹${ev.fee} / Team` : 'Free Entry'}</div>
            <button class="btn ${isFull ? 'btn-secondary' : 'btn-primary'} btn-sm" onclick="openRegistrationModal('${ev.id}')" ${isFull ? 'disabled' : ''}>${isFull ? 'Registration Full' : 'Register Now →'}</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

function getCategoryBadgeClass(cat) {
  if (!cat) return 'badge-tech';
  const c = cat.toLowerCase();
  if (c.includes('cod')) return 'badge-coding';
  if (c.includes('robot')) return 'badge-robotics';
  if (c.includes('gaming') || c.includes('cultural')) return 'badge-gaming';
  return 'badge-tech';
}

function validateStep1() {
  hideRegError();
  const event_id = eventSelect.value;
  const name = document.getElementById('studentName').value.trim();
  const roll_number = document.getElementById('rollNumber').value.trim().toUpperCase();
  const email = document.getElementById('studentEmail').value.trim();
  const phone = document.getElementById('studentPhone').value.trim();
  const department = document.getElementById('departmentSelect').value;
  const year = document.getElementById('yearSelect').value;
  if (!event_id) { showRegError('Please choose an event.'); return false; }
  if (!name) { showRegError('Please enter your full name.'); return false; }
  if (!roll_number || roll_number.length < 4) { showRegError('Enter a valid roll number.'); return false; }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showRegError('Enter a valid email address.'); return false; }
  if (!phone || phone.replace(/[\s-+]/g, '').length < 10) { showRegError('Enter a valid 10-digit mobile number.'); return false; }
  if (!department) { showRegError('Select your department.'); return false; }
  if (!year) { showRegError('Select your year.'); return false; }
  return true;
}

function selectedEvent() {
  return allEvents.find((e) => e.id === eventSelect.value) || null;
}
function eventAllowsTeam(ev) {
  return ev && Number(ev.team_max) > 1;
}

// Details → team (if allowed) → payment
function proceedFromDetails() {
  hideRegError();
  if (!validateStep1()) return;
  const ev = selectedEvent();
  if (eventAllowsTeam(ev)) {
    showTeamSection(ev);
  } else {
    inTeamStep = false;
    goToStep(2);
  }
}

function showTeamSection(ev) {
  document.getElementById('regStep1').style.display = 'none';
  document.getElementById('regStep2').style.display = 'none';
  document.getElementById('teamSection').style.display = 'block';
  inTeamStep = true;
  const maxExtra = Number(ev.team_max) - 1;
  document.getElementById('teamSizeHint').textContent =
    `Team of up to ${ev.team_max} (${ev.team_size_label || ''}) — add up to ${maxExtra} member${maxExtra === 1 ? '' : 's'} besides yourself. Solo entry also allowed.`;
  const wrap = document.getElementById('teamMembersWrap');
  if (!wrap.children.length) addMemberRow();
  refreshAddMemberBtn();
}

function backFromPayment() {
  hideRegError();
  const ev = selectedEvent();
  if (inTeamStep && eventAllowsTeam(ev)) {
    document.getElementById('regStep2').style.display = 'none';
    document.getElementById('teamSection').style.display = 'block';
  } else {
    inTeamStep = false;
    goToStep(1);
  }
}

function proceedFromTeam() {
  hideRegError();
  const ev = selectedEvent();
  const members = collectMembers();
  if (members === null) return; // validation error already shown
  const teamSize = 1 + members.length;
  if (teamSize > Number(ev.team_max)) {
    return showRegError(`"${ev.name}" allows max ${ev.team_max} members per entry.`);
  }
  document.getElementById('teamSection').style.display = 'none';
  goToStep(2);
}

function addMemberRow(data = {}) {
  const ev = selectedEvent();
  const wrap = document.getElementById('teamMembersWrap');
  const maxExtra = (ev ? Number(ev.team_max) : 2) - 1;
  if (wrap.children.length >= maxExtra) {
    toast(`Max ${maxExtra} extra member(s) for this event.`, 'info');
    return;
  }
  const idx = wrap.children.length + 1;
  const div = document.createElement('div');
  div.className = 'team-member-card';
  div.innerHTML = `
    <div class="team-member-head">
      <strong>Member ${idx}</strong>
      <button type="button" class="btn-remove-member" title="Remove member">✕ Remove</button>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Full Name <span class="req">*</span></label>
        <input type="text" class="form-control m-name" placeholder="Member name" value="${(data.name || '').replace(/"/g, '&quot;')}"></div>
      <div class="form-group"><label class="form-label">Roll Number <span class="req">*</span></label>
        <input type="text" class="form-control m-roll" placeholder="e.g. 22761A0502" style="text-transform:uppercase" value="${(data.roll_number || '').replace(/"/g, '&quot;')}"></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Email <span class="req">*</span></label>
        <input type="email" class="form-control m-email" placeholder="member@domain.com" value="${(data.email || '').replace(/"/g, '&quot;')}"></div>
      <div class="form-group"><label class="form-label">Phone <span class="req">*</span></label>
        <input type="tel" class="form-control m-phone" placeholder="10-digit mobile" maxlength="10" value="${(data.phone || '').replace(/"/g, '&quot;')}"></div>
    </div>`;
  div.querySelector('.btn-remove-member').addEventListener('click', () => {
    div.remove();
    renumberMembers();
    refreshAddMemberBtn();
  });
  wrap.appendChild(div);
  refreshAddMemberBtn();
}

function renumberMembers() {
  document.querySelectorAll('#teamMembersWrap .team-member-card').forEach((card, i) => {
    card.querySelector('.team-member-head strong').textContent = `Member ${i + 1}`;
  });
}

function refreshAddMemberBtn() {
  const ev = selectedEvent();
  const wrap = document.getElementById('teamMembersWrap');
  const btn = document.getElementById('btnAddMember');
  if (!ev || !btn || !wrap) return;
  btn.style.display = wrap.children.length >= (Number(ev.team_max) - 1) ? 'none' : '';
}

// Non-validating snapshot for summary display
function collectMembersRaw() {
  const out = [];
  document.querySelectorAll('#teamMembersWrap .team-member-card').forEach((card) => {
    const name = card.querySelector('.m-name').value.trim();
    const roll = card.querySelector('.m-roll').value.trim();
    if (name || roll) out.push({ name, roll_number: roll });
  });
  return out;
}

// Returns array of members, [] if none filled, or null on validation error
function collectMembers() {
  const cards = document.querySelectorAll('#teamMembersWrap .team-member-card');
  const members = [];
  const leadRoll = document.getElementById('rollNumber').value.trim().toUpperCase();
  const seen = new Set([leadRoll]);
  for (let i = 0; i < cards.length; i++) {
    const name = cards[i].querySelector('.m-name').value.trim();
    const roll = cards[i].querySelector('.m-roll').value.trim().toUpperCase();
    const email = cards[i].querySelector('.m-email').value.trim();
    const phone = cards[i].querySelector('.m-phone').value.trim();
    const empty = !name && !roll && !email && !phone;
    if (empty) continue; // skip untouched blank rows
    if (!name || !roll || !email || !phone) {
      showRegError(`Member ${i + 1}: fill all fields or remove the row.`);
      return null;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showRegError(`Member ${i + 1}: invalid email.`); return null; }
    if (phone.replace(/[\s-+]/g, '').length < 10) { showRegError(`Member ${i + 1}: invalid 10-digit phone.`); return null; }
    if (seen.has(roll)) { showRegError(`Member ${i + 1}: roll number already used in this team.`); return null; }
    seen.add(roll);
    members.push({ name, roll_number: roll, email, phone });
  }
  return members;
}

async function goToStep(step) {
  hideRegError();
  if (step === 2) {
    if (!validateStep1()) return;
    const ev = allEvents.find((e) => e.id === eventSelect.value);
    const fee = ev ? Number(ev.fee) || 0 : 0;
    document.getElementById('paySummaryEventName').innerText = ev ? ev.name : 'Event';
    document.getElementById('paySummaryMeta').innerText = `${ev?.date_time || ''} • ${ev?.venue || ''}`;
    document.getElementById('paySummaryAmount').innerText = `₹${fee}`;
    document.getElementById('paySummaryStudent').innerText = document.getElementById('studentName').value.trim();
    document.getElementById('paySummaryRoll').innerText = document.getElementById('rollNumber').value.trim().toUpperCase();
    document.getElementById('instantPayBtnAmount').innerText = `₹${fee}`;
    const rzAmt = document.getElementById('razorpayPayAmount');
    if (rzAmt) rzAmt.innerText = `₹${fee}`;
    refreshGatewayUI();
    // Fresh payment state for this event (online payment only)
    razorpayPaymentToken = '';
    razorpayPaymentId = '';
    generatedInstantTxnId = '';
    const payNotice = document.getElementById('instantPaySuccessNotice');
    if (payNotice) payNotice.style.display = 'none';
    const panelInstant = document.getElementById('panelInstant');
    if (panelInstant) panelInstant.style.display = 'block';
    currentPaymentMethod = razorpayEnabled ? 'RAZORPAY' : (document.getElementById('instantModeSelect')?.value || 'CARD');
    const teamLine = document.getElementById('paySummaryTeam');
    if (teamLine) {
      const tMembers = inTeamStep ? collectMembersRaw() : [];
      const tName = document.getElementById('teamName')?.value.trim();
      if (tMembers.length || tName) {
        teamLine.style.display = 'block';
        document.getElementById('paySummaryTeamName').innerText = tName || '(no team name)';
        document.getElementById('paySummaryTeamSize').innerText = `• ${1 + tMembers.length} member(s)`;
      } else teamLine.style.display = 'none';
    }

    document.getElementById('regStep1').style.display = 'none';
    document.getElementById('teamSection').style.display = 'none';
    document.getElementById('regStep2').style.display = 'block';
    document.getElementById('stepIndicator1')?.classList.remove('active');
    document.getElementById('stepIndicator1')?.classList.add('completed');
    document.getElementById('stepIndicator2')?.classList.add('active');
    currentStep = 2;
  } else {
    document.getElementById('regStep2').style.display = 'none';
    document.getElementById('teamSection').style.display = 'none';
    inTeamStep = false;
    document.getElementById('regStep1').style.display = 'block';
    document.getElementById('stepIndicator2')?.classList.remove('active');
    document.getElementById('stepIndicator1')?.classList.remove('completed');
    document.getElementById('stepIndicator1')?.classList.add('active');
    currentStep = 1;
  }
}

window.openRegistrationModal = function (eventId) {
  hideRegError();
  goToStep(1);
  document.getElementById('teamMembersWrap').innerHTML = '';
  const teamNameEl = document.getElementById('teamName');
  if (teamNameEl) teamNameEl.value = '';
  if (eventId && eventSelect) { eventSelect.value = eventId; updateEventFeeBadge(); }
  const se = document.getElementById('studentEmail');
  if (se && verifiedEmail && !se.value) se.value = verifiedEmail;
  refreshUserBadge();
  registrationModal?.classList.add('active');
};

function closeRegistrationModal() { registrationModal?.classList.remove('active'); hideRegError(); goToStep(1); }
function openLookupModal() {
  const err = document.getElementById('lookupErrorBox');
  if (err) err.style.display = 'none';
  lookupModal?.classList.add('active');
}
function closeLookupModal() { lookupModal?.classList.remove('active'); }
function closeTicketModal() { ticketModal?.classList.remove('active'); }
function showRegError(msg) {
  if (regErrorBox && regErrorMessage) {
    regErrorMessage.innerText = msg;
    regErrorBox.style.display = 'flex';
    try { regErrorBox.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { /* ignore */ }
  }
}
function hideRegError() { if (regErrorBox) regErrorBox.style.display = 'none'; }

async function handleRegistrationSubmit(e) {
  e.preventDefault();
  hideRegError();
  if (currentStep === 1 && !inTeamStep) { proceedFromDetails(); return; }
  if (inTeamStep) { proceedFromTeam(); return; }

  const event_id = eventSelect.value;
  const name = document.getElementById('studentName').value.trim();
  const roll_number = document.getElementById('rollNumber').value.trim().toUpperCase();
  const email = document.getElementById('studentEmail').value.trim();
  const phone = document.getElementById('studentPhone').value.trim();
  const college = document.getElementById('collegeName').value.trim();
  const department = document.getElementById('departmentSelect').value;
  const year = document.getElementById('yearSelect').value;
  const ev = allEvents.find((e) => e.id === event_id);
  const fee = ev ? Number(ev.fee) || 0 : 0;

  let transaction_id = '';
  let payment_method = currentPaymentMethod;
  let payment_token = undefined;
  if (fee === 0) {
    // Free event — no payment needed
    payment_method = 'UPI';
    transaction_id = 'FREE-ENTRY';
  } else if (currentPaymentMethod === 'RAZORPAY') {
    if (!razorpayPaymentToken) {
      return showRegError('Please complete the online payment first (click Pay Securely via Razorpay).');
    }
    transaction_id = razorpayPaymentId.toUpperCase();
    payment_method = 'RAZORPAY';
    payment_token = razorpayPaymentToken;
  } else {
    // Fallback simulation (only when Razorpay keys are not configured)
    transaction_id = generatedInstantTxnId || ('TXN-' + Math.floor(100000 + Math.random() * 900000));
    payment_method = currentPaymentMethod;
  }

  btnSubmitReg.disabled = true;
  btnRegText.style.display = 'none';
  btnRegSpinner.style.display = 'inline';
  // Collect team (re-validate at submit time)
  let team_name = document.getElementById('teamName')?.value.trim() || '';
  let members = [];
  if (inTeamStep || (ev && Number(ev.team_max) > 1)) {
    const collected = collectMembers();
    if (collected === null) {
      btnSubmitReg.disabled = false;
      btnRegText.style.display = 'inline';
      btnRegSpinner.style.display = 'none';
      return;
    }
    members = collected;
  }
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id, name, roll_number, email, phone, college, department, year, payment_method, transaction_id, email_token: emailToken || undefined, team_name, members, payment_token })
    });
    const result = await res.json();
    if (res.status === 201 && result.success) {
      closeRegistrationModal();
      registrationForm.reset();
      generatedInstantTxnId = '';
      razorpayPaymentToken = '';
      razorpayPaymentId = '';
      document.getElementById('teamMembersWrap').innerHTML = '';
      const teamNameEl = document.getElementById('teamName');
      if (teamNameEl) teamNameEl.value = '';
      const notice = document.getElementById('instantPaySuccessNotice');
      if (notice) notice.style.display = 'none';
      const otpBox = document.getElementById('regOtpBox');
      if (otpBox) otpBox.style.display = 'none';
      showTicket(result.data, result.mailSent);
      toast(result.mailSent ? `Pass + token mailed to ${email}` : 'Registered! (mail server not configured)', result.mailSent ? 'success' : 'info');
      loadEvents();
    } else {
      showRegError(result.message || 'Registration failed.');
    }
  } catch {
    showRegError('Failed to connect to server.');
  } finally {
    btnSubmitReg.disabled = false;
    btnRegText.style.display = 'inline';
    btnRegSpinner.style.display = 'none';
  }
}

function showTicket(data, mailSent) {
  lastTicketData = data;
  document.getElementById('passCodeDisplay').innerText = data.registration_id || 'LAK-CONFIRMED';
  document.getElementById('passEventName').innerText = data.event_name;
  document.getElementById('passCategory').innerText = `${data.category} • ${data.fee > 0 ? '₹' + data.fee : 'Free'}`;
  document.getElementById('passAmountPaid').innerText = `₹${data.amount_paid ?? data.fee ?? 0}`;
  document.getElementById('passPaymentMethod').innerText = data.payment_method || 'UPI';
  document.getElementById('passTransactionId').innerText = data.transaction_id || 'CONFIRMED';
  document.getElementById('passStudentName').innerText = data.name;
  document.getElementById('passRollNumber').innerText = data.roll_number;
  document.getElementById('passDeptYear').innerText = `${data.department} • ${data.year}`;
  document.getElementById('passCollege').innerText = data.college || 'LBRCE';
  document.getElementById('passDateTime').innerText = data.date_time || 'Event Day';
  document.getElementById('passVenue').innerText = data.venue || 'LBRCE Campus';
  document.getElementById('passRegisteredAt').innerText = data.registered_at ? new Date(data.registered_at).toLocaleDateString() : new Date().toLocaleDateString();
  const tokEl = document.getElementById('passEntryToken');
  if (tokEl) tokEl.innerText = data.entry_token || data.registration_id;
  const qrImg = document.getElementById('passEntryQr');
  if (qrImg) {
    if (data.entryQrDataUrl) { qrImg.src = data.entryQrDataUrl; qrImg.style.display = 'block'; }
    else { qrImg.style.display = 'none'; }
  }
  const mailEl = document.getElementById('passMailNotice');
  if (mailEl) {
    mailEl.textContent = mailSent === true
      ? `📧 Pass + entry token sent to ${data.email}.`
      : mailSent === false
        ? `⚠️ Mail server not configured — save this pass. Token: ${data.entry_token || ''}`
        : `📧 Pass details ${data.email ? 'mailed to ' + data.email : 'ready'}.`;
  }
  const teamBlock = document.getElementById('passTeamBlock');
  if (teamBlock) {
    const tMembers = Array.isArray(data.members) ? data.members : [];
    if (data.team_name || tMembers.length) {
      teamBlock.style.display = 'flex';
      document.getElementById('passTeamName').innerText =
        `${data.team_name || 'Team'} (${1 + tMembers.length} member${tMembers.length === 0 ? '' : 's'})`;
      document.getElementById('passTeamMembers').innerHTML =
        tMembers.map((m) => `<span>• ${m.name} (${m.roll_number})</span>`).join('');
    } else teamBlock.style.display = 'none';
  }
  ticketModal?.classList.add('active');
}

async function resendPassEmail() {
  if (!lastTicketData) return toast('Open a pass first.', 'info');
  const btn = document.getElementById('btnResendPass');
  btn.disabled = true;
  const orig = btn.innerHTML;
  btn.innerHTML = '⏳ Sending…';
  try {
    const res = await fetch('/api/register/resend-pass', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_id: lastTicketData.event_id, roll_number: lastTicketData.roll_number })
    });
    const data = await res.json();
    if (data.success) {
      toast(data.message, 'success');
      const mailEl = document.getElementById('passMailNotice');
      if (mailEl) mailEl.textContent = `📧 ${data.message}`;
    } else {
      toast(data.message || 'Resend failed.', 'info');
    }
  } catch {
    toast('Network error while re-sending email.', 'info');
  } finally {
    btn.disabled = false;
    btn.innerHTML = orig;
  }
}

async function handleLookupSubmit(e) {
  e.preventDefault();
  const event_id = document.getElementById('lookupEventSelect').value;
  const roll_number = document.getElementById('lookupRollNumber').value.trim().toUpperCase();
  const errorBox = document.getElementById('lookupErrorBox');
  const errorMsg = document.getElementById('lookupErrorMessage');
  if (!event_id || !roll_number) {
    errorBox.style.display = 'flex';
    errorMsg.innerText = 'Select an event and enter your roll number.';
    return;
  }
  try {
    const res = await fetch(`/api/register/lookup?event_id=${encodeURIComponent(event_id)}&roll_number=${encodeURIComponent(roll_number)}`);
    const data = await res.json();
    if (res.ok && data.success) { closeLookupModal(); showTicket(data.data, undefined); }
    else { errorBox.style.display = 'flex'; errorMsg.innerText = data.message || 'No matching pass found.'; }
  } catch {
    errorBox.style.display = 'flex';
    errorMsg.innerText = 'Server error during lookup.';
  }
}
