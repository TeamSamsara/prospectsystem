/**
 * calc.js
 * @version 1.2.0
 *
 * Changes from 1.1.0:
 *   - initCalc now accepts allProspects for live SOS resolution
 *   - _buildLiveProfile reads opponentId from each combine row select
 *   - Uses calculateProfileStats with real prospects so SOS applies live
 */

//#region Imports
import { calculateProfileStats } from '/js/formulas.js';
//#endregion


//#region State
let _form         = null;
let _combineBody  = null;
let _allProspects = [];
//#endregion


//#region Constants
const SOFT_SKILL_FIELDS = [
    'coachability',
    'communication',
    'attitude',
    'teamFit',
    'selfAwareness',
];

const DECISION_CLASS_MAP = {
    SIGN:  'rec-PASS',
    TRIAL: 'rec-FLAG',
    FLAG:  'rec-FLAG',
    NO:    'rec-NO',
};
//#endregion


//#region Public API

export function initCalc({ form, combineBody, allProspects = [] }) {
    _form         = form;
    _combineBody  = combineBody;
    _allProspects = allProspects;
}

export function runLiveCalc() {
    if (!_form || !_combineBody) return;

    const liveProfile = _buildLiveProfile();
    calculateProfileStats(liveProfile, _allProspects);

    const adjustedScore = Number(liveProfile.adjustedScore) || 0;
    const rawScore      = Number(liveProfile.rawScore)      || 0;
    const hasData       = adjustedScore > 0;
    const grade         = liveProfile.letterGrade   || '-';
    const decision      = liveProfile.autoDecision  || 'PENDING';

    const axis1Final = Number(liveProfile.axis1Final)      || 0;
    const axis2Final = Number(liveProfile.axis2Final)      || 0;
    const softAvg    = Number(liveProfile.softSkillsAvg)   || 0;
    const axis1Conf  = Number(liveProfile.axis1Confidence) || 0;
    const axis2Conf  = Number(liveProfile.axis2Confidence) || 0;
    const axis1Count = liveProfile.axis1Entries    || 0;
    const axis2Count = liveProfile.axis2Entries    || 0;
    const softCount  = liveProfile.softSkillsCount || 0;

    _updateVerdictFields({ liveProfile, hasData, grade, decision, axis1Count, axis2Count, softCount });
    _updateVerdictPanel({
        adjustedScore, rawScore, hasData, grade, decision,
        axis1Final, axis2Final, softAvg,
        axis1Count, axis2Count, softCount,
        axis1Conf, axis2Conf,
    });
}

//#endregion


//#region Private

function _buildLiveProfile() {
    const profile = { combineLog: [], champion: [] };

    SOFT_SKILL_FIELDS.forEach(f => {
        profile[f] = _form.querySelector(`[name="${f}"]`)?.value || 0;
    });

    _combineBody.querySelectorAll('tr').forEach(tr => {
        profile.combineLog.push({
            axis1:      tr.querySelector('[name="axis1"]')?.value          || 0,
            axis2:      tr.querySelector('[name="axis2"]')?.value          || 0,
            opponentId: tr.querySelector('[name="opponentSelect"]')?.value || '',
        });
    });

    const champBody = _form.querySelector('#championPoolTable tbody');
    if (champBody) {
        champBody.querySelectorAll('tr').forEach(tr => {
            const champion = tr.querySelector('[name="champion"]')?.value?.trim();
            const games    = tr.querySelector('[name="games"]')?.value;
            if (champion) {
                profile.champion.push({ champion, games: Number(games) || 0 });
            }
        });
    }

    return profile;
}

function _updateVerdictFields({ liveProfile, hasData, grade, decision, axis1Count, axis2Count, softCount }) {
    const set = (name, val) => {
        const el = _form.querySelector(`[name="${name}"]`);
        if (el) el.value = val;
    };

    set('axis1Avg',      axis1Count ? liveProfile.axis1Avg      : '-');
    set('axis2Avg',      axis2Count ? liveProfile.axis2Avg      : '-');
    set('softSkillsAvg', softCount  ? liveProfile.softSkillsAvg : '-');
    set('overallScore',  hasData    ? liveProfile.adjustedScore  : '-');
    set('letterGrade',   hasData    ? grade                      : '-');
    set('autoDecision',  hasData    ? decision                   : '-');
}

function _updateVerdictPanel({
    adjustedScore, rawScore, hasData, grade, decision,
    axis1Final, axis2Final, softAvg,
    axis1Count, axis2Count, softCount,
    axis1Conf, axis2Conf,
}) {
    const panel = document.getElementById('liveVerdictPanel');
    if (!panel) return;

    const scoreColor = s => s >= 3 ? 'var(--pass)' : s >= 2 ? 'var(--flag)' : s > 0 ? 'var(--no)' : 'var(--text3)';
    const pct        = v => `${Math.min((v / 4) * 100, 100)}%`;
    const fmt        = v => v > 0 ? v.toFixed(2) : '-';

    const scoreEl = panel.querySelector('.lvp-score');
    if (scoreEl) {
        scoreEl.textContent = hasData ? adjustedScore.toFixed(2) : '-';
        scoreEl.style.color = scoreColor(adjustedScore);
    }

    const rawEl = panel.querySelector('.lvp-raw');
    if (rawEl && hasData) {
        const delta = adjustedScore - rawScore;
        const sign  = delta > 0 ? '+' : '';
        rawEl.textContent = `RAW ${rawScore.toFixed(2)}  ${sign}${delta.toFixed(2)}`;
        rawEl.style.color = delta > 0.01 ? 'var(--pass)' : delta < -0.01 ? 'var(--no)' : 'var(--text3)';
    } else if (rawEl) {
        rawEl.textContent = '';
    }

    const gradeEl = panel.querySelector('.lvp-grade');
    const decEl   = panel.querySelector('.lvp-decision');
    if (gradeEl) gradeEl.textContent = hasData ? grade : '-';
    if (decEl) {
        decEl.textContent = decision;
        decEl.className   = `lvp-decision rec ${DECISION_CLASS_MAP[decision] || 'rec-PENDING'}`;
    }

    const bar1  = panel.querySelector('.lvp-bar-1');
    const val1  = panel.querySelector('.lvp-val-1');
    const conf1 = panel.querySelector('.lvp-conf-1');
    if (bar1) { bar1.style.width = axis1Count ? pct(axis1Final) : '0%'; bar1.style.background = axis1Count ? scoreColor(axis1Final) : 'var(--line)'; }
    if (val1) val1.textContent = axis1Count ? fmt(axis1Final) : '-';
    if (conf1) {
        conf1.textContent = axis1Count ? `${axis1Conf}% - ${axis1Count}g` : '';
        conf1.style.color = axis1Conf >= 67 ? 'var(--pass)' : axis1Conf >= 40 ? 'var(--flag)' : 'var(--no)';
    }

    const bar2  = panel.querySelector('.lvp-bar-2');
    const val2  = panel.querySelector('.lvp-val-2');
    const conf2 = panel.querySelector('.lvp-conf-2');
    if (bar2) { bar2.style.width = axis2Count ? pct(axis2Final) : '0%'; bar2.style.background = axis2Count ? scoreColor(axis2Final) : 'var(--line)'; }
    if (val2) val2.textContent = axis2Count ? fmt(axis2Final) : '-';
    if (conf2) {
        conf2.textContent = axis2Count ? `${axis2Conf}% - ${axis2Count}g` : '';
        conf2.style.color = axis2Conf >= 67 ? 'var(--pass)' : axis2Conf >= 40 ? 'var(--flag)' : 'var(--no)';
    }

    const bar3 = panel.querySelector('.lvp-bar-3');
    const val3 = panel.querySelector('.lvp-val-3');
    if (bar3) { bar3.style.width = softCount ? pct(softAvg) : '0%'; bar3.style.background = softCount ? scoreColor(softAvg) : 'var(--line)'; }
    if (val3) val3.textContent = softCount ? fmt(softAvg) : '-';
}

//#endregion