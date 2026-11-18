/**
 * setupView.js
 * @version 1.0.2
 */

import { getSession, changePassword, refreshSession } from '../auth/authService.js';
import { completeFirstLogin                         } from '../auth/userRepository.js';
import { navigate                                   } from '../router.js';


export class SetupView {

    //#region State
    _container = null;
    _handlers  = [];
    //#endregion


    //#region Lifecycle

    mount(container) {
        this._container = container;

        const session = getSession();
        if (!session.isAuthenticated)           { navigate('/login');    return; }
        if (!session.userProfile?.isFirstLogin) { navigate('/prospects'); return; }

        this._render();
        this._wireEvents();
    }

    unmount() {
        this._handlers.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
        this._handlers  = [];
        this._container = null;
    }

    //#endregion


    //#region Render

    _render(errorMsg = '') {
        const session     = getSession();
        const displayName = session.userProfile?.displayName || '';
        const email       = session.userProfile?.email       || '';

        this._container.innerHTML = /*html*/`
            <div class="auth-screen">
                <div class="auth-card auth-card--gold">

                    <div class="auth-alert">
                        <div class="auth-alert-dot"></div>
                        FIRST LOGIN DETECTED — PLEASE SECURE YOUR ACCOUNT
                    </div>

                    <div class="auth-steps">
                        <div class="auth-step auth-step--done"></div>
                        <div class="auth-step auth-step--active"></div>
                        <div class="auth-step"></div>
                    </div>

                    <div class="auth-card-head">
                        <div class="auth-eyebrow" style="color:var(--gold)">◈ ACCOUNT SETUP · STEP 2 OF 3</div>
                        <div class="auth-title">WELCOME</div>
                        <div class="auth-subtitle">Set your display name and a permanent password to continue.</div>
                    </div>

                    <div class="auth-body">
                        ${errorMsg ? /*html*/`
                            <div class="auth-error">
                                <span>✕</span>
                                <span>${errorMsg}</span>
                            </div>
                        ` : ''}

                        <label class="field-label">Email
                            <input type="email" value="${email}" readonly
                                style="opacity:.5;cursor:not-allowed">
                        </label>

                        <label class="field-label">Display Name
                            <input id="setupName" type="text"
                                placeholder="e.g. Coach Felix"
                                value="${displayName}"
                                autocomplete="name">
                        </label>

                        <label class="field-label">Current Password
                            <input id="setupCurrentPassword" type="password"
                                placeholder="The password you just logged in with"
                                autocomplete="current-password">
                        </label>

                        <label class="field-label">New Password
                            <input id="setupPassword" type="password"
                                placeholder="Minimum 8 characters"
                                autocomplete="new-password">
                            <div class="pass-rules">
                                <div class="pass-rule" id="rule-length">8 or more characters</div>
                                <div class="pass-rule" id="rule-upper">One uppercase letter</div>
                                <div class="pass-rule" id="rule-special">One number or special character</div>
                            </div>
                        </label>

                        <label class="field-label">Confirm New Password
                            <input id="setupConfirm" type="password"
                                placeholder="Repeat your new password"
                                autocomplete="new-password">
                        </label>

                        <button class="btn btn-cta auth-cta" id="setupBtn">
                            ◈ COMPLETE SETUP
                        </button>
                    </div>

                </div>
            </div>
        `;
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
        on(c.querySelector('#setupPassword'), 'input', () => this._validatePassword());
        on(c.querySelector('#setupBtn'),      'click', () => this._handleSetup());
    }

    _validatePassword() {
        const val = this._container.querySelector('#setupPassword')?.value || '';
        const rules = {
            'rule-length':  val.length >= 8,
            'rule-upper':   /[A-Z]/.test(val),
            'rule-special': /[0-9!@#$%^&*]/.test(val),
        };
        Object.entries(rules).forEach(([id, ok]) => {
            const el = this._container.querySelector(`#${id}`);
            if (el) el.classList.toggle('pass-rule--ok', ok);
        });
    }

    _passwordValid(val) {
        return val.length >= 8 && /[A-Z]/.test(val) && /[0-9!@#$%^&*]/.test(val);
    }

    async _handleSetup() {
        const c               = this._container;
        const displayName     = c.querySelector('#setupName')?.value?.trim()    || '';
        const currentPassword = c.querySelector('#setupCurrentPassword')?.value || '';
        const password        = c.querySelector('#setupPassword')?.value        || '';
        const confirm         = c.querySelector('#setupConfirm')?.value         || '';
        const btn             = c.querySelector('#setupBtn');
        const session         = getSession();

        if (!displayName) {
            this._render('Please enter a display name.');
            this._wireEvents(); return;
        }
        if (!currentPassword) {
            this._render('Please enter your current password.');
            this._wireEvents(); return;
        }
        if (!this._passwordValid(password)) {
            this._render('New password must be at least 8 characters, include an uppercase letter and a number or special character.');
            this._wireEvents(); return;
        }
        if (password !== confirm) {
            this._render('Passwords do not match.');
            this._wireEvents(); return;
        }
        if (currentPassword === password) {
            this._render('New password must be different from your current password.');
            this._wireEvents(); return;
        }

        if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }

        try {
            await changePassword(currentPassword, password);
            await completeFirstLogin(session.userProfile.uid, { displayName });

            // Rebuild in-memory session so isFirstLogin is now false
            // and the router doesn't send us back to /setup
            await refreshSession();

            navigate('/prospects');
        } catch (err) {
            this._render(err.message);
            this._wireEvents();
        }
    }

    //#endregion

}