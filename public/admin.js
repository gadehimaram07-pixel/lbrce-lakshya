// Admin portal state
let authToken = localStorage.getItem('lakshya_admin_token') || null;
let currentPage = 1;
const pageSize = 50;
let searchTimeout = null;

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboardSection = document.getElementById('dashboardSection');
const authNavControls = document.getElementById('authNavControls');
const adminUsernameBadge = document.getElementById('adminUsernameBadge');

const adminLoginForm = document.getElementById('adminLoginForm');
const loginErrorBox = document.getElementById('loginErrorBox');
const loginErrorMessage = document.getElementById('loginErrorMessage');
const btnLoginSubmit = document.getElementById('btnLoginSubmit');
const btnLoginText = document.getElementById('btnLoginText');
const btnLoginSpinner = document.getElementById('btnLoginSpinner');
const btnLogout = document.getElementById('btnLogout');

const metricTotalRegs = document.getElementById('metricTotalRegs');
const metricTotalRevenue = document.getElementById('metricTotalRevenue');
const metricUniqueStudents = document.getElementById('metricUniqueStudents');
const metricTotalEvents = document.getElementById('metricTotalEvents');
const eventStatsGrid = document.getElementById('eventStatsGrid');

const adminSearchInput = document.getElementById('adminSearchInput');
const filterEventSelect = document.getElementById('filterEventSelect');
const filterDeptSelect = document.getElementById('filterDeptSelect');
const btnResetFilters = document.getElementById('btnResetFilters');
const btnExportCSV = document.getElementById('btnExportCSV');
const btnRefreshStats = document.getElementById('btnRefreshStats');

const registrationsTableBody = document.getElementById('registrationsTableBody');
const tableCountText = document.getElementById('tableCountText');
const paginationInfo = document.getElementById('paginationInfo');
const btnPrevPage = document.getElementById('btnPrevPage');
const btnNextPage = document.getElementById('btnNextPage');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();

  if (authToken) {
    showDashboardView();
  } else {
    showLoginView();
  }
});

function setupEventListeners() {
  adminLoginForm?.addEventListener('submit', handleLogin);
  btnLogout?.addEventListener('click', handleLogout);

  btnRefreshStats?.addEventListener('click', () => {
    loadStats();
    loadRegistrations();
  });

  btnExportCSV?.addEventListener('click', handleExportCSV);

  // Search input debounced
  adminSearchInput?.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      currentPage = 1;
      loadRegistrations();
    }, 300);
  });

  filterEventSelect?.addEventListener('change', () => {
    currentPage = 1;
    loadRegistrations();
  });

  filterDeptSelect?.addEventListener('change', () => {
    currentPage = 1;
    loadRegistrations();
  });

  btnResetFilters?.addEventListener('click', () => {
    adminSearchInput.value = '';
    filterEventSelect.value = 'all';
    filterDeptSelect.value = 'all';
    currentPage = 1;
    loadRegistrations();
  });

  btnPrevPage?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      loadRegistrations();
    }
  });

  btnNextPage?.addEventListener('click', () => {
    currentPage++;
    loadRegistrations();
  });
}

function showLoginView() {
  loginSection.style.display = 'block';
  dashboardSection.style.display = 'none';
  authNavControls.style.display = 'none';
}

function showDashboardView() {
  loginSection.style.display = 'none';
  dashboardSection.style.display = 'block';
  authNavControls.style.display = 'flex';
  
  const savedUser = localStorage.getItem('lakshya_admin_user') || 'admin';
  adminUsernameBadge.innerText = savedUser;

  loadStats();
  loadRegistrations();
}

// Handle Admin Login (password + optional emailed OTP second factor)
let pendingOtpUser = null;
async function handleLogin(e) {
  e.preventDefault();
  loginErrorBox.style.display = 'none';

  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!username || !password) {
    loginErrorBox.style.display = 'flex';
    loginErrorMessage.innerText = 'Please enter both username and password.';
    return;
  }

  // If OTP step is visible, verify OTP instead
  const otpGroup = document.getElementById('adminOtpGroup');
  const otpVisible = otpGroup && otpGroup.style.display !== 'none';
  if (otpVisible || pendingOtpUser) {
    const otp = document.getElementById('loginOtp')?.value.trim();
    if (!otp) {
      loginErrorBox.style.display = 'flex';
      loginErrorMessage.innerText = 'Enter the OTP sent to the organizer mail.';
      return;
    }
    btnLoginSubmit.disabled = true;
    btnLoginText.style.display = 'none';
    btnLoginSpinner.style.display = 'inline';
    try {
      const res = await fetch('/api/admin/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: pendingOtpUser || username, otp })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        authToken = data.token;
        localStorage.setItem('lakshya_admin_token', authToken);
        localStorage.setItem('lakshya_admin_user', data.username);
        pendingOtpUser = null;
        if (otpGroup) otpGroup.style.display = 'none';
        showDashboardView();
      } else {
        loginErrorBox.style.display = 'flex';
        loginErrorMessage.innerText = data.message || 'OTP verification failed.';
      }
    } catch (err) {
      loginErrorBox.style.display = 'flex';
      loginErrorMessage.innerText = 'Network error. Please try again.';
    } finally {
      btnLoginSubmit.disabled = false;
      btnLoginText.style.display = 'inline';
      btnLoginSpinner.style.display = 'none';
    }
    return;
  }

  btnLoginSubmit.disabled = true;
  btnLoginText.style.display = 'none';
  btnLoginSpinner.style.display = 'inline';

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (res.ok && data.success) {
      if (data.otpRequired) {
        pendingOtpUser = username;
        if (otpGroup) otpGroup.style.display = 'block';
        btnLoginText.innerText = 'Verify OTP & Sign In';
        showLoginMsg('ok', data.message);
        document.getElementById('loginOtp')?.focus();
        return;
      }
      authToken = data.token;
      localStorage.setItem('lakshya_admin_token', authToken);
      localStorage.setItem('lakshya_admin_user', data.username);
      showDashboardView();
    } else {
      loginErrorBox.style.display = 'flex';
      loginErrorMessage.innerText = data.message || 'Authentication failed.';
    }
  } catch (err) {
    loginErrorBox.style.display = 'flex';
    loginErrorMessage.innerText = 'Network error. Please try again.';
  } finally {
    btnLoginSubmit.disabled = false;
    btnLoginText.style.display = 'inline';
    btnLoginSpinner.style.display = 'none';
    if (!pendingOtpUser) btnLoginText.innerText = 'Sign In to Dashboard';
  }
}

function showLoginMsg(kind, msg) {
  loginErrorMessage.innerText = msg;
  loginErrorBox.className = kind === 'ok' ? 'alert-box alert-success' : 'alert-box alert-danger';
  loginErrorBox.style.display = 'flex';
}
function hideLoginMsg() {
  loginErrorBox.style.display = 'none';
  loginErrorBox.className = 'alert-box alert-danger';
}

function handleLogout() {
  authToken = null;
  localStorage.removeItem('lakshya_admin_token');
  localStorage.removeItem('lakshya_admin_user');
  showLoginView();
}

// Load Metrics & Event Capacity Breakdown
async function loadStats() {
  try {
    const res = await fetch('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.status === 401 || res.status === 403) {
      handleLogout();
      return;
    }

    const json = await res.json();
    if (!json.success) return;

    const stats = json.data;
    metricTotalRegs.innerText = stats.totalRegistrations;
    if (metricTotalRevenue) {
      metricTotalRevenue.innerText = '₹' + Number(stats.totalRevenue || 0).toLocaleString();
    }
    metricUniqueStudents.innerText = stats.uniqueStudents;
    metricTotalEvents.innerText = stats.totalEvents;

    // Populate Event Select filter if empty
    if (filterEventSelect && filterEventSelect.options.length <= 1) {
      stats.eventStats.forEach((ev) => {
        const opt = document.createElement('option');
        opt.value = ev.id;
        opt.innerText = ev.name;
        filterEventSelect.appendChild(opt);
      });
    }

    // Render Event capacity mini progress cards
    if (eventStatsGrid) {
      eventStatsGrid.innerHTML = stats.eventStats.map((ev) => {
        const cap = ev.max_participants || 100;
        const count = ev.registered_count || 0;
        const pct = Math.min(100, Math.round((count / cap) * 100));
        const isFull = ev.max_participants && count >= ev.max_participants;

        return `
          <div style="background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 0.85rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); margin-bottom: 0.25rem;">
              <strong style="color: var(--text-primary);">${ev.name}</strong>
              <span style="color: ${isFull ? 'var(--accent-rose)' : 'var(--accent-cyan)'};">${count}/${ev.max_participants || '∞'}</span>
            </div>
            <div class="progress-track" style="height: 5px;">
              <div class="progress-fill ${isFull ? 'full' : ''}" style="width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading stats:', err);
  }
}

// Load Registrations Table
async function loadRegistrations() {
  if (!registrationsTableBody) return;

  const event_id = filterEventSelect?.value || 'all';
  const department = filterDeptSelect?.value || 'all';
  const search = adminSearchInput?.value.trim() || '';

  const queryParams = new URLSearchParams({
    page: currentPage,
    limit: pageSize,
    event_id,
    department,
    search
  });

  try {
    const res = await fetch(`/api/admin/registrations?${queryParams.toString()}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.status === 401 || res.status === 403) {
      handleLogout();
      return;
    }

    const json = await res.json();
    if (!json.success) {
      registrationsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--accent-rose);padding:2rem;">Failed to fetch data: ${json.message}</td></tr>`;
      return;
    }

    const records = json.data;
    const total = json.total;

    tableCountText.innerText = `Showing ${records.length} of ${total} registrations`;
    paginationInfo.innerText = `Page ${currentPage} of ${Math.max(1, Math.ceil(total / pageSize))}`;
    btnPrevPage.disabled = currentPage <= 1;
    btnNextPage.disabled = currentPage >= Math.ceil(total / pageSize);

    if (records.length === 0) {
      registrationsTableBody.innerHTML = `
        <tr>
          <td colspan="10" style="text-align: center; padding: 3rem 0; color: var(--text-secondary);">
            No matching registrations found.
          </td>
        </tr>
      `;
      return;
    }

    registrationsTableBody.innerHTML = records.map((r) => {
      const dateStr = new Date(r.created_at).toLocaleString();
      const amountPaid = r.amount_paid !== undefined && r.amount_paid !== null ? r.amount_paid : 0;
      const isPaid = amountPaid > 0;
      let teamMembers = [];
      try { teamMembers = JSON.parse(r.members || '[]'); } catch (e) { teamMembers = []; }
      const teamSize = 1 + teamMembers.length;
      const teamLine = (r.team_name || teamMembers.length)
        ? `<div style="font-size:0.72rem;color:#fbbf24;margin-top:0.15rem;">👥 ${r.team_name || 'Team'} (${teamSize})${teamMembers.length ? ' — ' + teamMembers.map((m) => `${m.name} [${m.roll_number}]`).join(', ') : ''}</div>`
        : '';
      return `
        <tr>
          <td><code style="background:var(--bg-secondary);padding:0.2rem 0.4rem;border-radius:4px;color:var(--accent-cyan);font-weight:700;">${r.id}</code></td>
          <td>
            <div style="font-weight:600; color: #fff;">${r.event_name}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">${r.event_category}</div>
          </td>
          <td style="font-weight:600;">${r.name}${teamLine}</td>
          <td><span style="color:#fbbf24; font-family:monospace; font-weight:700;">${r.roll_number}</span></td>
          <td>${r.department} • <span style="color:var(--text-secondary);">${r.year}</span></td>
          <td>
            <div>📱 ${r.phone}</div>
            <div style="font-size:0.75rem; color:var(--text-secondary);">✉️ ${r.email}</div>
          </td>
          <td>
            <div class="payment-tag ${isPaid ? 'payment-tag-paid' : 'payment-tag-free'}">
              <span>${isPaid ? `₹${amountPaid}` : 'Free'}</span>
              <span>•</span>
              <span>${r.payment_method || 'UPI'}</span>
            </div>
            <div style="font-size:0.72rem; color:var(--text-muted); font-family:monospace; margin-top:0.2rem;" title="Transaction ID">
              ${r.transaction_id ? r.transaction_id : 'N/A'}
            </div>
          </td>
          <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis;" title="${r.college}">${r.college}</td>
          <td style="font-size: 0.78rem; color: var(--text-muted);">${dateStr}</td>
          <td style="text-align: right;">
            <button class="btn btn-danger btn-sm" onclick="deleteRegistration('${r.id}', '${r.roll_number}', '${r.name}')" title="Delete record">
              🗑️
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Error loading registrations:', err);
    registrationsTableBody.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--accent-rose);padding:2rem;">Network error loading registrations.</td></tr>`;
  }
}

// Delete Registration
window.deleteRegistration = async function(id, rollNumber, name) {
  if (!confirm(`Are you sure you want to delete the registration for:\n${name} (${rollNumber})?\n\nThis cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/admin/registrations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    const data = await res.json();
    if (res.ok && data.success) {
      loadRegistrations();
      loadStats();
    } else {
      alert(data.message || 'Failed to delete registration.');
    }
  } catch (err) {
    alert('Network error while deleting registration.');
  }
};

// Export to CSV
async function handleExportCSV() {
  try {
    btnExportCSV.disabled = true;
    btnExportCSV.innerText = 'Generating CSV...';

    const event_id = filterEventSelect?.value || 'all';
    const query = event_id !== 'all' ? `?event_id=${encodeURIComponent(event_id)}` : '';

    const res = await fetch(`/api/admin/export${query}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok) {
      throw new Error('Export request failed.');
    }

    const blob = await res.blob();
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `lakshya-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error('CSV Export error:', err);
    alert('Failed to download registrations CSV. Please try again.');
  } finally {
    btnExportCSV.disabled = false;
    btnExportCSV.innerText = '📥 Download CSV';
  }
}
