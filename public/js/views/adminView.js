/**
 * adminView.js
 * @version 1.1.0
 *
 * Added: Audit Log tab, Cleanup tab.
 * Uses secondary Firebase app for account creation to preserve admin session.
 */

import { navigate                              } from '../router.js';
import { renderLoading, renderError, escHtml   } from '../renderer.js';
import { requirePermission                     } from '../auth/authGuard.js';
import { getSession                            } from '../auth/authService.js';
import { can, P                                } from '../auth/permissions.js';
import { ROLES, ROLE_LABELS, getRoleOptions    } from '../auth/roles.js';
import {
    fetchAllUsers, createUser,
    updateUser, revokeUser, reinstateUser,
} from '../auth/userRepository.js';
import { generateTempPassword                  } from '../auth/userModel.js';
import {
    logAudit,
    fetchAuditLog, fetchFailedActions,
    cleanupOldAuditLogs, getAuditStats,
} from '../auth/auditRepository.js';
import { ACTIONS, TARGET_TYPES                 } from '../auth/auditModel.js';
import {
    fetchRecentSessions, fetchActiveSessions,
    cleanupOldSessions, getSessionStats,
} from '../auth/sessionRepository.js';
import { showConfirmModal                      } from '../confirmModal.js';

import { app } from '../firebase.js';
import {
    initializeApp,
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js';
import {
    getAuth,
    createUserWithEmailAndPassword,
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';


export class AdminView {

    //#region State
    _container   = null;
    _handlers    = [];
    _users       = [];
    _activeTab   = 'users';
    _showAddForm = false;
    _tempPass    = '';
    _auditLog    = [];
    //#endregion


    //#region Lifecycle

    async mount(container) {
        this._container = container;
        if (!requirePermission(P.ADMIN_ACCESS)) return;
        renderLoading(container, 'Loading admin panel...');
        try {
            this._users    = await fetchAllUsers();
            this._tempPass = generateTempPassword();
            this._render();
            this._wireEvents();
        } catch (err) {
            renderError(container, `Could not load admin panel — ${err.message}`);
        }
    }

    unmount() {
        this._handlers.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
        this._handlers  = [];
        this._container = null;
    }

    //#endregion


    //#region Render Shell

    _render() {
        const session = getSession();
        const total   = this._users.length;
        const active  = this._users.filter(u => u.isActive && !u.isFirstLogin).length;
        const pending = this._users.filter(u => u.isFirstLogin).length;
        const revoked = this._users.filter(u => !u.isActive).length;

        this._container.innerHTML = /*html*/`
            <div class="profile-subnav">
                <div class="psn-left">
                    <span class="psn-crumb">ADMIN</span>
                    <div class="psn-divider"></div>
                    <button class="psn-tab ${this._activeTab === 'users'   ? 'on' : ''}" data-tab="users">USER MANAGEMENT</button>
                    <button class="psn-tab ${this._activeTab === 'audit'   ? 'on' : ''}" data-tab="audit">AUDIT LOG</button>
                    <button class="psn-tab ${this._activeTab === 'cleanup' ? 'on' : ''}" data-tab="cleanup">CLEANUP</button>
                </div>
                <div class="psn-right">
                    <div class="psn-mode-indicator">
                        <span class="psn-mode-badge on">ADMIN</span>
                        <span class="psn-mode-badge">${escHtml(session.userProfile?.displayName || session.userProfile?.email || '')}</span>
                    </div>
                </div>
            </div>

            <div class="admin-content">

                <div class="spill-bar" style="margin-bottom:16px">
                    <div class="spill"><div class="spill-lbl">TOTAL USERS</div><div class="spill-val">${total}</div></div>
                    <div class="spill"><div class="spill-lbl">ACTIVE</div><div class="spill-val" style="color:var(--pass)">${active}</div></div>
                    <div class="spill"><div class="spill-lbl">PENDING SETUP</div><div class="spill-val" style="color:var(--flag)">${pending}</div></div>
                    <div class="spill"><div class="spill-lbl">REVOKED</div><div class="spill-val" style="color:var(--no)">${revoked}</div></div>
                </div>

                <div id="adminTabContent">
                    ${this._renderTab(this._activeTab)}
                </div>

            </div>
        `;
    }

    _renderTab(tab) {
        if (tab === 'users')   return this._renderUsersTab();
        if (tab === 'audit')   return this._renderAuditTab();
        if (tab === 'cleanup') return this._renderCleanupTab();
        return '';
    }

    //#endregion


    //#region Users Tab

    _renderUsersTab() {
        return /*html*/`
            <div class="profile-card">
                <div class="profile-card-head">
                    <div>
                        <div class="card-eyebrow">01 — USER MANAGEMENT</div>
                        <div class="card-title">Team Accounts</div>
                    </div>
                    <button class="btn btn-cta" id="toggleAddBtn">◈ ADD USER</button>
                </div>
                <div id="addUserPanel" style="display:${this._showAddForm ? '' : 'none'}">
                    ${this._renderAddForm()}
                </div>
                <div id="usersTableWrap">
                    ${this._renderUsersTable()}
                </div>
            </div>
        `;
    }

    _renderAddForm() {
        const roleOptions = getRoleOptions()
            .map(r => `<option value="${r.value}">${r.label.toUpperCase()}</option>`)
            .join('');

        return /*html*/`
            <div class="add-user-panel">
                <div class="add-user-eyebrow">NEW ACCOUNT</div>
                <div class="add-user-grid">
                    <label class="field-label">Email Address
                        <input id="newEmail" type="email" placeholder="name@teamsamsara.com">
                    </label>
                    <label class="field-label">Role
                        <select id="newRole" class="field-select">
                            <option value="">— Select role —</option>
                            ${roleOptions}
                        </select>
                    </label>
                    <label class="field-label">Display Name
                        <input id="newName" type="text" placeholder="Coach Rivera">
                    </label>
                </div>
                <div>
                    <div class="add-user-temp-label">Temporary Password</div>
                    <div class="temp-pass-row">
                        <div class="temp-pass-value" id="tempPassDisplay">${escHtml(this._tempPass)}</div>
                        <button class="btn btn-ghost" id="copyPassBtn">COPY</button>
                        <button class="btn btn-ghost" id="regenPassBtn">↻ NEW</button>
                    </div>
                    <div class="temp-pass-hint">User must change this on first login.</div>
                </div>
                <div class="add-user-actions">
                    <button class="btn btn-cta"   id="createUserBtn">◈ CREATE ACCOUNT</button>
                    <button class="btn btn-ghost"  id="cancelAddBtn">CANCEL</button>
                </div>
                <div id="addUserError" class="auth-error" style="display:none;margin-top:12px"></div>
            </div>
        `;
    }

    _renderUsersTable() {
        if (!this._users.length) return '<div class="card-empty">No users yet.</div>';

        const rows = this._users.map(u => {
            const session   = getSession();
            const isSelf    = u.uid === session.userProfile?.uid;
            const canModify = !isSelf && can(session.userProfile, P.USERS_MANAGE);

            const status = !u.isActive
                ? `<span style="color:var(--no)">Revoked</span>`
                : u.isFirstLogin
                ? `<span style="color:var(--flag)">Pending setup</span>`
                : `<span style="color:var(--pass)">Active</span>`;

            const actions = canModify ? /*html*/`
                <button class="btn btn-ghost" data-action="edit-role" data-uid="${u.uid}">ROLE</button>
                ${u.isActive
                    ? `<button class="btn btn-danger" data-action="revoke"    data-uid="${u.uid}">REVOKE</button>`
                    : `<button class="btn btn-ghost"  data-action="reinstate" data-uid="${u.uid}">REINSTATE</button>`
                }
            ` : isSelf ? '<span style="font-size:11px;color:var(--text3)">YOU</span>' : '';

            const roleLabel = ROLE_LABELS[u.role] || u.role;
            const roleCss   = {
                [ROLES.ADMIN]:   'role-admin',
                [ROLES.MANAGER]: 'role-manager',
                [ROLES.COACH]:   'role-coach',
                [ROLES.SCOUT]:   'role-scout',
            }[u.role] || '';

            return /*html*/`
                <tr>
                    <td>
                        <div class="user-name">${escHtml(u.displayName || '—')}</div>
                        <div class="user-email">${escHtml(u.email)}</div>
                    </td>
                    <td><span class="role-badge ${roleCss}">${roleLabel.toUpperCase()}</span></td>
                    <td>${status}</td>
                    <td style="font-size:13px;color:var(--text3)">${_formatTimestamp(u.lastLoginAt)}</td>
                    <td class="td-actions">${actions}</td>
                </tr>`;
        }).join('');

        return /*html*/`
            <table class="users-table">
                <thead><tr>
                    <th>User</th><th>Role</th><th>Status</th><th>Last Login</th><th></th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    //#endregion


    //#region Audit Tab

    _renderAuditTab() {
        return /*html*/`
            <div class="profile-card">
                <div class="profile-card-head">
                    <div>
                        <div class="card-eyebrow">02 — AUDIT LOG</div>
                        <div class="card-title">User Actions</div>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center">
                        <button class="btn btn-ghost" id="auditFilterAll">ALL</button>
                        <button class="btn btn-ghost" id="auditFilterFailed">FAILURES ONLY</button>
                        <button class="btn btn-ghost" id="refreshAuditBtn">↻ REFRESH</button>
                    </div>
                </div>
                <div id="auditTableWrap">
                    <div class="card-empty">Click refresh to load audit events.</div>
                </div>
            </div>`;
    }

    _renderAuditTable(events) {
        if (!events.length) return '<div class="card-empty">No audit events found.</div>';

        const rows = events.map(e => {
            const successBadge = e.success
                ? `<span style="color:var(--pass);font-size:11px">OK</span>`
                : `<span style="color:var(--no);font-size:11px">FAIL</span>`;

            return /*html*/`
                <tr>
                    <td style="font-family:var(--f-mono);font-size:11px;color:var(--text3)">${_formatTimestamp(e.timestamp)}</td>
                    <td>
                        <div style="font-size:13px;font-weight:700;color:var(--text)">${escHtml(e.email || '—')}</div>
                        <div style="font-size:11px;color:var(--text3)">${escHtml(e.role || '')}</div>
                    </td>
                    <td><span style="font-family:var(--f-mono);font-size:12px;color:var(--accent)">${escHtml(e.action || '—')}</span></td>
                    <td style="font-size:13px;color:var(--text2)">${escHtml(e.targetName || e.targetType || '—')}</td>
                    <td>${successBadge}</td>
                    <td style="font-size:11px;color:var(--no);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                        ${e.error ? escHtml(e.error) : ''}
                    </td>
                </tr>`;
        }).join('');

        return /*html*/`
            <table class="users-table">
                <thead><tr>
                    <th>Time</th><th>User</th><th>Action</th><th>Target</th><th>Result</th><th>Error</th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table>`;
    }

    //#endregion


    //#region Cleanup Tab

    _renderCleanupTab() {
        return /*html*/`
            <div class="profile-card">
                <div class="profile-card-head">
                    <div>
                        <div class="card-eyebrow">03 — DATABASE CLEANUP</div>
                        <div class="card-title">Manual Maintenance</div>
                    </div>
                    <button class="btn btn-ghost" id="refreshStatsBtn">↻ REFRESH STATS</button>
                </div>

                <div style="padding:24px;display:flex;flex-direction:column;gap:24px">

                    <!-- Sessions cleanup -->
                    <div class="cleanup-block">
                        <div class="cleanup-block-head">
                            <div>
                                <div style="font-size:13px;font-weight:700;color:var(--text)">Session Records</div>
                                <div style="font-size:12px;color:var(--text3);margin-top:3px">
                                    Removes logged-out and expired sessions older than the selected threshold.
                                    Active sessions are never deleted.
                                </div>
                            </div>
                        </div>
                        <div id="sessionStats" class="cleanup-stats">Loading stats…</div>
                        <div class="cleanup-actions">
                            <select id="sessionRetentionDays" class="field-select" style="width:180px">
                                <option value="7">Older than 7 days</option>
                                <option value="14">Older than 14 days</option>
                                <option value="30" selected>Older than 30 days</option>
                                <option value="60">Older than 60 days</option>
                            </select>
                            <button class="btn btn-danger" id="cleanupSessionsBtn">DELETE OLD SESSIONS</button>
                        </div>
                    </div>

                    <div style="height:1px;background:var(--line)"></div>

                    <!-- Audit cleanup -->
                    <div class="cleanup-block">
                        <div class="cleanup-block-head">
                            <div>
                                <div style="font-size:13px;font-weight:700;color:var(--text)">Audit Log Records</div>
                                <div style="font-size:12px;color:var(--text3);margin-top:3px">
                                    Removes audit events older than the selected threshold.
                                    Recent events are always preserved.
                                </div>
                            </div>
                        </div>
                        <div id="auditStats" class="cleanup-stats">Loading stats…</div>
                        <div class="cleanup-actions">
                            <select id="auditRetentionDays" class="field-select" style="width:180px">
                                <option value="30">Older than 30 days</option>
                                <option value="60">Older than 60 days</option>
                                <option value="90" selected>Older than 90 days</option>
                                <option value="180">Older than 180 days</option>
                            </select>
                            <button class="btn btn-danger" id="cleanupAuditBtn">DELETE OLD LOGS</button>
                        </div>
                    </div>

                </div>
            </div>`;
    }

    async _loadCleanupStats() {
        const c = this._container;

        const sessionStatsEl = c.querySelector('#sessionStats');
        const auditStatsEl   = c.querySelector('#auditStats');

        try {
            const [sStats, aStats] = await Promise.all([getSessionStats(), getAuditStats()]);

            if (sessionStatsEl) {
                sessionStatsEl.innerHTML = /*html*/`
                    <div class="cleanup-stat-grid">
                        <div class="cleanup-stat"><div class="cleanup-stat-val">${sStats.total}</div><div class="cleanup-stat-lbl">Total</div></div>
                        <div class="cleanup-stat"><div class="cleanup-stat-val" style="color:var(--pass)">${sStats.active}</div><div class="cleanup-stat-lbl">Active</div></div>
                        <div class="cleanup-stat"><div class="cleanup-stat-val" style="color:var(--flag)">${sStats.expired}</div><div class="cleanup-stat-lbl">Expired</div></div>
                        <div class="cleanup-stat"><div class="cleanup-stat-val" style="color:var(--text3)">${sStats.loggedOut}</div><div class="cleanup-stat-lbl">Logged Out</div></div>
                    </div>`;
            }

            if (auditStatsEl) {
                const oldestStr = aStats.oldest
                    ? aStats.oldest.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })
                    : '—';
                auditStatsEl.innerHTML = /*html*/`
                    <div class="cleanup-stat-grid">
                        <div class="cleanup-stat"><div class="cleanup-stat-val">${aStats.total}</div><div class="cleanup-stat-lbl">Total Events</div></div>
                        <div class="cleanup-stat"><div class="cleanup-stat-val" style="color:var(--no)">${aStats.failures}</div><div class="cleanup-stat-lbl">Failures</div></div>
                        <div class="cleanup-stat"><div class="cleanup-stat-val" style="font-size:14px;font-family:var(--f-mono)">${oldestStr}</div><div class="cleanup-stat-lbl">Oldest Record</div></div>
                    </div>`;
            }
        } catch (err) {
            if (sessionStatsEl) sessionStatsEl.textContent = 'Failed to load stats.';
            if (auditStatsEl)   auditStatsEl.textContent   = 'Failed to load stats.';
        }
    }

    //#endregion


    //#region Events

    _wireEvents() {
        const on = (el, type, fn) => {
            if (!el) return;
            el.addEventListener(type, fn);
            this._handlers.push({ el, type, fn });
        };

        const c = this._container;

        // Tab switching
        on(c, 'click', async e => {
            const tab = e.target.closest('.psn-tab');
            if (tab) {
                this._activeTab = tab.dataset.tab;
                c.querySelectorAll('.psn-tab').forEach(t =>
                    t.classList.toggle('on', t.dataset.tab === this._activeTab));
                c.querySelector('#adminTabContent').innerHTML = this._renderTab(this._activeTab);
                this._wireTabEvents();

                if (this._activeTab === 'cleanup') await this._loadCleanupStats();
                return;
            }
        });

        this._wireTabEvents();
    }

    _wireTabEvents() {
        const on = (sel, evt, fn) => {
            const el = this._container.querySelector(sel);
            if (!el) return;
            el.addEventListener(evt, fn);
        };

        // Users tab
        on('#toggleAddBtn', 'click', () => {
            this._showAddForm = !this._showAddForm;
            const panel = this._container.querySelector('#addUserPanel');
            if (panel) panel.style.display = this._showAddForm ? '' : 'none';
        });

        on('#cancelAddBtn', 'click', () => {
            this._showAddForm = false;
            const panel = this._container.querySelector('#addUserPanel');
            if (panel) panel.style.display = 'none';
        });

        on('#copyPassBtn', 'click', async e => {
            await navigator.clipboard.writeText(this._tempPass).catch(() => {});
            const btn = this._container.querySelector('#copyPassBtn');
            if (btn) { btn.textContent = 'COPIED'; setTimeout(() => { btn.textContent = 'COPY'; }, 1500); }
        });

        on('#regenPassBtn', 'click', () => {
            this._tempPass = generateTempPassword();
            const display = this._container.querySelector('#tempPassDisplay');
            if (display) display.textContent = this._tempPass;
        });

        on('#createUserBtn', 'click', () => this._handleCreateUser());

        // Row actions — delegated
        const usersWrap = this._container.querySelector('#usersTableWrap');
        if (usersWrap) {
            usersWrap.addEventListener('click', async e => {
                const action = e.target.dataset.action;
                const uid    = e.target.dataset.uid;
                if (!action || !uid) return;
                if (action === 'revoke')    await this._handleRevoke(uid);
                if (action === 'reinstate') await this._handleReinstate(uid);
                if (action === 'edit-role') await this._handleEditRole(uid);
            });
        }

        // Audit tab
        on('#refreshAuditBtn', 'click', async () => {
            const wrap = this._container.querySelector('#auditTableWrap');
            if (wrap) wrap.innerHTML = '<div class="card-empty">Loading...</div>';
            const events = await fetchAuditLog({ max: 200 });
            this._auditLog = events;
            if (wrap) wrap.innerHTML = this._renderAuditTable(events);
        });

        on('#auditFilterFailed', 'click', async () => {
            const wrap = this._container.querySelector('#auditTableWrap');
            if (wrap) wrap.innerHTML = '<div class="card-empty">Loading...</div>';
            const events = await fetchFailedActions({ max: 100 });
            if (wrap) wrap.innerHTML = this._renderAuditTable(events);
        });

        on('#auditFilterAll', 'click', async () => {
            const wrap = this._container.querySelector('#auditTableWrap');
            if (wrap) wrap.innerHTML = '<div class="card-empty">Loading...</div>';
            const events = await fetchAuditLog({ max: 200 });
            if (wrap) wrap.innerHTML = this._renderAuditTable(events);
        });

        // Cleanup tab
        on('#refreshStatsBtn', 'click', () => this._loadCleanupStats());

        on('#cleanupSessionsBtn', 'click', async () => {
            const days = Number(this._container.querySelector('#sessionRetentionDays')?.value) || 30;
            const confirmed = await showConfirmModal({
                title:   `Delete sessions older than ${days} days?`,
                message: 'Active sessions will not be affected. This cannot be undone.',
                confirm: 'DELETE',
                danger:  true,
            });
            if (!confirmed) return;
            try {
                const btn = this._container.querySelector('#cleanupSessionsBtn');
                if (btn) { btn.textContent = 'Deleting...'; btn.disabled = true; }
                const count = await cleanupOldSessions(days);
                await logAudit(getSession(), ACTIONS.ADMIN_MANAGE, {
                    success:  true,
                    metadata: { action: 'cleanup_sessions', daysOld: days, deleted: count },
                });
                await this._loadCleanupStats();
                alert(`Deleted ${count} session record${count !== 1 ? 's' : ''}.`);
            } catch (err) {
                alert('Cleanup failed — ' + err.message);
            } finally {
                const btn = this._container.querySelector('#cleanupSessionsBtn');
                if (btn) { btn.textContent = 'DELETE OLD SESSIONS'; btn.disabled = false; }
            }
        });

        on('#cleanupAuditBtn', 'click', async () => {
            const days = Number(this._container.querySelector('#auditRetentionDays')?.value) || 90;
            const confirmed = await showConfirmModal({
                title:   `Delete audit logs older than ${days} days?`,
                message: 'This permanently removes historical audit records. This cannot be undone.',
                confirm: 'DELETE',
                danger:  true,
            });
            if (!confirmed) return;
            try {
                const btn = this._container.querySelector('#cleanupAuditBtn');
                if (btn) { btn.textContent = 'Deleting...'; btn.disabled = true; }
                const count = await cleanupOldAuditLogs(days);
                await logAudit(getSession(), ACTIONS.ADMIN_MANAGE, {
                    success:  true,
                    metadata: { action: 'cleanup_audit', daysOld: days, deleted: count },
                });
                await this._loadCleanupStats();
                alert(`Deleted ${count} audit record${count !== 1 ? 's' : ''}.`);
            } catch (err) {
                alert('Cleanup failed — ' + err.message);
            } finally {
                const btn = this._container.querySelector('#cleanupAuditBtn');
                if (btn) { btn.textContent = 'DELETE OLD LOGS'; btn.disabled = false; }
            }
        });
    }

    //#endregion


    //#region User Actions

    async _handleCreateUser() {
        const c       = this._container;
        const email   = c.querySelector('#newEmail')?.value?.trim() || '';
        const role    = c.querySelector('#newRole')?.value           || '';
        const name    = c.querySelector('#newName')?.value?.trim()  || '';
        const errorEl = c.querySelector('#addUserError');
        const btn     = c.querySelector('#createUserBtn');
        const session = getSession();

        const showError = msg => {
            if (errorEl) { errorEl.textContent = msg; errorEl.style.display = ''; }
        };

        if (!email) { showError('Email is required.'); return; }
        if (!role)  { showError('Please select a role.'); return; }

        if (btn) { btn.textContent = 'Creating...'; btn.disabled = true; }

        try {
            const secondaryApp  = initializeApp(app.options, 'secondary-' + Date.now());
            const secondaryAuth = getAuth(secondaryApp);

            const cred = await createUserWithEmailAndPassword(secondaryAuth, email, this._tempPass);
            const uid  = cred.user.uid;
            await secondaryAuth.signOut();

            await createUser(uid, {
                email,
                role,
                displayName:  name,
                createdBy:    session.userProfile?.uid || '',
                tempPassword: this._tempPass,
            });

            await logAudit(session, ACTIONS.USERS_WRITE, {
                targetId:   uid,
                targetType: TARGET_TYPES.USER,
                targetName: email,
                success:    true,
            });

            this._users       = await fetchAllUsers();
            this._tempPass    = generateTempPassword();
            this._showAddForm = false;
            this._render();
            this._wireEvents();

        } catch (err) {
            showError(err.message);
            await logAudit(getSession(), ACTIONS.USERS_WRITE, { success: false, error: err.message });
            if (btn) { btn.textContent = '◈ CREATE ACCOUNT'; btn.disabled = false; }
        }
    }

    async _handleRevoke(uid) {
        const user      = this._users.find(u => u.uid === uid);
        const confirmed = await showConfirmModal({
            title:   'Revoke access?',
            message: `${user?.displayName || user?.email} will immediately lose access to the platform.`,
            confirm: 'REVOKE',
            danger:  true,
        });
        if (!confirmed) return;

        try {
            await revokeUser(uid);
            await logAudit(getSession(), ACTIONS.USERS_MANAGE, {
                targetId:   uid,
                targetType: TARGET_TYPES.USER,
                targetName: user?.email,
                success:    true,
                metadata:   { action: 'revoke' },
            });
            this._users = await fetchAllUsers();
            const wrap = this._container.querySelector('#usersTableWrap');
            if (wrap) wrap.innerHTML = this._renderUsersTable();
        } catch (err) {
            alert('Revoke failed — ' + err.message);
        }
    }

    async _handleReinstate(uid) {
        const user = this._users.find(u => u.uid === uid);
        try {
            await reinstateUser(uid);
            await logAudit(getSession(), ACTIONS.USERS_MANAGE, {
                targetId:   uid,
                targetType: TARGET_TYPES.USER,
                targetName: user?.email,
                success:    true,
                metadata:   { action: 'reinstate' },
            });
            this._users = await fetchAllUsers();
            const wrap = this._container.querySelector('#usersTableWrap');
            if (wrap) wrap.innerHTML = this._renderUsersTable();
        } catch (err) {
            alert('Reinstate failed — ' + err.message);
        }
    }

    async _handleEditRole(uid) {
        const user = this._users.find(u => u.uid === uid);
        if (!user) return;

        const confirmed = await showConfirmModal({
            title:   `Change role for ${user.displayName || user.email}`,
            message: `Current role: ${ROLE_LABELS[user.role] || user.role}`,
            confirm: 'UPDATE ROLE',
            danger:  false,
        });
        if (!confirmed) return;

        const newRole = prompt(`Enter new role (${Object.values(ROLES).join(', ')}):`, user.role);
        if (!newRole || !Object.values(ROLES).includes(newRole.toLowerCase())) return;

        try {
            await updateUser(uid, { role: newRole.toLowerCase() });
            await logAudit(getSession(), ACTIONS.USERS_MANAGE, {
                targetId:   uid,
                targetType: TARGET_TYPES.USER,
                targetName: user.email,
                success:    true,
                metadata:   { from: user.role, to: newRole.toLowerCase() },
            });
            this._users = await fetchAllUsers();
            const wrap = this._container.querySelector('#usersTableWrap');
            if (wrap) wrap.innerHTML = this._renderUsersTable();
        } catch (err) {
            alert('Role update failed — ' + err.message);
        }
    }

    //#endregion

}


//#region Utils

function _formatTimestamp(ts) {
    if (!ts?.toDate) return '—';
    return ts.toDate().toLocaleDateString('en-CA', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
}

//#endregion