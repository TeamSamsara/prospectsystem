/**
 * sessionModel.js
 * @version 1.0.0
 *
 * Two responsibilities:
 *
 * 1. IN-MEMORY SESSION
 *    Current auth state for the running browser session.
 *    Holds the Firebase Auth user, normalized Firestore profile,
 *    and resolved permissions. Lives only in memory — gone on tab close.
 *    Firebase Auth handles persistence across page reloads natively.
 *
 * 2. FIRESTORE SESSION SCHEMA
 *    Audit record written to sessions/{sessionId} on login.
 *    Updated via heartbeat every 15 minutes.
 *    Closed on logout or cleaned up passively on next login.
 *
 * Firestore collection: sessions/{sessionId}
 * sessionId is generated client-side via crypto.randomUUID().
 */


//#region In-Memory Session State

/**
 * EMPTY_SESSION
 *
 * Canonical shape of the in-memory session object.
 * Populated by authService.js after Firebase Auth resolves
 * and the Firestore user profile is fetched.
 */
const EMPTY_SESSION = {
    // Firebase Auth
    firebaseUser:    null,   // raw Firebase Auth User object

    // Firestore profile
    userProfile:     null,   // normalized user object from userModel.js

    // Resolved at login time from roles.js — never re-fetched
    permissions:     [],     // string[] of P.* constants

    // Firestore session document reference
    sessionId:       null,   // crypto.randomUUID() — written to Firestore

    // State flags
    isLoading:       true,   // true while Firebase Auth is determining state
    isAuthenticated: false,  // true once firebaseUser + userProfile both loaded
};

export function createEmptySession() {
    return structuredClone(EMPTY_SESSION);
}

//#endregion


//#region Firestore Session Schema

/**
 * EMPTY_SESSION_RECORD
 *
 * Canonical shape of a session document written to Firestore.
 * Written on login, updated on heartbeat and logout.
 *
 * sessionId is the document ID — also stored as a field for queryability.
 */
const EMPTY_SESSION_RECORD = {
    sessionId:     '',      // crypto.randomUUID()
    uid:           '',      // Firebase Auth uid
    email:         '',      // denormalized for admin readability
    role:          '',      // role at time of login
    status:        '',      // 'active' | 'expired' | 'logged_out'
    loginAt:       null,    // serverTimestamp
    lastActiveAt:  null,    // serverTimestamp — updated by heartbeat
    logoutAt:      null,    // serverTimestamp — set on clean logout
    userAgent:     '',      // navigator.userAgent
    error:         null,    // null on clean sessions
};

export function createEmptySessionRecord() {
    return structuredClone(EMPTY_SESSION_RECORD);
}

/**
 * createSessionRecord(user)
 *
 * Builds the initial Firestore session document written on login.
 * loginAt and lastActiveAt are set to null here —
 * the repository replaces them with serverTimestamp().
 *
 * @param {Object} user — normalized user object from userModel.js
 * @returns {Object}    — ready to write to Firestore
 */
export function createSessionRecord(user) {
    return {
        ...createEmptySessionRecord(),
        sessionId:    crypto.randomUUID(),
        uid:          user.uid,
        email:        user.email,
        role:         user.role,
        status:       SESSION_STATUS.ACTIVE,
        userAgent:    navigator.userAgent,
        loginAt:      null,      // repository sets serverTimestamp()
        lastActiveAt: null,      // repository sets serverTimestamp()
    };
}

//#endregion


//#region Constants

export const SESSION_STATUS = Object.freeze({
    ACTIVE:     'active',
    EXPIRED:    'expired',
    LOGGED_OUT: 'logged_out',
});

/**
 * How long before a session is considered stale.
 * If lastActiveAt is older than this, the session is marked expired
 * on next login cleanup.
 */
export const SESSION_STALE_MS = 15 * 60 * 1000; // 15 minutes

/**
 * How often the heartbeat updates lastActiveAt in Firestore.
 * Set to 5 minutes — well within the 15-minute stale window.
 */
export const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

//#endregion


//#region Normalization

/**
 * normalizeSessionRecord(raw, sessionId)
 *
 * Merges a raw Firestore session document into the canonical shape.
 * Used when reading session records in the admin audit log.
 *
 * @param {Object} raw        — raw Firestore document data
 * @param {string} sessionId  — Firestore document ID
 * @returns {Object}          — normalized session record
 */
export function normalizeSessionRecord(raw, sessionId) {
    return {
        ...createEmptySessionRecord(),
        ...raw,
        sessionId,
    };
}

/**
 * isSessionStale(record)
 *
 * Returns true if the session's lastActiveAt is older than SESSION_STALE_MS.
 * Used during login cleanup to expire abandoned sessions.
 *
 * @param {Object} record — normalized session record
 * @returns {boolean}
 */
export function isSessionStale(record) {
    if (!record?.lastActiveAt) return true;
    const lastActive = record.lastActiveAt?.toMillis?.() ?? 0;
    return Date.now() - lastActive > SESSION_STALE_MS;
}

//#endregion