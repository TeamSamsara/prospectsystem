/**
 * repository.js
 * @version 1.0.0
 *
 */


//#region Imports
import {
    db,
    collection,
    addDoc,
    getDocs,
    getDoc,
    doc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
} from '../firestore.js';

import { normalizeProspect } from './prospectModel.js';
//#endregion


//#region Constants
const COLLECTION = 'prospects';
//#endregion


//#region Public API

/**
 * Fetch all prospects from Firestore.
 * Returns an array of { id, data } where data is always normalized.
 */
export async function fetchAllProspects() {
    const snapshot = await getDocs(collection(db, COLLECTION));
    const results = [];
    snapshot.forEach(d => {
        results.push({
            id:   d.id,
            data: normalizeProspect(d.data()),
        });
    });
    return results;
}

/**
 * Fetch a single prospect by Firestore document ID.
 * Returns a normalized prospect object, or null if not found.
 */
export async function fetchProspect(id) {
    const snap = await getDoc(doc(db, COLLECTION, id));
    if (!snap.exists()) return null;
    return normalizeProspect(snap.data());
}

/**
 * Create a new prospect document.
 * Returns the new document ID.
 */
export async function createProspect(profile) {
    const ref = await addDoc(collection(db, COLLECTION), {
        ...profile,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

/**
 * Update an existing prospect document by ID.
 */
export async function updateProspect(id, profile) {
    await updateDoc(doc(db, COLLECTION, id), profile);
}

/**
 * Delete a prospect document by ID.
 */
export async function deleteProspect(id) {
    await deleteDoc(doc(db, COLLECTION, id));
}
//#endregion