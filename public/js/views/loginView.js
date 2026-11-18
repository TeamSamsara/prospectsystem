/**
 * loginView.js
 * @version 1.0.0
 *
 * Login screen. Handles email/password sign-in via authService.
 * On success, authService + onAuthStateChanged handles the redirect.
 * On first login, authService sets isFirstLogin = true → router
 * sends the user to setupView.
 */

import { signIn          } from '../auth/authService.js';
import { renderLoading   } from '../renderer.js';
import { navigate        } from '../router.js';
import { getSession      } from '../auth/authService.js';


export class LoginView {

    //#region State
    _container = null;
    _handlers  = [];
    //#endregion


    //#region Lifecycle

    mount(container) {
        this._container = container;

        // Already authenticated — don't show login
        const session = getSession();
        if (session.isAuthenticated) {
            navigate(session.userProfile?.isFirstLogin ? '/setup' : '/prospects');
            return;
        }

        // Pick up any one-shot error set before a forced sign-out
        // (e.g. no role assigned, account revoked, stub just created)
        const pendingError = sessionStorage.getItem('_tsLoginError');
        if (pendingError) {
            sessionStorage.removeItem('_tsLoginError');
            this._render(pendingError);
            this._wireEvents();
            return;
        }

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
        this._container.innerHTML = /*html*/`
            <div class="auth-screen">
                <div class="auth-card auth-card--accent">

                    <div class="auth-card-head">
                        <div class="auth-eyebrow">◈ TRUE SIGHT · TEAM SAMSARA</div>
                        <div class="auth-title">SIGN IN</div>
                        <div class="auth-subtitle">Access restricted to authorised staff only.</div>
                    </div>

                    <div class="auth-body">
                        ${errorMsg ? /*html*/`
                            <div class="auth-error">
                                <span>✕</span>
                                <span>${errorMsg}</span>
                            </div>
                        ` : ''}

                        <label class="field-label">Email Address
                            <input id="loginEmail" type="email"
                                placeholder="you@teamsamsara.com"
                                autocomplete="email">
                        </label>

                        <label class="field-label">Password
                            <input id="loginPassword" type="password"
                                placeholder="••••••••"
                                autocomplete="current-password">
                        </label>

                        <button class="btn btn-cta auth-cta" id="loginBtn">
                            ◈ SIGN IN
                        </button>
                    </div>

                    <div class="auth-foot">
                        <span class="auth-foot-text">Team Samsara — Internal Platform</span>
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

        const form = this._container;

        on(form.querySelector('#loginBtn'), 'click', () => this._handleSignIn());

        // Allow Enter key on both fields
        on(form.querySelector('#loginEmail'),    'keydown', e => { if (e.key === 'Enter') this._handleSignIn(); });
        on(form.querySelector('#loginPassword'), 'keydown', e => { if (e.key === 'Enter') this._handleSignIn(); });
    }

    async _handleSignIn() {
        const email    = this._container.querySelector('#loginEmail')?.value?.trim()    || '';
        const password = this._container.querySelector('#loginPassword')?.value         || '';
        const btn      = this._container.querySelector('#loginBtn');

        if (!email || !password) {
            this._render('Please enter your email and password.');
            this._wireEvents();
            return;
        }

        if (btn) { btn.textContent = 'Signing in…'; btn.disabled = true; }

        try {
            await signIn(email, password);
            // authService + onAuthStateChanged handles navigation after this
        } catch (err) {
            this._render(err.message);
            this._wireEvents();
        }
    }

    //#endregion

}