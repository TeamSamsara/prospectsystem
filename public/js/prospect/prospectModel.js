/**
 * prospectModel.js
 * @version 1.1.0
 *
 * Changes from 1.0.0:
 *   - EMPTY_COMBINE_INPUT: added opponentId (prospectId for SOS resolution)
 *     opponent text field kept for backward compat with legacy entries
 *   - normalizeCombineInput: maps old opponent text to legacy field
 *   - Score fields updated to match formulas.js v2 output
 */

//#region Data Models

const EMPTY_CHAMPION_INPUT = {
    champion:  '',
    games:     '',
    wins:      '',
    losses:    '',
    winRate:   '',
    kda:       '',
    csPerMin:  '',
    gdAt15:    '',
    lobby:     '',
    opponent:  '',
    notes:     '',
};

const EMPTY_COMBINE_INPUT = {
    lobby:          '',
    gameNum:        '',
    championPlayed: '',
    axis1:          '',
    axis2:          '',
    opponentId:     '',   // prospectId — used for SOS calculation
    opponent:       '',   // legacy free-text field — kept for backward compat
    coach:          '',
    coachNotes:     '',
};

const EMPTY_SCOUTING_REPORT_INPUT = {
    id:         '',
    coach:      '',
    date:       '',
    strengths:  '',
    concerns:   '',
    highlights: '',
    notes:      '',
};

//#endregion


//#region Data Schema

const EMPTY_PROSPECT_PROFILE = {

    // Identity
    candidateFullname:    '',
    candidateUsername:    '',
    role:                 '',
    region:               '',
    discord:              '',
    twitter:              '',
    age:                  '',
    profileCreatedAt:     '',
    lastCombineAt:        '',
    lastScoutingReportAt: '',
    evaluatedLastBy:      '',
    currentTeam:          '',
    currentRank:          '',
    peakRank:             '',
    previousTeam:         '',
    achievement:          '',

    // Champion pool
    champion: [],

    // Combine log
    combineLog: [],

    // Soft skills
    coachability:      '',
    communication:     '',
    attitude:          '',
    teamFit:           '',
    selfAwareness:     '',
    coachNotes:        '',
    coachabilityNote:  '',
    communicationNote: '',
    attitudeNote:      '',
    teamFitNote:       '',
    selfAwarenessNote: '',

    // Scouting reports
    strengths:       '',
    concerns:        '',
    highlights:      '',
    scoutingReports: [],

    // Verdicts
    finalDecisions:        '',
    ceilingAssessment:     '',
    writtenRecommendation: '',
    followUpAction:        '',
    followUpDate:          '',

    // Computed scores (formulas.js v2)
    rawScore:       '0.00',
    adjustedScore:  '0.00',
    overallScore:   '0.00',  // alias for adjustedScore
    axis1Avg:       '0.00',
    axis2Avg:       '0.00',
    softSkillsAvg:  '0.00',
    letterGrade:    '-',
    autoDecision:   'PENDING',

    // Score breakdown fields
    axis1Raw:        0,
    axis1Bayes:      0,
    axis1PoolDepth:  0,
    axis1Final:      0,
    axis1Entries:    0,
    axis1Confidence: 0,
    axis2Raw:        0,
    axis2Bayes:      0,
    axis2Final:      0,
    axis2Entries:    0,
    axis2Confidence: 0,
    softSkillsCount: 0,

    // Metadata
    createdAt: null,
};

//#endregion


//#region Public API

export function createEmptyProspect() {
    return structuredClone(EMPTY_PROSPECT_PROFILE);
}

export function normalizeProspect(raw) {
    const prospect = {
        ...createEmptyProspect(),
        ...raw,
    };

    prospect.champion = Array.isArray(raw.champion)  ? raw.champion.map(normalizeChampionInput)
                      : Array.isArray(raw.champions) ? raw.champions.map(normalizeChampionInput)
                      : [];

    prospect.combineLog = Array.isArray(raw.combineLog)
        ? raw.combineLog.map(normalizeCombineInput)
        : [];

    prospect.scoutingReports = resolveScoutingReport(raw);

    return prospect;
}

export function createEmptyChampionInput() {
    return { ...EMPTY_CHAMPION_INPUT };
}

export function createEmptyCombineInput() {
    return { ...EMPTY_COMBINE_INPUT };
}

export function createScoutingInput({ coach = '', date = '' } = {}) {
    return {
        ...EMPTY_SCOUTING_REPORT_INPUT,
        id: crypto.randomUUID(),
        coach,
        date,
    };
}

//#endregion


//#region Private Helpers

function normalizeChampionInput(raw) {
    return {
        ...EMPTY_CHAMPION_INPUT,
        ...raw,
        // Backward compat
        kda:      raw.kda      || raw.keyStat1 || '',
        csPerMin: raw.csPerMin || raw.keyStat2 || '',
    };
}

function normalizeCombineInput(raw) {
    return {
        ...EMPTY_COMBINE_INPUT,
        ...raw,
        // opponentId is new — defaults to empty string for legacy entries
        opponentId: raw.opponentId || '',
        // Keep legacy free-text opponent field
        opponent:   raw.opponent   || '',
    };
}

function resolveScoutingReport(raw) {
    if (raw.scoutingReports?.length > 0) {
        return raw.scoutingReports;
    }

    const strengths  = raw.strengths  || raw.keyStrengths     || '';
    const concerns   = raw.concerns   || raw.areasOfConcern   || '';
    const highlights = raw.highlights || raw.highlightMoments || '';
    const notes      = raw.notes      || raw.additionalNotes  || '';

    const hasLegacyContent = strengths || concerns || highlights || notes;

    if (hasLegacyContent) {
        return [{
            ...EMPTY_SCOUTING_REPORT_INPUT,
            id:         'legacy',
            coach:      '',
            date:       '',
            strengths,
            concerns,
            highlights,
            notes,
            isLegacy:   true,
        }];
    }

    return [];
}

//#endregion