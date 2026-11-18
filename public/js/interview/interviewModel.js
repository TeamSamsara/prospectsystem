/**
 * interviewModel.js
 * @version 1.0.0
 *
 * Single source of truth for the Interview domain object.
 * An interview document is keyed by prospect ID — one doc per prospect.
 *
 * Nothing in here touches the DOM or Firestore directly.
 */


//#region Constants
/**
 * Valid interview status values.
 */
export const INTERVIEW_STATUS = {
    PENDING:   'pending',
    SCHEDULED: 'scheduled',
    DONE:      'done',
    NO_SHOW:   'noshow',
};
//#endregion


//#region Schema

const EMPTY_INTERVIEW = {
    availability:  [],       // string[] — slot IDs the prospect is available for
    scheduledSlot: null,     // string | null — the assigned slot ID
    status:        'pending',// INTERVIEW_STATUS value
};

//#endregion


//#region Public API

/**
 * Returns a fresh empty interview record.
 */
export function createEmptyInterview() {
    return structuredClone(EMPTY_INTERVIEW);
}

/**
 * Normalizes raw Firestore interview data into a clean object.
 * Safe to call on old or missing documents.
 *
 * @param  {Object|null} raw
 * @returns {Object}
 */
export function normalizeInterview(raw) {
    if (!raw) return createEmptyInterview();

    return {
        ...createEmptyInterview(),
        ...raw,
        availability:  Array.isArray(raw.availability) ? raw.availability : [],
        scheduledSlot: raw.scheduledSlot ?? null,
        status:        raw.status ?? INTERVIEW_STATUS.PENDING,
    };
}

/**
 * Returns true if the prospect has set any availability.
 *
 * @param  {Object} interview
 * @returns {boolean}
 */
export function hasAvailability(interview) {
    return interview.availability.length > 0;
}

/**
 * Returns true if the interview is in a terminal state
 * (done or no-show) — no further scheduling actions apply.
 *
 * @param  {Object} interview
 * @returns {boolean}
 */
export function isTerminal(interview) {
    return interview.status === INTERVIEW_STATUS.DONE
        || interview.status === INTERVIEW_STATUS.NO_SHOW;
}

//#endregion