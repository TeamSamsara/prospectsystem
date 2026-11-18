/**
 * prospectList.js
 * @version 2.0.0
 *
 * New row layout: Rank | Player | Role | Axes | Score (raw->adj) | Confidence | Decision | Actions
 */


//#region Imports
import { escHtml, renderEmpty, renderLoading } from '/js/renderer.js';
import {
    scoreColor,
    scoreClass,
    decisionClass,
    rankClass,
    formatScore,
} from './prospectUtils.js';
//#endregion


//#region State
let _listEl         = null;
let _allDocs        = [];
let _activeRole     = 'ALL';
let _activeDecision = 'ALL';
let _searchQuery    = '';
let _onView         = null;
let _onEdit         = null;
let _onDelete       = null;
//#endregion


//#region Constants
const DECISION_CLASS_MAP = {
    SIGN:  'rec-PASS',
    TRIAL: 'rec-FLAG',
    FLAG:  'rec-FLAG',
    NO:    'rec-NO',
};
//#endregion


//#region Public API

/**
 * Initialize the list module.
 */
export function initList({ listEl, onView, onEdit, onDelete }) {
    _listEl   = listEl;
    _onView   = onView;
    _onEdit   = onEdit;
    _onDelete = onDelete;

    _wireFilterButtons();
    _wireSearch();
}

/**
 * Load a new set of docs into the list and re-render.
 */
export function setListData(docs) {
    _allDocs = docs;
    _updateSpillBar(_allDocs.map(d => d.data));
    _updateRoleBar(_allDocs.map(d => d.data));
    renderList();
}

/**
 * Re-render the list with current filters.
 */
export function renderList() {
    if (!_listEl) return;

    if (_allDocs.length === 0) {
        renderEmpty(_listEl, 'No profiles yet.', 'Create one to get started.');
        _updateFilterCount(0, 0);
        return;
    }

    const filtered = _allDocs.filter(({ data }) => {
        const role     = (data.role || '').toUpperCase();
        const decision = data.autoDecision || 'PENDING';
        const name     = ((data.candidateFullname || '') + ' ' + (data.candidateUsername || '')).toLowerCase();
        return (_activeRole     === 'ALL' || role     === _activeRole)
            && (_activeDecision === 'ALL' || decision === _activeDecision)
            && (_searchQuery    === ''    || name.includes(_searchQuery));
    });

    _updateFilterCount(filtered.length, _allDocs.length);

    if (filtered.length === 0) {
        renderEmpty(_listEl, 'No prospects match the current filters.');
        return;
    }

    _listEl.innerHTML = '';
    filtered.forEach(({ id, data }, idx) =>
        _listEl.appendChild(_buildListItem(id, data, idx + 1)));
}

//#endregion


//#region Private

function _buildListItem(id, data, rank) {
    const adjusted  = Number(data.adjustedScore) || 0;
    const raw       = Number(data.rawScore)       || 0;
    const decision  = data.autoDecision || 'PENDING';
    const role      = (data.role || 'N/A').toUpperCase();
    const conf      = Number(data.axis1Confidence) || 0;
    const entries   = Number(data.axis1Entries)    || 0;

    const axis1     = Number(data.axis1Final)      || 0;
    const axis2     = Number(data.axis2Final)      || 0;
    const soft      = Number(data.softSkillsAvg)   || 0;

    const delta     = adjusted - raw;
    const deltaStr  = delta > 0.005 ? `+${delta.toFixed(2)}` : delta < -0.005 ? delta.toFixed(2) : '—';
    const deltaColor = delta > 0.005 ? 'var(--pass)' : delta < -0.005 ? 'var(--no)' : 'var(--text3)';
    const entryColor = entries < 3 ? 'var(--flag)' : 'var(--text3)';
    const confColor  = conf >= 67 ? 'var(--pass)' : conf >= 40 ? 'var(--flag)' : conf > 0 ? 'var(--no)' : 'var(--text3)';

    const li = document.createElement('li');
    li.className = 'prospect-list-item';
    li.innerHTML = /*html*/`
        <div class="pli-rank trank ${rankClass(rank)}">${rank}</div>

        <div class="pli-player">
            <span class="player-name">${escHtml(data.candidateFullname || data.candidateUsername || 'Unnamed')}</span>
            ${data.candidateUsername && data.candidateFullname
                ? `<span class="player-tag">${escHtml(data.candidateUsername)}</span>`
                : ''}
            <span class="role role-${role}">${role}</span>
        </div>

        <div class="pli-axes">
            <div class="pli-axis-group">
                <span class="pli-axis-lbl">A1</span>
                <span class="pli-axis-val" style="color:${scoreColor(axis1)}">${axis1 > 0 ? axis1.toFixed(2) : '—'}</span>
            </div>
            <div class="pli-axis-group">
                <span class="pli-axis-lbl">A2</span>
                <span class="pli-axis-val" style="color:${scoreColor(axis2)}">${axis2 > 0 ? axis2.toFixed(2) : '—'}</span>
            </div>
            <div class="pli-axis-group">
                <span class="pli-axis-lbl">SS</span>
                <span class="pli-axis-val" style="color:${scoreColor(soft)}">${soft > 0 ? soft.toFixed(2) : '—'}</span>
            </div>
        </div>

        <div class="pli-score">
            <span class="pli-score-adj ${scoreClass(adjusted)}">${adjusted > 0 ? adjusted.toFixed(2) : '—'}</span>
            ${raw > 0 ? `
                <div class="pli-score-raw">
                    <span style="color:var(--text3)">RAW ${raw.toFixed(2)}</span>
                    <span style="color:${deltaColor};font-family:var(--f-mono)">${deltaStr}</span>
                </div>
            ` : ''}
        </div>

        <div class="pli-conf">
            ${entries > 0 ? `
                <span class="pli-conf-pct" style="color:${confColor}">${conf}%</span>
                <span class="pli-conf-games" style="color:${entryColor}">${entries}g</span>
            ` : '<span style="color:var(--text3)">—</span>'}
        </div>

        <div class="pli-decision">
            <span class="rec ${decisionClass(decision)}">${decision}</span>
        </div>

        <div class="pli-actions">
            <button class="btn btn-ghost" data-edit="${id}">EDIT</button>
            <button class="btn btn-danger" data-delete="${id}">✕</button>
        </div>
    `;

    li.querySelector('[data-edit]').addEventListener('click',   e => { e.stopPropagation(); _onEdit?.(id); });
    li.querySelector('[data-delete]').addEventListener('click', e => { e.stopPropagation(); _onDelete?.(id); });
    li.addEventListener('click', () => _onView?.(id));

    return li;
}

function _updateSpillBar(profiles) {
    const counts = { SIGN: 0, TRIAL: 0, FLAG: 0, NO: 0, PENDING: 0 };
    profiles.forEach(p => {
        const d = p.autoDecision;
        counts[d] !== undefined ? counts[d]++ : counts.PENDING++;
    });
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('statTotal',   profiles.length);
    set('statSign',    counts.SIGN);
    set('statTrial',   counts.TRIAL);
    set('statFlag',    counts.FLAG);
    set('statNo',      counts.NO);
    set('statPending', counts.PENDING);
}

function _updateRoleBar(profiles) {
    const counts = { TOP: 0, JG: 0, MID: 0, ADC: 0, SUP: 0 };
    profiles.forEach(p => {
        const role = (p.role || '').toString().trim().toUpperCase();
        if (counts[role] !== undefined) counts[role]++;
    });
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('roleTop', counts.TOP);
    set('roleJg',  counts.JG);
    set('roleMid', counts.MID);
    set('roleAdc', counts.ADC);
    set('roleSup', counts.SUP);
}

function _updateFilterCount(visible, total) {
    const el = document.getElementById('filterCount');
    if (!el) return;
    el.textContent = visible === total
        ? `${total} prospect${total !== 1 ? 's' : ''}`
        : `${visible} of ${total}`;
}

function _wireFilterButtons() {
    document.addEventListener('click', e => {
        if (!e.target.matches('[data-role]')) return;
        _activeRole = e.target.dataset.role;
        document.querySelectorAll('[data-role]').forEach(b =>
            b.classList.toggle('on', b.dataset.role === _activeRole));
        renderList();
    });

    document.addEventListener('click', e => {
        if (!e.target.matches('[data-decision]')) return;
        _activeDecision = e.target.dataset.decision;
        document.querySelectorAll('[data-decision]').forEach(b =>
            b.classList.toggle('on', b.dataset.decision === _activeDecision));
        renderList();
    });
}

function _wireSearch() {
    document.addEventListener('input', e => {
        if (e.target?.id !== 'listSearch') return;
        _searchQuery = e.target.value.trim().toLowerCase();
        renderList();
    });
}

//#endregion