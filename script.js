// script.js — Updated frontend for Full-Stack App
// Calls the Express backend via fetch().
// sessionStorage stores the JWT token; roles are enforced server-side.

const API = 'http://localhost:3000/api';

let currentUser = null;      // { username, role }
let editingAccountId = null;
let editingEmployeeId = null;

// ─── Auth Token Helpers ───────────────────────────────────────────────────────

function getToken() { return sessionStorage.getItem('authToken'); }
function saveToken(token) { sessionStorage.setItem('authToken', token); }
function clearToken() { sessionStorage.removeItem('authToken'); }

function authHeaders() {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
}

// ─── Toast / Validation Helpers ───────────────────────────────────────────────

function getToastContainer() {
    let c = document.getElementById('toastContainer');
    if (!c) {
        c = document.createElement('div');
        c.id = 'toastContainer';
        c.className = 'toast-container position-fixed top-0 end-0 p-3';
        c.style.zIndex = '2000';
        document.body.appendChild(c);
    }
    return c;
}

function showToast(message, type = 'info') {
    const typeMap = { success: 'text-bg-success', danger: 'text-bg-danger', warning: 'text-bg-warning', info: 'text-bg-primary' };
    const toast = document.createElement('div');
    toast.className = `toast align-items-center border-0 ${typeMap[type] || typeMap.info}`;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.setAttribute('aria-atomic', 'true');
    toast.innerHTML = `<div class="d-flex"><div class="toast-body">${message}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div>`;
    getToastContainer().appendChild(toast);
    if (window.bootstrap && window.bootstrap.Toast) {
        const instance = new window.bootstrap.Toast(toast, { delay: 2500 });
        instance.show();
        toast.addEventListener('hidden.bs.toast', () => toast.remove());
    } else {
        setTimeout(() => toast.remove(), 2500);
    }
}

function clearFormValidation(form) {
    if (!form) return;
    form.querySelectorAll('.is-invalid').forEach(el => { el.classList.remove('is-invalid'); el.setCustomValidity(''); });
}

function markInvalidField(field, message) {
    if (!field) return;
    field.classList.add('is-invalid');
    field.setCustomValidity(message);
    field.reportValidity();
}

// ─── Auth State ───────────────────────────────────────────────────────────────

function setAuthState(isAuth, user = null) {
    currentUser = isAuth ? user : null;
    document.body.classList.toggle('authenticated', isAuth);
    document.body.classList.toggle('not-authenticated', !isAuth);
    document.body.classList.toggle('is-admin', Boolean(currentUser && currentUser.role === 'admin'));
}

// ─── Router ───────────────────────────────────────────────────────────────────

function navigateTo(hash) { window.location.hash = hash; }

const router = {
    routes: {
        '#/':             { pageId: 'homePage' },
        '#/login':        { pageId: 'loginPage',       guestOnly: true },
        '#/register':     { pageId: 'registerPage',    guestOnly: true },
        '#/verify-email': { pageId: 'verifyEmailPage', guestOnly: true, render: renderVerifyMessage },
        '#/profile':      { pageId: 'profilePage',     authRequired: true, render: renderProfile },
        '#/accounts':     { pageId: 'accountsPage',    authRequired: true, adminOnly: true, render: renderAccountsList },
        '#/departments':  { pageId: 'departmentsPage', authRequired: true, adminOnly: true, render: renderDepartmentsList },
        '#/employees': {
            pageId: 'employeesPage', authRequired: true, adminOnly: true,
            render: () => { renderEmployeeDeptOptions(); renderEmployeesTable(); }
        },
        '#/requests': {
            pageId: 'requestsPage', authRequired: true,
            render: () => { renderRequestsTable(); closeRequestModal(); }
        }
    },
    resolveRoute(hash) {
        const h = hash || '#/';
        const route = this.routes[h];
        if (!route) return '#/';
        if (route.authRequired && !currentUser) return '#/login';
        if (route.guestOnly && currentUser) return '#/profile';
        if (route.adminOnly && (!currentUser || currentUser.role !== 'admin')) return '#/profile';
        return h;
    }
};

function renderActivePage(pageId) {
    document.querySelectorAll('.page').forEach(p => { p.classList.remove('active'); p.style.display = 'none'; });
    const page = document.getElementById(pageId);
    if (page) { page.classList.add('active'); page.style.display = 'block'; }
}

function handleRouting() {
    const resolved = router.resolveRoute(window.location.hash);
    if (resolved !== (window.location.hash || '#/')) { navigateTo(resolved); return; }
    const route = router.routes[resolved] || router.routes['#/'];
    renderActivePage(route.pageId);
    if (typeof route.render === 'function') route.render();
}

// ─── Register ─────────────────────────────────────────────────────────────────
// NOTE: The instructor's server uses "username" + "password" (not email).
// The register form uses firstName as the username for simplicity.

async function register(event) {
    event.preventDefault();
    const form = document.getElementById('registerForm');
    clearFormValidation(form);

    const firstName = document.getElementById('firstName').value.trim();
    const lastName  = document.getElementById('lastName').value.trim();
    const username  = document.getElementById('regEmail').value.trim().toLowerCase(); // email field used as username
    const password  = document.getElementById('regPassword').value;

    if (!firstName || !lastName || !username || !password) {
        showToast('Complete all registration fields.', 'warning');
        if (!firstName) markInvalidField(document.getElementById('firstName'), 'First name is required.');
        if (!lastName)  markInvalidField(document.getElementById('lastName'), 'Last name is required.');
        if (!username)  markInvalidField(document.getElementById('regEmail'), 'Username/email is required.');
        if (!password)  markInvalidField(document.getElementById('regPassword'), 'Password is required.');
        return;
    }

    if (password.length < 6) {
        showToast('Password must be at least 6 characters.', 'warning');
        markInvalidField(document.getElementById('regPassword'), 'Use at least 6 characters.');
        return;
    }

    try {
        const res  = await fetch(`${API}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, role: 'user' })
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Registration failed.', 'danger');
            if (res.status === 409) markInvalidField(document.getElementById('regEmail'), data.error);
            return;
        }

        sessionStorage.setItem('pendingVerifyEmail', username);
        showToast('Registration complete. Please verify your email.', 'success');
        navigateTo('#/verify-email');
    } catch (err) {
        showToast('Cannot reach server. Is the backend running?', 'danger');
    }
}

// ─── Verify Email (simulated) ────────────────────────────────────────────────

function renderVerifyMessage() {
    const pending   = sessionStorage.getItem('pendingVerifyEmail');
    const messageEl = document.getElementById('verifyEmailMessage');
    messageEl.textContent = pending
        ? `Verification sent to ${pending}`
        : 'No pending verification email found.';
}

// The instructor's server has no real verify endpoint — simulate it client-side.
function simulateVerify() {
    sessionStorage.removeItem('pendingVerifyEmail');
    showToast('Email verified. You can now login.', 'success');
    navigateTo('#/login');
}

// ─── Login ────────────────────────────────────────────────────────────────────

async function login(event) {
    event.preventDefault();
    clearFormValidation(document.getElementById('loginForm'));

    // loginEmail field is used as the username field
    const username = document.getElementById('loginEmail').value.trim().toLowerCase();
    const password = document.getElementById('loginPassword').value;

    try {
        const res  = await fetch(`${API}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) {
            showToast(data.error || 'Login failed.', 'danger');
            markInvalidField(document.getElementById('loginEmail'), 'Check your credentials.');
            markInvalidField(document.getElementById('loginPassword'), 'Check your credentials.');
            return;
        }

        // ✅ Save JWT — role comes from the server, not the client
        saveToken(data.token);
        setAuthState(true, data.user);
        showToast(`Welcome ${data.user.username}!`, 'success');
        navigateTo('#/profile');
    } catch (err) {
        showToast('Cannot reach server. Is the backend running?', 'danger');
    }
}

// ─── Logout ───────────────────────────────────────────────────────────────────

function logout(event) {
    if (event) event.preventDefault();
    clearToken();
    setAuthState(false, null);
    showToast('Logged out successfully.', 'info');
    navigateTo('#/');
}

// ─── Profile ──────────────────────────────────────────────────────────────────

async function renderProfile() {
    if (!currentUser) return;

    try {
        const res = await fetch(`${API}/profile`, { headers: authHeaders() });
        if (!res.ok) { logout(); return; }

        const data = await res.json();
        const user = data.user;

        // Re-sync role from server — prevents DevTools role tampering
        setAuthState(true, { username: user.username, role: user.role });

        document.getElementById('profileName').textContent  = user.username;
        document.getElementById('profileEmail').textContent = user.username;
        document.getElementById('profileRole').textContent  = user.role;
    } catch (err) {
        showToast('Could not load profile.', 'danger');
    }
}

// ─── Accounts (kept as local in-memory for now — server has no accounts API) ──

// These use a local array since the instructor's server.js doesn't expose
// full CRUD for accounts. You can extend server.js to add those routes later.

let localAccounts = [];

function showAccountForm(account = null) {
    const card = document.getElementById('accountFormCard');
    card.classList.remove('hidden');
    editingAccountId = account ? account.id : null;
    document.getElementById('accountRecordId').value = editingAccountId || '';
    document.getElementById('accFirstName').value    = account ? account.firstName : '';
    document.getElementById('accLastName').value     = account ? account.lastName  : '';
    document.getElementById('accEmail').value        = account ? account.email     : '';
    document.getElementById('accPassword').value     = '';
    document.getElementById('accRole').value         = account ? account.role      : 'user';
    document.getElementById('accVerified').checked   = Boolean(account && account.verified);
}

function hideAccountForm() {
    document.getElementById('accountFormCard').classList.add('hidden');
    document.getElementById('accountForm').reset();
    editingAccountId = null;
}

function renderAccountsList() {
    const body = document.getElementById('accountsTableBody');
    if (!body) return;
    if (!localAccounts.length) {
        body.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No accounts.</td></tr>';
        return;
    }
    body.innerHTML = localAccounts.map(acc => `
        <tr>
            <td>${acc.firstName} ${acc.lastName}</td>
            <td>${acc.email}</td>
            <td>${acc.role}</td>
            <td>${acc.verified ? 'yes' : '-'}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary"  data-account-action="edit"   data-account-id="${acc.id}">Edit</button>
                <button class="btn btn-sm btn-outline-danger"   data-account-action="delete" data-account-id="${acc.id}">Delete</button>
            </td>
        </tr>`).join('');
}

function handleAccountSubmit(event) {
    event.preventDefault();
    const firstName = document.getElementById('accFirstName').value.trim();
    const lastName  = document.getElementById('accLastName').value.trim();
    const email     = document.getElementById('accEmail').value.trim().toLowerCase();
    const password  = document.getElementById('accPassword').value;
    const role      = document.getElementById('accRole').value;
    const verified  = document.getElementById('accVerified').checked;

    if (editingAccountId) {
        const acc = localAccounts.find(a => a.id === editingAccountId);
        if (acc) { acc.firstName = firstName; acc.lastName = lastName; acc.email = email; acc.role = role; acc.verified = verified; }
    } else {
        localAccounts.push({ id: 'acc_' + Math.random().toString(36).slice(2,8), firstName, lastName, email, password, role, verified });
    }
    hideAccountForm();
    renderAccountsList();
    showToast(editingAccountId ? 'Account updated.' : 'Account created.', 'success');
}

function handleAccountsTableClick(event) {
    const button = event.target.closest('button[data-account-action]');
    if (!button) return;
    const action = button.getAttribute('data-account-action');
    const id     = button.getAttribute('data-account-id');
    if (action === 'edit') {
        const acc = localAccounts.find(a => a.id === id);
        if (acc) showAccountForm(acc);
    }
    if (action === 'delete') {
        if (!confirm('Delete this account?')) return;
        localAccounts = localAccounts.filter(a => a.id !== id);
        renderAccountsList();
    }
}

// ─── Departments ──────────────────────────────────────────────────────────────

let localDepartments = [
    { id: 'dept_eng', name: 'Engineering', description: 'Software team' },
    { id: 'dept_hr',  name: 'HR',          description: 'Human Resources' }
];

function renderDepartmentsList() {
    const body = document.getElementById('departmentsTableBody');
    if (!body) return;
    if (!localDepartments.length) {
        body.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No departments.</td></tr>';
        return;
    }
    body.innerHTML = localDepartments.map(dept => `
        <tr>
            <td>${dept.name}</td>
            <td>${dept.description}</td>
            <td>
                <button type="button" class="btn btn-sm btn-outline-secondary" disabled>Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger" data-department-action="delete" data-department-id="${dept.id}">Delete</button>
            </td>
        </tr>`).join('');
}

function handleDepartmentsTableClick(event) {
    const button = event.target.closest('button[data-department-action]');
    if (!button) return;
    const id = button.getAttribute('data-department-id');
    if (!confirm('Delete this department?')) return;
    localDepartments = localDepartments.filter(d => d.id !== id);
    renderDepartmentsList();
    renderEmployeeDeptOptions();
}

function handleAddDepartment() {
    const name        = document.getElementById('departmentNameInput').value.trim();
    const description = document.getElementById('departmentDescriptionInput').value.trim();
    if (!name || !description) { showToast('Name and description are required.', 'warning'); return; }
    localDepartments.push({ id: 'dept_' + Math.random().toString(36).slice(2,8), name, description });
    showToast('Department added.', 'success');
    document.getElementById('departmentFormCard').classList.add('hidden');
    document.getElementById('departmentForm').reset();
    renderDepartmentsList();
    renderEmployeeDeptOptions();
}

// ─── Employees ────────────────────────────────────────────────────────────────

let localEmployees = [];

function renderEmployeeDeptOptions() {
    const select = document.getElementById('employeeDepartment');
    if (!select) return;
    select.innerHTML = localDepartments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
}

function renderEmployeesTable() {
    const body = document.getElementById('employeesTableBody');
    if (!body) return;
    if (!localEmployees.length) {
        body.innerHTML = '<tr><td colspan="6" class="text-center text-muted">No employees.</td></tr>';
        return;
    }
    body.innerHTML = localEmployees.map(emp => {
        const dept = localDepartments.find(d => d.id === emp.departmentId);
        return `<tr>
            <td>${emp.employeeCode}</td>
            <td>${emp.userEmail}</td>
            <td>${emp.position}</td>
            <td>${dept ? dept.name : '-'}</td>
            <td>${emp.hireDate}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary" data-employee-action="edit"   data-employee-id="${emp.id}">Edit</button>
                <button class="btn btn-sm btn-outline-danger"  data-employee-action="delete" data-employee-id="${emp.id}">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

function showEmployeeForm(employee = null) {
    document.getElementById('employeeFormCard').classList.remove('hidden');
    editingEmployeeId = employee ? employee.id : null;
    document.getElementById('employeeRecordId').value  = editingEmployeeId || '';
    document.getElementById('employeeCode').value      = employee ? employee.employeeCode : '';
    document.getElementById('employeeUserEmail').value = employee ? employee.userEmail    : '';
    document.getElementById('employeePosition').value  = employee ? employee.position     : '';
    document.getElementById('employeeHireDate').value  = employee ? employee.hireDate     : '';
    renderEmployeeDeptOptions();
    if (employee) document.getElementById('employeeDepartment').value = employee.departmentId;
}

function hideEmployeeForm() {
    document.getElementById('employeeFormCard').classList.add('hidden');
    document.getElementById('employeeForm').reset();
    editingEmployeeId = null;
}

function handleEmployeeSubmit(event) {
    event.preventDefault();
    const payload = {
        employeeCode: document.getElementById('employeeCode').value.trim(),
        userEmail:    document.getElementById('employeeUserEmail').value.trim().toLowerCase(),
        position:     document.getElementById('employeePosition').value.trim(),
        departmentId: document.getElementById('employeeDepartment').value,
        hireDate:     document.getElementById('employeeHireDate').value
    };
    if (editingEmployeeId) {
        const emp = localEmployees.find(e => e.id === editingEmployeeId);
        if (emp) Object.assign(emp, payload);
    } else {
        localEmployees.push({ id: 'emp_' + Math.random().toString(36).slice(2,8), ...payload });
    }
    hideEmployeeForm();
    renderEmployeesTable();
    showToast(editingEmployeeId ? 'Employee updated.' : 'Employee added.', 'success');
}

function handleEmployeesTableClick(event) {
    const button = event.target.closest('button[data-employee-action]');
    if (!button) return;
    const action = button.getAttribute('data-employee-action');
    const id     = button.getAttribute('data-employee-id');
    if (action === 'edit') {
        const emp = localEmployees.find(e => e.id === id);
        if (emp) showEmployeeForm(emp);
    }
    if (action === 'delete') {
        if (!confirm('Delete employee record?')) return;
        localEmployees = localEmployees.filter(e => e.id !== id);
        renderEmployeesTable();
    }
}

// ─── Requests ─────────────────────────────────────────────────────────────────

let localRequests = [];

function getRequestBadgeClass(status) {
    if (status === 'Approved') return 'bg-success';
    if (status === 'Rejected') return 'bg-danger';
    return 'bg-warning text-dark';
}

function renderRequestsTable() {
    const body = document.getElementById('requestsTableBody');
    if (!body || !currentUser) return;

    // Try to fetch from backend first; fall back to local
    fetch(`${API}/requests`, { headers: authHeaders() })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(requests => {
            if (!requests.length) {
                body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No requests yet.</td></tr>';
                return;
            }
            body.innerHTML = requests.map(req => `
                <tr>
                    <td>${new Date(req.date).toLocaleDateString()}</td>
                    <td>${req.type}</td>
                    <td>${req.items.map(i => `${i.name} x${i.qty}`).join(', ')}</td>
                    <td><span class="badge ${getRequestBadgeClass(req.status)}">${req.status}</span></td>
                </tr>`).join('');
        })
        .catch(() => {
            // Server has no /api/requests route — use local array
            const mine = localRequests.filter(r => r.username === currentUser.username);
            if (!mine.length) {
                body.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No requests yet.</td></tr>';
                return;
            }
            body.innerHTML = mine.map(req => `
                <tr>
                    <td>${new Date(req.date).toLocaleDateString()}</td>
                    <td>${req.type}</td>
                    <td>${req.items.map(i => `${i.name} x${i.qty}`).join(', ')}</td>
                    <td><span class="badge ${getRequestBadgeClass(req.status)}">${req.status}</span></td>
                </tr>`).join('');
        });
}

function createRequestItemRow(name = '', qty = 1) {
    return `<div class="item-row">
        <input type="text"   class="request-item-name" placeholder="Item name" value="${name}">
        <input type="number" class="request-item-qty"  min="1" value="${qty}">
        <button type="button" class="item-remove">x</button>
    </div>`;
}

function resetRequestForm() {
    document.getElementById('requestType').value      = 'Equipment';
    document.getElementById('requestItems').innerHTML = createRequestItemRow();
}

function openRequestModal()  { resetRequestForm(); document.getElementById('requestModal').classList.add('open'); }
function closeRequestModal() { document.getElementById('requestModal').classList.remove('open'); }

function handleRequestItemsClick(event) {
    if (event.target.id === 'addRequestItemBtn') {
        document.getElementById('requestItems').insertAdjacentHTML('beforeend', createRequestItemRow());
        return;
    }
    if (event.target.classList.contains('item-remove')) {
        const rows = document.querySelectorAll('#requestItems .item-row');
        if (rows.length === 1) { showToast('At least one item is required.', 'warning'); return; }
        event.target.closest('.item-row').remove();
    }
}

function handleRequestSubmit(event) {
    event.preventDefault();
    if (!currentUser) return;

    const type  = document.getElementById('requestType').value;
    const items = Array.from(document.querySelectorAll('#requestItems .item-row'))
        .map(row => ({ name: row.querySelector('.request-item-name').value.trim(), qty: Number(row.querySelector('.request-item-qty').value) }))
        .filter(i => i.name && i.qty > 0);

    if (!items.length) { showToast('Add at least one valid item.', 'warning'); return; }

    localRequests.push({
        id: 'req_' + Math.random().toString(36).slice(2,8),
        type, items,
        status: 'Pending',
        date: new Date().toISOString(),
        username: currentUser.username
    });

    closeRequestModal();
    renderRequestsTable();
    showToast('Request submitted.', 'success');
}

// ─── Event Binding ────────────────────────────────────────────────────────────

function initEvents() {
    document.getElementById('registerForm').addEventListener('submit', register);
    document.getElementById('loginForm').addEventListener('submit', login);
    document.getElementById('simulateVerifyBtn').addEventListener('click', simulateVerify);
    document.getElementById('logoutLink').addEventListener('click', logout);
    document.getElementById('loginCancelBtn').addEventListener('click', () => navigateTo('#/'));
    document.getElementById('registerCancelBtn').addEventListener('click', () => navigateTo('#/'));
    document.getElementById('verifyGoLoginBtn').addEventListener('click', () => navigateTo('#/login'));

    document.getElementById('editProfileBtn').addEventListener('click', () => showToast('Edit Profile is not implemented yet.', 'info'));

    document.getElementById('addAccountBtn').addEventListener('click', () => showAccountForm());
    document.getElementById('cancelAccountBtn').addEventListener('click', hideAccountForm);
    document.getElementById('accountForm').addEventListener('submit', handleAccountSubmit);
    document.getElementById('accountsTableBody').addEventListener('click', handleAccountsTableClick);

    document.getElementById('addDepartmentBtn').addEventListener('click', () => {
        document.getElementById('departmentFormCard').classList.remove('hidden');
    });
    document.getElementById('departmentForm').addEventListener('submit', e => { e.preventDefault(); handleAddDepartment(); });
    document.getElementById('cancelDepartmentBtn').addEventListener('click', () => {
        document.getElementById('departmentFormCard').classList.add('hidden');
        document.getElementById('departmentForm').reset();
    });
    document.getElementById('departmentsTableBody').addEventListener('click', handleDepartmentsTableClick);

    document.getElementById('addEmployeeBtn').addEventListener('click', () => showEmployeeForm());
    document.getElementById('cancelEmployeeBtn').addEventListener('click', hideEmployeeForm);
    document.getElementById('employeeForm').addEventListener('submit', handleEmployeeSubmit);
    document.getElementById('employeesTableBody').addEventListener('click', handleEmployeesTableClick);

    document.getElementById('newRequestBtn').addEventListener('click', openRequestModal);
    document.getElementById('closeRequestModal').addEventListener('click', closeRequestModal);
    document.getElementById('requestForm').addEventListener('submit', handleRequestSubmit);

    document.addEventListener('click', handleRequestItemsClick);
    document.addEventListener('input', event => {
        const t = event.target;
        if (!(t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement)) return;
        if (t.classList.contains('is-invalid')) { t.classList.remove('is-invalid'); t.setCustomValidity(''); }
    });
}

// ─── App Bootstrap ────────────────────────────────────────────────────────────

window.addEventListener('hashchange', handleRouting);

window.addEventListener('load', async () => {
    initEvents();

    const token = getToken();
    if (token) {
        try {
            const res = await fetch(`${API}/profile`, { headers: authHeaders() });
            if (res.ok) {
                const data = await res.json();
                setAuthState(true, { username: data.user.username, role: data.user.role });
            } else {
                clearToken();
                setAuthState(false, null);
            }
        } catch {
            clearToken();
            setAuthState(false, null);
        }
    } else {
        setAuthState(false, null);
    }

    if (!window.location.hash) navigateTo('#/');
    else handleRouting();
});
