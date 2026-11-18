/**
 * userRepository.js
 * @version 1.0.0
 *
 * Firestore CRUD for the users collection.
 * All reads normalize through userModel.normalizeUser().
 * All writes use createUserForFirestore() shape from userModel.
 *
 * Firestore collection: users/{uid}
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
} from '../firestore.js';

import { normalizeUser, createUserForFirestore } from './userModel.js';


//#region Constants

const COLLECTION = 'users';

//#endregion


//#region Read

/**
 * fetchUser(uid)
 * Fetches a single user document by uid.
 *
 * @param {string} uid
 * @returns {Object|null} normalized user or null if not found
 */
export async function fetchUser(uid) {
    const snap = await getDoc(doc(db, COLLECTION, uid));
    if (!snap.exists()) return null;
    return normalizeUser(snap.data(), snap.id);
}

/**
 * fetchAllUsers()
 * Fetches all user documents, sorted by createdAt descending.
 *
 * @returns {Object[]} array of normalized users
 */
export async function fetchAllUsers() {
    const q    = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeUser(d.data(), d.id)));
    return list;
}

/**
 * fetchUsersByRole(role)
 * Fetches all users with a specific role.
 *
 * @param {string} role — one of ROLES values
 * @returns {Object[]}
 */
export async function fetchUsersByRole(role) {
    const q    = query(collection(db, COLLECTION), where('role', '==', role));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => list.push(normalizeUser(d.data(), d.id)));
    return list;
}

//#endregion


//#region Write

/**
 * createUser(uid, data)
 *
 * Writes a new user document to Firestore.
 * uid comes from Firebase Auth — caller creates the Auth account first,
 * then calls this to write the Firestore profile.
 *
 * @param {string} uid
 * @param {Object} data — { email, role, displayName?, createdBy, tempPassword }
 * @returns {Object}    normalized user
 */
export async function createUser(uid, data) {
    const userDoc = {
        ...createUserForFirestore(data),
        createdAt: serverTimestamp(),
    };
    await setDoc(doc(db, COLLECTION, uid), userDoc);
    return normalizeUser(userDoc, uid);
}

/**
 * updateUser(uid, updates)
 *
 * Partial update — only the provided fields are changed.
 *
 * @param {string} uid
 * @param {Object} updates — partial user fields
 */
export async function updateUser(uid, updates) {
    await updateDoc(doc(db, COLLECTION, uid), updates);
}

/**
 * completeFirstLogin(uid, { displayName, hashedPassword? })
 *
 * Called after the user completes account setup.
 * Clears isFirstLogin, mustChangePassword, and tempPassword.
 * Password change itself is handled by Firebase Auth — we just clear the flags.
 *
 * @param {string} uid
 * @param {Object} data — { displayName }
 */
export async function completeFirstLogin(uid, { displayName }) {
    await updateDoc(doc(db, COLLECTION, uid), {
        displayName,
        isFirstLogin:       false,
        mustChangePassword: false,
        tempPassword:       '',    // clear temp password from Firestore
    });
}

/**
 * updateLastLogin(uid)
 *
 * Stamps lastLoginAt with current server time on each sign-in.
 *
 * @param {string} uid
 */
export async function updateLastLogin(uid) {
    await updateDoc(doc(db, COLLECTION, uid), {
        lastLoginAt: serverTimestamp(),
    });
}

/**
 * revokeUser(uid)
 *
 * Sets isActive to false — user can no longer log in.
 * Does not delete the Firestore document or the Firebase Auth account.
 * Audit trail is preserved.
 *
 * @param {string} uid
 */
export async function revokeUser(uid) {
    await updateDoc(doc(db, COLLECTION, uid), {
        isActive: false,
    });
}

/**
 * reinstateUser(uid)
 *
 * Re-activates a previously revoked account.
 *
 * @param {string} uid
 */
export async function reinstateUser(uid) {
    await updateDoc(doc(db, COLLECTION, uid), {
        isActive: true,
    });
}

/**
 * deleteUser(uid)
 *
 * Hard deletes the Firestore user document.
 * Firebase Auth account must be deleted separately via Admin SDK or console.
 * Only used in exceptional cases — prefer revokeUser() for audit purposes.
 *
 * @param {string} uid
 */
export async function deleteUser(uid) {
    await deleteDoc(doc(db, COLLECTION, uid));
}

//#endregion