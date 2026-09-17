// Frontend state
let allEvents = [];
let currentCategory = 'all';

// DOM Elements
const eventsContainer = document.getElementById('eventsContainer');
const categoryFilters = document.getElementById('categoryFilters');
const registrationModal = document.getElementById('registrationModal');
const ticketModal = document.getElementById('ticketModal');
const lookupModal = document.getElementById('lookupModal');

const registrationForm = document.getElementById('registrationForm');
const eventSelect = document.getElementById('eventSelect');
const lookupEventSelect = document.getElementById('lookupEventSelect');
const regErrorBox = document.getElementById('regErrorBox');
const regErrorMessage = document.getElementById('regErrorMessage');
const btnSubmitReg = document.getElementById('btnSubmitReg');
const btnRegText = document.getElementById('btnRegText');
const btnRegSpinner = document.getElementById('btnRegSpinner');

// Init
document.addEventListener('DOMContentLoaded', () => {
  loadEvents();
  setupEventListeners();
});

// Setup event listeners
function setupEventListeners() {
  // Category tabs filter
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

  // Modal close buttons
  document.getElementById('btnCloseRegModal')?.addEventListener('click', closeRegistrationModal);
  document.getElementById('btnCancelReg')?.addEventListener('click', closeRegistrationModal);
  document.getElementById('btnCloseTicketModal')?.addEventListener('click', closeTicketModal);
  document.getElementById('btnDoneTicket')?.addEventListener('click', closeTicketModal);

  // Lookup modal toggles
  document.getElementById('btnOpenLookup')?.addEventListener('click', openLookupModal);
  document.getElementById('btnQuickLookupHero')?.addEventListener('click', openLookupModal);
  document.getElementById('btnCloseLookupModal')?.addEventListener('click', closeLookupModal);
  document.getElementById('btnCancelLookup')?.addEventListener('click', closeLookupModal);

  // Close modals on outside click
  [registrationModal, ticketModal, lookupModal].forEach((modal) => {
    modal?.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
      }
    });
  });

  // Print button
  document.getElementById('btnPrintTicket')?.addEventListener('click', () => {
    window.print();
  });

  // Registration Form Submission
  if (registrationForm) {
    registrationForm.addEventListener('submit', handleRegistrationSubmit);
  }

  // Lookup Form Submission
  const lookupForm = document.getElementById('lookupForm');
  if (lookupForm) {
    lookupForm.addEventListener('submit', handleLookupSubmit);
  }
}

// Fetch events from backend API
async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    if (data.success) {
      allEvents = data.data;
      renderEvents();
      populateEventDropdowns();
    } else {
      eventsContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--accent-rose);">Failed to load events: ${data.message}</div>`;
    }
  } catch (err) {
    console.error('Network error loading events:', err);
    eventsContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--accent-rose);">Error connecting to server. Please check your network.</div>`;
  }
}

// Populate event select dropdowns
function populateEventDropdowns() {
  const options = allEvents.map((ev) => {
    const fullText = ev.is_full ? ' [FULL]' : '';
    return `<option value="${ev.id}">${ev.name} (${ev.category})${fullText}</option>`;
  }).join('');

  if (eventSelect) {
    eventSelect.innerHTML = '<option value="">-- Choose an Event --</option>' + options;
  }
  if (lookupEventSelect) {
    lookupEventSelect.innerHTML = '<option value="">-- Select Event --</option>' + options;
  }
}

// Render events cards
function renderEvents() {
  if (!eventsContainer) return;

  const filtered = currentCategory === 'all' 
    ? allEvents 
    : allEvents.filter((ev) => ev.category.toLowerCase().includes(currentCategory.toLowerCase()));

  if (filtered.length === 0) {
    eventsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 0; color: var(--text-secondary);">
        <p>No events found in this category.</p>
      </div>
    `;
    return;
  }

  eventsContainer.innerHTML = filtered.map((ev) => {
    const isFull = Boolean(ev.is_full);
    const badgeClass = getCategoryBadgeClass(ev.category);
    const maxCap = ev.max_participants || 100;
    const regCount = ev.registered_count || 0;
    const pct = Math.min(100, Math.round((regCount / maxCap) * 100));

    return `
      <div class="event-card" id="card-${ev.id}">
        <div>
          <div class="event-badges">
            <span class="badge ${badgeClass}">${ev.category}</span>
            <span class="badge badge-dept">${ev.department}</span>
          </div>

          <h4 class="event-title">${ev.name}</h4>
          <p class="event-desc">${ev.description || ''}</p>

          <div class="event-details">
            <div class="event-detail-item">
              <span>📅</span>
              <span>${ev.date_time || 'TBA'}</span>
            </div>
            <div class="event-detail-item">
              <span>📍</span>
              <span>${ev.venue || 'LBRCE Campus'}</span>
            </div>
          </div>
        </div>

        <div>
          <div class="event-capacity-bar">
            <div class="capacity-labels">
              <span>Registered: <strong>${regCount}</strong> / ${ev.max_participants || '∞'}</span>
              <span>${isFull ? '<strong style="color: var(--accent-rose)">Housefull</strong>' : `${ev.spots_left} spots left`}</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill ${isFull ? 'full' : ''}" style="width: ${pct}%;"></div>
            </div>
          </div>

          <div class="event-footer">
            <div class="event-fee">${ev.fee > 0 ? `₹${ev.fee} / Team` : 'Free Entry'}</div>
            <button 
              class="btn ${isFull ? 'btn-secondary' : 'btn-primary'} btn-sm" 
              onclick="openRegistrationModal('${ev.id}')"
              ${isFull ? 'disabled' : ''}
            >
              ${isFull ? 'Registration Full' : 'Register Now →'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Category Badge Helper
function getCategoryBadgeClass(cat) {
  if (!cat) return 'badge-tech';
  const c = cat.toLowerCase();
  if (c.includes('cod')) return 'badge-coding';
  if (c.includes('robot')) return 'badge-robotics';
  if (c.includes('gaming') || c.includes('cultural')) return 'badge-gaming';
  return 'badge-tech';
}

// Open Registration Modal with pre-selected event
window.openRegistrationModal = function (eventId) {
  hideRegError();
  if (eventId && eventSelect) {
    eventSelect.value = eventId;
  }
  registrationModal?.classList.add('active');
};

function closeRegistrationModal() {
  registrationModal?.classList.remove('active');
  hideRegError();
}

function openLookupModal() {
  const err = document.getElementById('lookupErrorBox');
  if (err) err.style.display = 'none';
  lookupModal?.classList.add('active');
}

function closeLookupModal() {
  lookupModal?.classList.remove('active');
}

function closeTicketModal() {
  ticketModal?.classList.remove('active');
}

function showRegError(msg) {
  if (regErrorBox && regErrorMessage) {
    regErrorMessage.innerText = msg;
    regErrorBox.style.display = 'flex';
    regErrorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function hideRegError() {
  if (regErrorBox) {
    regErrorBox.style.display = 'none';
  }
}

// Handle registration submission
async function handleRegistrationSubmit(e) {
  e.preventDefault();
  hideRegError();

  const event_id = eventSelect.value;
  const name = document.getElementById('studentName').value.trim();
  const roll_number = document.getElementById('rollNumber').value.trim().toUpperCase();
  const email = document.getElementById('studentEmail').value.trim();
  const phone = document.getElementById('studentPhone').value.trim();
  const college = document.getElementById('collegeName').value.trim();
  const department = document.getElementById('departmentSelect').value;
  const year = document.getElementById('yearSelect').value;

  if (!event_id) return showRegError('Please choose an event to register for.');
  if (!name) return showRegError('Please enter your full name.');
  if (!roll_number) return showRegError('Please enter your college roll number.');
  if (!email || !email.includes('@')) return showRegError('Please enter a valid email address.');
  if (!phone || phone.length < 10) return showRegError('Please enter a valid 10-digit mobile number.');
  if (!department) return showRegError('Please select your department/branch.');
  if (!year) return showRegError('Please select your year of study.');

  // Disable button and show spinner
  btnSubmitReg.disabled = true;
  btnRegText.style.display = 'none';
  btnRegSpinner.style.display = 'inline';

  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id,
        name,
        roll_number,
        email,
        phone,
        college,
        department,
        year
      })
    });

    const result = await res.json();

    if (res.status === 201 && result.success) {
      // Success!
      closeRegistrationModal();
      registrationForm.reset();
      showTicket(result.data);
      // Refresh event participant counts
      loadEvents();
    } else {
      // Show error (duplicate or capacity or validation)
      showRegError(result.message || 'Registration failed. Please check your details.');
    }
  } catch (err) {
    console.error('Submission error:', err);
    showRegError('Failed to connect to server. Please check your network connection.');
  } finally {
    btnSubmitReg.disabled = false;
    btnRegText.style.display = 'inline';
    btnRegSpinner.style.display = 'none';
  }
}

// Display Registration Pass Ticket
function showTicket(data) {
  document.getElementById('passCodeDisplay').innerText = data.registration_id || 'LAK-CONFIRMED';
  document.getElementById('passEventName').innerText = data.event_name;
  document.getElementById('passCategory').innerText = `${data.category} • ${data.fee > 0 ? '₹' + data.fee : 'Free'}`;
  document.getElementById('passStudentName').innerText = data.name;
  document.getElementById('passRollNumber').innerText = data.roll_number;
  document.getElementById('passDeptYear').innerText = `${data.department} • ${data.year}`;
  document.getElementById('passCollege').innerText = data.college || 'LBRCE';
  document.getElementById('passDateTime').innerText = data.date_time || 'Event Day';
  document.getElementById('passVenue').innerText = data.venue || 'LBRCE Campus';

  const regDate = data.registered_at ? new Date(data.registered_at).toLocaleDateString() : new Date().toLocaleDateString();
  document.getElementById('passRegisteredAt').innerText = regDate;

  ticketModal?.classList.add('active');
}

// Handle Pass Lookup
async function handleLookupSubmit(e) {
  e.preventDefault();
  const event_id = document.getElementById('lookupEventSelect').value;
  const roll_number = document.getElementById('lookupRollNumber').value.trim().toUpperCase();
  const errorBox = document.getElementById('lookupErrorBox');
  const errorMsg = document.getElementById('lookupErrorMessage');

  if (!event_id || !roll_number) {
    errorBox.style.display = 'flex';
    errorMsg.innerText = 'Please select an event and enter your roll number.';
    return;
  }

  try {
    const res = await fetch(`/api/register/lookup?event_id=${encodeURIComponent(event_id)}&roll_number=${encodeURIComponent(roll_number)}`);
    const data = await res.json();

    if (res.ok && data.success) {
      closeLookupModal();
      showTicket(data.data);
    } else {
      errorBox.style.display = 'flex';
      errorMsg.innerText = data.message || 'No matching pass found for this Roll Number.';
    }
  } catch (err) {
    errorBox.style.display = 'flex';
    errorMsg.innerText = 'Server error during lookup. Please try again.';
  }
}
