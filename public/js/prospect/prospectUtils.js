/**
 * prospectUtils.js
 * @version 1.0.0
 *
 * Prospect-specific display utilities.
 * Converts domain values into CSS classes, colors, and formatted strings.
 */


//#region Score

/**
 * Returns a color CSS variable based on a 1–4 score.
 */
export function scoreColor(score) {
    const n = Number(score);
    if (n >= 3) return 'var(--pass)';
    if (n >= 2) return 'var(--flag)';
    if (n >  0) return 'var(--no)';
    return 'var(--text3)';
}

/**
 * Returns a CSS class based on a 1–4 score.
 */
export function scoreClass(score) {
    const n = Number(score);
    if (n >= 3) return 'score-pass';
    if (n >= 2) return 'score-flag';
    if (n >  0) return 'score-no';
    return '';
}

/**
 * Formats a score number for display.
 */
export function formatScore(score, fallback = '—') {
    const n = Number(score);
    return (!isNaN(n) && n > 0) ? n.toFixed(2) : fallback;
}

//#endregion


//#region Decision

/**
 * Returns the rec CSS class for a decision string.
 */
export function decisionClass(decision) {
    const map = {
        SIGN:  'rec-PASS',
        TRIAL: 'rec-FLAG',
        FLAG:  'rec-FLAG',
        NO:    'rec-NO',
    };
    return map[decision] || 'rec-PENDING';
}

/**
 * Returns a display label for a decision string.
 */
export function decisionLabel(decision) {
    return decision || 'PENDING';
}

//#endregion


//#region Role

/**
 * Returns the CSS class for a role pill.
 */
export function roleClass(role) {
    return `role-${(role || 'N/A').toUpperCase()}`;
}

//#endregion


//#region Rank

/**
 * Returns the CSS class for a rank number (1st, 2nd, 3rd).
 */
export function rankClass(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return 'dim';
}

//#endregion