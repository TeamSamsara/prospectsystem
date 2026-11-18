/**
 * auditModel.js
 * @version 1.0.0
 *
 * Audit events use the same domain:operation strings as permissions.
 * P.PROSPECTS_DELETE is both the permission check and the audit action identifier.
 * No new vocabulary — one system of record for both access control and audit.
 *
 * Each event is written once, after the action completes,
 * with success: true/false and an optional error string.
 *
 * Firestore collection: auditLog/{eventId}
 * eventId is crypto.randomUUID() generated client-side.
 *
 * Cleanup: audit records are never deleted automatically.
 * Admin can filter and export from the admin panel.
 */

import { P } from '/js/auth/permissions.js';


//#region Schema

/**
 * EMPTY_AUDIT_EVENT
 *
 * Canonical shape of an audit log document in Firestore.
 * eventId is the document ID — also stored as a field for queryability.
 */
const EMPTY_AUDIT_EVENT = {
    eventId:    '',      // crypto.randomUUID()
    sessionId:  '',      // links back to sessions/{sessionId}
    uid:        '',      // Firebase Auth uid of the actor
    email:      '',      // denormalized for admin readability
    role:       '',      // role at time of action

    action:     '',      // P.* string — e.g. 'prospects:delete'
    domain:     '',      // extracted domain — e.g. 'prospects'
    operation:  '',      // extracted operation — e.g. 'delete'

    targetId:   null,    // Firestore document ID affected (if applicable)
    targetType: null,    // collection name — 'prospect' | 'combine' | etc.
    targetName: null,    // human-readable label for admin log display

    success:    true,    // false if the action threw an error
    error:      null,    // error message string if success === false

    metadata:   null,    // optional lightweight context { before, after, ... }

    timestamp:  null,    // serverTimestamp — set by repository
};

export function createEmptyAuditEvent() {
    return structuredClone(EMPTY_AUDIT_EVENT);
}

//#endregion


//#region Constants

/**
 * TARGET_TYPES
 *
 * Valid values for auditEvent.targetType.
 * Maps to Firestore collection names where applicable.
 */
export const TARGET_TYPES = Object.freeze({
    PROSPECT:  'prospect',
    COMBINE:   'combine',
    INTERVIEW: 'interview',
    LOBBY:     'lobby',
    USER:      'user',
    SESSION:   'session',
});

/**
 * All auditable actions — same strings as P.* permissions.
 * Aliased here so audit callsites import from auditModel
 * rather than mixing permission imports with audit imports.
 */
export const ACTIONS = Object.freeze({ ...P });

//#endregion


//#region Factory

/**
 * createAuditEvent(session, action, options)
 *
 * Builds an audit event object ready to write to Firestore.
 * timestamp is set to null here — the repository replaces it with serverTimestamp().
 *
 * @param {Object} session         — current in-memory session (from sessionModel)
 * @param {string} action          — one of ACTIONS.* / P.* strings
 * @param {Object} [options]
 * @param {string} [options.targetId]   — Firestore document ID of affected record
 * @param {string} [options.targetType] — one of TARGET_TYPES values
 * @param {string} [options.targetName] — human-readable label (e.g. prospect name)
 * @param {boolean}[options.success]    — defaults to true
 * @param {string} [options.error]      — error message if success === false
 * @param {Object} [options.metadata]   — optional extra context
 * @returns {Object}                    — audit event ready for Firestore
 */
export function createAuditEvent(session, action, {
    targetId   = null,
    targetType = null,
    targetName = null,
    success    = true,
    error      = null,
    metadata   = null,
} = {}) {
    const [domain, operation] = action.split(':');

    return {
        ...createEmptyAuditEvent(),
        eventId:    crypto.randomUUID(),
        sessionId:  session.sessionId,
        uid:        session.userProfile?.uid    ?? '',
        email:      session.userProfile?.email  ?? '',
        role:       session.userProfile?.role   ?? '',
        action,
        domain,
        operation,
        targetId,
        targetType,
        targetName,
        success,
        error:      error ? String(error) : null,
        metadata,
        timestamp:  null,  // repository sets serverTimestamp()
    };
}

//#endregion


//#region Normalization

/**
 * normalizeAuditEvent(raw, eventId)
 *
 * Merges a raw Firestore audit document into the canonical shape.
 * Used when reading events in the admin audit log view.
 *
 * @param {Object} raw      — raw Firestore document data
 * @param {string} eventId  — Firestore document ID
 * @returns {Object}        — normalized audit event
 */
export function normalizeAuditEvent(raw, eventId) {
    return {
        ...createEmptyAuditEvent(),
        ...raw,
        eventId,
    };
}

//#endregion