/**
 * auditRepository.js
 * @version 1.1.0
 *
 * Added: cleanupOldAuditLogs(daysOld) and getAuditStats() for admin cleanup panel.
 */

import {
    db,
    collection,
    doc,
    getDocs,
    setDoc,
    deleteDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    limit,
} from '../firestore.js';

import {
    createAuditEvent,
    normalizeAuditEvent,
    ACTIONS,
    TARGET_TYPES,
} from './auditModel.js';


//#region Constants

const COLLECTION = 'auditLog';

//#endregion


//#region Write

/**
 * logAudit(session, action, options)
 *
 * Single entry point for writing audit events.
 * Never throws — audit failure never surfaces to the user.
 */
export async function logAudit(session, action, options = {}) {
    try {
        const event = createAuditEvent(session, action, options);
        await setDoc(doc(db, COLLECTION, event.eventId), {
            ...event,
            timestamp: serverTimestamp(),
        });
    } catch (err) {
        console.warn('Audit log write failed:', err);
    }
}

//#endregion


//#region Read

export async function fetchAuditLog({ max = 200 } = {}) {
    const q = query(
        collection(db, COLLECTION),
        orderBy('timestamp', 'desc'),
        limit(max),
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeAuditEvent(d.data(), d.id)));
    return list;
}

export async function fetchAuditLogForUser(uid, { max = 100 } = {}) {
    const q = query(
        collection(db, COLLECTION),
        where('uid', '==', uid),
        orderBy('timestamp', 'desc'),
        limit(max),
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeAuditEvent(d.data(), d.id)));
    return list;
}

export async function fetchAuditLogForTarget(targetId, { max = 50 } = {}) {
    const q = query(
        collection(db, COLLECTION),
        where('targetId', '==', targetId),
        orderBy('timestamp', 'desc'),
        limit(max),
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeAuditEvent(d.data(), d.id)));
    return list;
}

export async function fetchAuditLogByAction(action, { max = 100 } = {}) {
    const q = query(
        collection(db, COLLECTION),
        where('action', '==', action),
        orderBy('timestamp', 'desc'),
        limit(max),
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeAuditEvent(d.data(), d.id)));
    return list;
}

export async function fetchFailedActions({ max = 100 } = {}) {
    const q = query(
        collection(db, COLLECTION),
        where('success', '==', false),
        orderBy('timestamp', 'desc'),
        limit(max),
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeAuditEvent(d.data(), d.id)));
    return list;
}

//#endregion


//#region Admin Cleanup

/**
 * cleanupOldAuditLogs(daysOld)
 *
 * Deletes audit log entries older than daysOld days.
 * Called manually by admin from the cleanup panel.
 * Processes up to 500 records per call.
 *
 * @param {number} daysOld
 * @returns {number} count of deleted records
 */
export async function cleanupOldAuditLogs(daysOld = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    const q    = query(collection(db, COLLECTION), limit(500));
    const snap = await getDocs(q);
    const deletes = [];

    snap.forEach(d => {
        const ts = d.data().timestamp?.toDate?.();
        if (ts && ts < cutoff) {
            deletes.push(deleteDoc(doc(db, COLLECTION, d.id)));
        }
    });

    await Promise.all(deletes);
    return deletes.length;
}

/**
 * getAuditStats()
 *
 * Returns a count summary for the cleanup panel.
 * @returns {{ total, failures, oldest }}
 */
export async function getAuditStats() {
    const snap = await getDocs(collection(db, COLLECTION));
    let total    = 0;
    let failures = 0;
    let oldest   = null;

    snap.forEach(d => {
        total++;
        if (d.data().success === false) failures++;
        const ts = d.data().timestamp?.toDate?.();
        if (ts && (!oldest || ts < oldest)) oldest = ts;
    });

    return { total, failures, oldest };
}

//#endregion


//#region Re-exports
export { ACTIONS, TARGET_TYPES } from './auditModel.js';
//#endregion