/**
 * sessionRepository.js
 * @version 1.1.0
 *
 * Added: cleanupOldSessions(daysOld) for admin manual cleanup.
 */

import {
    db,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
    query,
    where,
    orderBy,
    limit,
} from '../firestore.js';

import {
    createSessionRecord,
    normalizeSessionRecord,
    isSessionStale,
    SESSION_STATUS,
    HEARTBEAT_INTERVAL_MS,
} from './sessionModel.js';


//#region Constants

const COLLECTION = 'sessions';

//#endregion


//#region State

let _heartbeatTimer = null;

//#endregion


//#region Session Lifecycle

export async function openSession(user) {
    const record = createSessionRecord(user);

    await setDoc(doc(db, COLLECTION, record.sessionId), {
        ...record,
        loginAt:      serverTimestamp(),
        lastActiveAt: serverTimestamp(),
    });

    _cleanupStaleSessions(user.uid, record.sessionId).catch(console.warn);

    return record.sessionId;
}

export async function closeSession(sessionId) {
    stopHeartbeat();
    await updateDoc(doc(db, COLLECTION, sessionId), {
        status:   SESSION_STATUS.LOGGED_OUT,
        logoutAt: serverTimestamp(),
    });
}

export async function markSessionError(sessionId, error) {
    stopHeartbeat();
    await updateDoc(doc(db, COLLECTION, sessionId), {
        status:   SESSION_STATUS.EXPIRED,
        logoutAt: serverTimestamp(),
        error:    String(error),
    });
}

//#endregion


//#region Heartbeat

export function startHeartbeat(sessionId) {
    stopHeartbeat();
    _heartbeatTimer = setInterval(async () => {
        try {
            await updateDoc(doc(db, COLLECTION, sessionId), {
                lastActiveAt: serverTimestamp(),
            });
        } catch (err) {
            console.warn('Heartbeat failed:', err);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat() {
    if (_heartbeatTimer) {
        clearInterval(_heartbeatTimer);
        _heartbeatTimer = null;
    }
}

//#endregion


//#region Read

export async function fetchSession(sessionId) {
    const snap = await getDoc(doc(db, COLLECTION, sessionId));
    if (!snap.exists()) return null;
    return normalizeSessionRecord(snap.data(), snap.id);
}

export async function fetchSessionsForUser(uid, { max = 50 } = {}) {
    const q = query(
        collection(db, COLLECTION),
        where('uid', '==', uid),
        orderBy('loginAt', 'desc'),
        limit(max),
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeSessionRecord(d.data(), d.id)));
    return list;
}

export async function fetchActiveSessions() {
    const q = query(
        collection(db, COLLECTION),
        where('status', '==', SESSION_STATUS.ACTIVE),
        orderBy('loginAt', 'desc'),
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeSessionRecord(d.data(), d.id)));
    return list;
}

export async function fetchRecentSessions({ max = 100 } = {}) {
    const q = query(
        collection(db, COLLECTION),
        orderBy('loginAt', 'desc'),
        limit(max),
    );
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeSessionRecord(d.data(), d.id)));
    return list;
}

//#endregion


//#region Admin Cleanup

/**
 * cleanupOldSessions(daysOld)
 *
 * Deletes all non-active session records older than daysOld days.
 * Called manually by admin from the cleanup panel.
 * Only deletes logged_out and expired sessions — never active ones.
 *
 * Returns the number of records deleted.
 *
 * @param {number} daysOld — delete sessions older than this many days
 * @returns {number}        count of deleted records
 */
export async function cleanupOldSessions(daysOld = 30) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysOld);

    // Fetch all non-active sessions — we filter by date client-side
    // since Firestore compound queries on timestamps + status require an index
    const q = query(
        collection(db, COLLECTION),
        where('status', 'in', [SESSION_STATUS.LOGGED_OUT, SESSION_STATUS.EXPIRED]),
        limit(500),
    );

    const snap    = await getDocs(q);
    const deletes = [];

    snap.forEach(d => {
        const loginAt = d.data().loginAt?.toDate?.();
        if (loginAt && loginAt < cutoff) {
            deletes.push(deleteDoc(doc(db, COLLECTION, d.id)));
        }
    });

    await Promise.all(deletes);
    return deletes.length;
}

/**
 * getSessionStats()
 *
 * Returns a count summary for the cleanup panel.
 * @returns {{ total, active, expired, loggedOut }}
 */
export async function getSessionStats() {
    const snap = await getDocs(collection(db, COLLECTION));
    const stats = { total: 0, active: 0, expired: 0, loggedOut: 0 };
    snap.forEach(d => {
        stats.total++;
        const s = d.data().status;
        if (s === SESSION_STATUS.ACTIVE)     stats.active++;
        if (s === SESSION_STATUS.EXPIRED)    stats.expired++;
        if (s === SESSION_STATUS.LOGGED_OUT) stats.loggedOut++;
    });
    return stats;
}

//#endregion


//#region Private

async function _cleanupStaleSessions(uid, currentSessionId) {
    const q = query(
        collection(db, COLLECTION),
        where('uid', '==', uid),
        where('status', '==', SESSION_STATUS.ACTIVE),
    );

    const snap        = await getDocs(q);
    const expirations = [];

    snap.forEach(d => {
        if (d.id === currentSessionId) return;
        const record = normalizeSessionRecord(d.data(), d.id);
        if (isSessionStale(record)) {
            expirations.push(
                updateDoc(doc(db, COLLECTION, d.id), {
                    status:   SESSION_STATUS.EXPIRED,
                    logoutAt: serverTimestamp(),
                })
            );
        }
    });

    await Promise.all(expirations);
}

//#endregion