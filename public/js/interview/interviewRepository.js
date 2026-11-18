/**
 * interviewRepository.js
 * @version 1.0.0
 *
 * All Firestore operations for the interviews collection.
 * Interview documents are keyed by prospect ID — one doc per prospect.
 *
 * Nothing in here touches the DOM or knows about the UI.
 * All returned data is normalized through interviewModel before
 * leaving this module.
 */


//#region Imports
import {
    db,
    collection,
    getDocs,
    doc,
    setDoc,
} from '../firestore.js';

import { normalizeInterview } from './interviewModel.js';
//#endregion


//#region Constants
const COLLECTION = 'interviews';
//#endregion


//#region Public API

/**
 * Fetch all interview documents.
 * Returns a map of { [prospectId]: normalizedInterview }
 * so callers can do O(1) lookups when merging with prospect data.
 */
export async function fetchAllInterviews() {
    const snapshot = await getDocs(collection(db, COLLECTION));
    const map = {};
    snapshot.forEach(d => {
        map[d.id] = normalizeInterview(d.data());
    });
    return map;
}

/**
 * Save (create or overwrite) an interview document.
 * Uses setDoc — interview docs are always keyed by prospect ID
 * so there is no separate create vs update.
 *
 * @param {string} prospectId
 * @param {Object} interviewData - A normalized interview object
 */
export async function saveInterview(prospectId, interviewData) {
    await setDoc(doc(db, COLLECTION, prospectId), interviewData);
}

//#endregion