/**
 * formulas.js
 * @version 2.1.0
 *
 * Changes from 2.0.0:
 *   - SOS is now asymmetric:
 *     Punching up (opponent stronger): gap x SOS_WEIGHT_UP  (cap +SOS_CAP)
 *     Punching down (opponent weaker): gap x SOS_WEIGHT_DOWN (cap -SOS_CAP)
 *   - This rewards players outperforming stronger opponents meaningfully
 *     while only mildly dampening players who only face weaker competition
 *
 * Axis 1 (Mechanics - individual):
 *   1. Per entry: asymmetric SOS modifier if opponentId resolves to a scored
 *      prospect with >= 3 combine entries
 *      gap        = opponent_score - NEUTRAL
 *      adjustment = gap > 0 ? gap x SOS_WEIGHT_UP : gap x SOS_WEIGHT_DOWN
 *      capped at +/- SOS_CAP
 *   2. Average all adjusted axis1 entries
 *   3. Bayesian shrinkage toward neutral (2.5)
 *      confidence = n / (n + BAYES_K)
 *      adjusted   = confidence x raw + (1 - confidence) x NEUTRAL
 *   4. Pool depth modifier (only if champion data exists)
 *
 * Axis 2 (Competitive IQ - team-based):
 *   1. Average all axis2 entries (no SOS - team axis)
 *   2. Bayesian shrinkage (same k)
 *
 * Soft Skills:
 *   Fixed 25% of final score regardless of game count.
 *
 * Final Score:
 *   Both axes + soft:  final = avg(axis1, axis2) x 0.75 + softAvg x 0.25
 *   Axes only:         final = avg(axis1, axis2)
 *   Soft only:         final = softAvg (provisional)
 */


//#region Constants

const NEUTRAL = 2.5;
const BAYES_K = 3;

// Asymmetric SOS weights
const SOS_WEIGHT_UP   = 0.20;  // punching up against stronger opponent
const SOS_WEIGHT_DOWN = 0.07;  // playing down against weaker opponent
const SOS_CAP         = 0.30;  // max SOS effect per entry in either direction

const DEPTH_SCALE = 0.10;
const DEPTH_CAP   = 0.10;

const SOS_MIN_ENTRIES = 3;

const SOFT_WEIGHT = 0.25;
const AXES_WEIGHT = 0.75;

//#endregion


//#region Internal Helpers

function _avg(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function _clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}

function _bayesian(rawAvg, entryCount) {
    const confidence = entryCount / (entryCount + BAYES_K);
    return confidence * rawAvg + (1 - confidence) * NEUTRAL;
}

/**
 * Asymmetric SOS modifier for a single entry.
 *
 * If opponent is stronger than NEUTRAL: reward scales at SOS_WEIGHT_UP
 * If opponent is weaker than NEUTRAL:   dampener scales at SOS_WEIGHT_DOWN
 *
 * The key insight: the gap is relative to NEUTRAL (2.5), not to the player's
 * own score. A player at 2.35 facing a 2.84 opponent has a positive gap
 * because 2.84 > 2.5. The reward is about the opponent's absolute strength,
 * not the relative difference between the two players.
 */
function _sosModifier(opponentId, allProspects) {
    if (!opponentId || !allProspects?.length) return 0;

    const opp = allProspects.find(p => p.id === opponentId);
    if (!opp) return 0;

    const oppScore = Number(opp.data?.rawScore || opp.data?.overallScore);
    if (!oppScore || oppScore <= 0) return 0;

    const oppEntries = (opp.data?.combineLog || [])
        .filter(r => Number(r.axis1) > 0).length;
    if (oppEntries < SOS_MIN_ENTRIES) return 0;

    const gap = oppScore - NEUTRAL;

    // Asymmetric: bigger multiplier when opponent is above neutral
    const weight = gap > 0 ? SOS_WEIGHT_UP : SOS_WEIGHT_DOWN;
    const adjustment = gap * weight;

    return _clamp(adjustment, -SOS_CAP, +SOS_CAP);
}

function _poolDepthModifier(championLog) {
    if (!championLog?.length) return 0;

    const totalGames = championLog.reduce((sum, c) => sum + (Number(c.games) || 0), 0);
    if (totalGames === 0) return 0;

    const uniqueChamps = new Set(
        championLog
            .map(c => (c.champion || '').toLowerCase().trim())
            .filter(Boolean)
    ).size;

    const depthRatio = uniqueChamps / totalGames;
    return _clamp((depthRatio - 0.5) * DEPTH_SCALE, -DEPTH_CAP, +DEPTH_CAP);
}

//#endregion


//#region Grade / Decision

function _calcLetterGrade(score) {
    score = Number(score);
    if (score >= 3.75) return 'A+';
    if (score >= 3.5)  return 'A';
    if (score >= 3.25) return 'A-';
    if (score >= 3.0)  return 'B+';
    if (score >= 2.75) return 'B';
    if (score >= 2.5)  return 'B-';
    if (score >= 2.25) return 'C+';
    if (score >= 2.0)  return 'C';
    if (score >= 1.5)  return 'D';
    return 'F';
}

function _calcAutoDecision(score) {
    score = Number(score);
    if (score >= 3.0)  return 'SIGN';
    if (score >= 2.0)  return 'TRIAL';
    if (score >= 1.5)  return 'FLAG';
    return 'NO';
}

function _calcWinRate(wins, losses) {
    wins   = Number(wins)   || 0;
    losses = Number(losses) || 0;
    if (wins + losses === 0) return '-';
    return `${Math.round((wins / (wins + losses)) * 100)}%`;
}

//#endregion


//#region Public API

/**
 * calculateProfileStats(profile, allProspects?)
 *
 * @param {Object} profile       - prospect data object (mutated in place)
 * @param {Array}  allProspects  - optional: full prospect list for SOS resolution
 */
export function calculateProfileStats(profile, allProspects = []) {

    const log = profile.combineLog || [];

    //#region Axis 1

    const axis1Entries = log.filter(r => Number(r.axis1) > 0);
    const axis1Count   = axis1Entries.length;

    const axis1Adjusted = axis1Entries.map(r => {
        const raw = Number(r.axis1);
        const sos = _sosModifier(r.opponentId || null, allProspects);
        return _clamp(raw + sos, 1, 4);
    });

    const axis1Raw   = axis1Count > 0 ? _avg(axis1Adjusted) : 0;
    const axis1Conf  = axis1Count > 0 ? axis1Count / (axis1Count + BAYES_K) : 0;
    const axis1Bayes = axis1Count > 0 ? _bayesian(axis1Raw, axis1Count) : 0;

    const champLog   = profile.champion || profile.champions || [];
    const depthMod   = _poolDepthModifier(champLog);
    const axis1Final = axis1Count > 0 ? _clamp(axis1Bayes + depthMod, 1, 4) : 0;

    //#endregion

    //#region Axis 2

    const axis2Entries = log.filter(r => Number(r.axis2) > 0);
    const axis2Count   = axis2Entries.length;
    const axis2Raw     = axis2Count > 0
        ? _avg(axis2Entries.map(r => Number(r.axis2)))
        : 0;
    const axis2Conf  = axis2Count > 0 ? axis2Count / (axis2Count + BAYES_K) : 0;
    const axis2Final = axis2Count > 0 ? _bayesian(axis2Raw, axis2Count) : 0;

    //#endregion

    //#region Soft Skills

    const SOFT_FIELDS = ['coachability', 'communication', 'attitude', 'teamFit', 'selfAwareness'];
    const softValues  = SOFT_FIELDS
        .map(f => Number(profile[f]) || 0)
        .filter(v => v > 0);
    const softAvg = softValues.length > 0 ? _avg(softValues) : 0;

    //#endregion

    //#region Final Score

    const hasAxes = axis1Final > 0 || axis2Final > 0;
    const hasSoft = softAvg > 0;

    // Raw score - simple average, no SOS adjustments
    const rawAxis1 = axis1Count > 0 ? _avg(axis1Entries.map(r => Number(r.axis1))) : null;
    const rawAxis2 = axis2Count > 0 ? _avg(axis2Entries.map(r => Number(r.axis2))) : null;
    const rawParts = [rawAxis1, rawAxis2, hasSoft ? softAvg : null].filter(v => v !== null && v > 0);
    const rawScore = rawParts.length > 0 ? _avg(rawParts) : 0;

    // Adjusted score
    let adjustedScore = 0;

    if (hasAxes && hasSoft) {
        const axisVals = [axis1Final > 0 ? axis1Final : null, axis2Final > 0 ? axis2Final : null].filter(Boolean);
        adjustedScore  = _avg(axisVals) * AXES_WEIGHT + softAvg * SOFT_WEIGHT;
    } else if (hasAxes) {
        const axisVals = [axis1Final > 0 ? axis1Final : null, axis2Final > 0 ? axis2Final : null].filter(Boolean);
        adjustedScore  = _avg(axisVals);
    } else if (hasSoft) {
        adjustedScore = softAvg;
    }

    //#endregion

    //#region Write Fields

    profile.axis1Raw        = axis1Raw;
    profile.axis1Bayes      = axis1Bayes;
    profile.axis1PoolDepth  = depthMod;
    profile.axis1Final      = axis1Final;
    profile.axis1Entries    = axis1Count;
    profile.axis1Confidence = Math.round(axis1Conf * 100);

    profile.axis2Raw        = axis2Raw;
    profile.axis2Bayes      = axis2Final;
    profile.axis2Final      = axis2Final;
    profile.axis2Entries    = axis2Count;
    profile.axis2Confidence = Math.round(axis2Conf * 100);

    profile.softSkillsCount = softValues.length;

    profile.axis1Avg      = axis1Final > 0 ? axis1Final.toFixed(2) : '0.00';
    profile.axis2Avg      = axis2Final > 0 ? axis2Final.toFixed(2) : '0.00';
    profile.softSkillsAvg = softAvg    > 0 ? softAvg.toFixed(2)    : '0.00';

    profile.rawScore      = rawScore      > 0 ? rawScore.toFixed(2)      : '0.00';
    profile.adjustedScore = adjustedScore > 0 ? adjustedScore.toFixed(2) : '0.00';
    profile.overallScore  = profile.adjustedScore;

    // Manual verdict override takes precedence over auto decision
    profile.letterGrade  = _calcLetterGrade(adjustedScore);
    profile.autoDecision = profile.finalDecisions || _calcAutoDecision(adjustedScore);

    champLog.forEach(c => {
        c.winRate = _calcWinRate(c.wins, c.losses);
    });

    //#endregion

    return profile;
}

/**
 * calculateProfileStatsRaw(profile)
 * No SOS - used as fallback when allProspects is unavailable.
 */
export function calculateProfileStatsRaw(profile) {
    return calculateProfileStats(profile, []);
}

/**
 * Exported constants for UI use.
 */
export const SCORING = {
    NEUTRAL,
    BAYES_K,
    SOS_WEIGHT_UP,
    SOS_WEIGHT_DOWN,
    SOS_MIN_ENTRIES,
    SOFT_WEIGHT,
    AXES_WEIGHT,
    DEPTH_CAP,
    SOS_CAP,
};