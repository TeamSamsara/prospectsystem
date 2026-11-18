/**
 * authService.js
 * @version 1.1.0
 *
 * Added: inactivity timer with 2-minute warning modal before force-logout.
 * Inactivity threshold: 15 minutes. Warning fires at 13 minutes.
 * Any user interaction resets the timer.
 */

import { auth } from '../firebase.js';

import {
    signInWithEmailAndPassword,
    signOut as firebaseSignOut,
    onAuthStateChanged,
    updatePassword,
    EmailAuthProvider,
    reauthenticateWithCredential,
} from 'https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js';

import { resolvePermissions, canPlatformAccess } from './roles.js';
import { fetchUser, updateLastLogin            } from './userRepository.js';
import { openSession, closeSession,
         startHeartbeat, stopHeartbeat         } from './sessionRepository.js';
import { createEmptySession                    } from './sessionModel.js';


//#region Constants

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;  // 15 minutes
const WARNING_BEFORE_MS     =  2 * 60 * 1000;  // warn 2 minutes before
const WARNING_DURATION_MS   =  2 * 60 * 1000;  // countdown duration
const INACTIVITY_EVENTS     = ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'];

//#endregion


//#region In-Memory Session State

let _session      = createEmptySession();
let _listeners    = [];
let _authResolved = false;

//#endregion


//#region Inactivity Timer State

let _inactivityTimer  = null;
let _warningTimer     = null;
let _countdownTimer   = null;
let _warningOverlay   = null;
let _warningActive    = false;

//#endregion


//#region Internal Helpers

function _notify() {
    _listeners.forEach(fn => {
        try { fn({ ..._session }); } catch (e) { console.warn('Session listener error:', e); }
    });
}

function _setSession(updates) {
    _session = { ..._session, ...updates };
    _notify();
}

function _clearSession() {
    _session = { ...createEmptySession(), isLoading: false };
    _notify();
}

async function _buildSession(firebaseUser) {
    try {
        const userProfile = await fetchUser(firebaseUser.uid);

        if (!userProfile) {
            await firebaseSignOut(auth);
            _setSession({ isLoading: false, isAuthenticated: false, firebaseUser: null, userProfile: null });
            return;
        }

        if (!canPlatformAccess(userProfile.role) || !userProfile.isActive) {
            await firebaseSignOut(auth);
            _setSession({ isLoading: false, isAuthenticated: false, firebaseUser: null, userProfile: null });
            return;
        }

        const permissions = resolvePermissions(userProfile.role);
        const sessionId   = await openSession(userProfile);

        await updateLastLogin(firebaseUser.uid);
        startHeartbeat(sessionId);

        _setSession({
            firebaseUser,
            userProfile:     { ...userProfile, permissions },
            permissions,
            sessionId,
            isLoading:       false,
            isAuthenticated: true,
        });

    } catch (err) {
        console.error('Session build failed:', err);
        _setSession({ isLoading: false, isAuthenticated: false });
    }
}

//#endregion


//#region Firebase Auth Observer

export function initAuth() {
    onAuthStateChanged(auth, async firebaseUser => {
        _authResolved = true;

        if (firebaseUser) {
            _setSession({ isLoading: true });
            await _buildSession(firebaseUser);
        } else {
            stopHeartbeat();
            _stopInactivityTimer();
            _clearSession();
        }
    });
}

//#endregion


//#region Public API — Auth Actions

export async function signIn(email, password) {
    try {
        await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (err) {
        throw new Error(_authErrorMessage(err.code));
    }
}

export async function signOut() {
    const { sessionId } = _session;
    _stopInactivityTimer();
    stopHeartbeat();
    if (sessionId) {
        try { await closeSession(sessionId); } catch (e) { console.warn('Session close failed:', e); }
    }
    await firebaseSignOut(auth);
    _clearSession();
}

export async function changePassword(currentPassword, newPassword) {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) throw new Error('Not authenticated.');

    try {
        const credential = EmailAuthProvider.credential(firebaseUser.email, currentPassword);
        await reauthenticateWithCredential(firebaseUser, credential);
        await updatePassword(firebaseUser, newPassword);
    } catch (err) {
        throw new Error(_authErrorMessage(err.code));
    }
}

export async function refreshSession() {
    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return;
    _setSession({ isLoading: true });
    await _buildSession(firebaseUser);
}

//#endregion


//#region Public API — Session Access

export function getSession() {
    return { ..._session };
}

export function onSessionChange(fn) {
    _listeners.push(fn);
    fn({ ..._session });
    return () => {
        _listeners = _listeners.filter(l => l !== fn);
    };
}

export function isReady() {
    return _authResolved;
}

export function requireAuth() {
    if (!_session.isAuthenticated) throw new Error('Not authenticated.');
    return { ..._session };
}

//#endregion


//#region Inactivity Timer

/**
 * startInactivityTimer()
 *
 * Call this once after a successful login.
 * Attaches interaction listeners that reset the timer on any activity.
 * After INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS of inactivity,
 * shows the warning modal with a 2-minute countdown.
 * If no action taken, force-signs out at 0:00.
 */
export function startInactivityTimer() {
    _stopInactivityTimer();
    _resetInactivityTimer();

    INACTIVITY_EVENTS.forEach(evt =>
        window.addEventListener(evt, _onUserActivity, { passive: true })
    );
}

export function stopInactivityTimer() {
    _stopInactivityTimer();
}

function _onUserActivity() {
    if (_warningActive) return; // don't reset if warning is showing
    _resetInactivityTimer();
}

function _resetInactivityTimer() {
    clearTimeout(_inactivityTimer);
    _inactivityTimer = setTimeout(
        _showWarning,
        INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS
    );
}

function _stopInactivityTimer() {
    clearTimeout(_inactivityTimer);
    clearTimeout(_warningTimer);
    clearInterval(_countdownTimer);
    _inactivityTimer = null;
    _warningTimer    = null;
    _countdownTimer  = null;
    _warningActive   = false;
    _removeWarningOverlay();
    INACTIVITY_EVENTS.forEach(evt =>
        window.removeEventListener(evt, _onUserActivity)
    );
}

function _showWarning() {
    if (_warningActive) return;
    _warningActive = true;

    let secondsLeft = Math.floor(WARNING_DURATION_MS / 1000);

    _warningOverlay = document.createElement('div');
    _warningOverlay.id        = 'inactivityWarning';
    _warningOverlay.className = 'cm-overlay open';
    _warningOverlay.innerHTML = /*html*/`
        <div class="cm-box" style="border-top-color:var(--flag)">
            <div class="cm-header">
                <div class="cm-title" style="color:var(--flag)">Session Expiring</div>
            </div>
            <div class="cm-body">
                <div class="cm-message">
                    You've been inactive for a while. You'll be automatically signed out in
                    <span id="inactivityCountdown" style="font-family:var(--f-mono);color:var(--flag);font-size:16px">2:00</span>
                    to protect your account.
                </div>
            </div>
            <div class="cm-footer">
                <button class="btn btn-cta" id="stayLoggedInBtn">◈ STAY LOGGED IN</button>
            </div>
        </div>
    `;

    document.body.appendChild(_warningOverlay);

    document.getElementById('stayLoggedInBtn')?.addEventListener('click', () => {
        _warningActive = false;
        _removeWarningOverlay();
        _resetInactivityTimer();
    });

    // Countdown
    const countdownEl = () => document.getElementById('inactivityCountdown');
    _countdownTimer = setInterval(() => {
        secondsLeft--;
        const mins = Math.floor(secondsLeft / 60);
        const secs = secondsLeft % 60;
        const el = countdownEl();
        if (el) el.textContent = `${mins}:${String(secs).padStart(2, '0')}`;

        if (secondsLeft <= 0) {
            clearInterval(_countdownTimer);
            _forceSignOut();
        }
    }, 1000);
}

async function _forceSignOut() {
    _stopInactivityTimer();
    _removeWarningOverlay();

    const { sessionId } = _session;
    stopHeartbeat();
    if (sessionId) {
        try { await closeSession(sessionId); } catch (e) {}
    }
    await firebaseSignOut(auth);
    _clearSession();

    // Navigate to login — import navigate dynamically to avoid circular deps
    const { navigate } = await import('../router.js');
    navigate('/login');
}

function _removeWarningOverlay() {
    if (_warningOverlay) {
        _warningOverlay.remove();
        _warningOverlay = null;
    }
    document.getElementById('inactivityWarning')?.remove();
}

//#endregion


//#region Error Messages

function _authErrorMessage(code) {
    const map = {
        'auth/invalid-credential':     'Incorrect email or password.',
        'auth/user-not-found':         'Incorrect email or password.',
        'auth/wrong-password':         'Incorrect email or password.',
        'auth/user-disabled':          'This account has been disabled. Contact your administrator.',
        'auth/too-many-requests':      'Too many failed attempts. Please wait a few minutes and try again.',
        'auth/network-request-failed': 'Network error. Check your connection and try again.',
        'auth/invalid-email':          'Invalid email address.',
        'auth/weak-password':          'Password must be at least 8 characters.',
        'auth/requires-recent-login':  'Please sign out and sign back in before changing your password.',
    };
    return map[code] ?? 'Something went wrong. Please try again.';
}

//#endregion