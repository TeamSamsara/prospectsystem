/**
 * prospectForm.js
 * @version 1.3.0
 *
 * Changes from 1.2.1:
 *   - initProspectForm now accepts allProspects for opponent dropdown
 *   - addCombineRow: opponent column is now a dropdown filtered by role
 *     showing only prospects with rawScore > 0 and 3+ entries
 *   - opponentId stored via select value, collected in collectProspectData
 */


//#region Imports
import { populateForm, collectForm } from '/js/form/form.js';
import { escAttr, escHtml          } from '/js/renderer.js';
import { openNoteModal             } from '/js/noteModal.js';
import {
    createEmptyChampionInput,
    createEmptyCombineInput,
} from '/js/prospect/prospectModel.js';
//#endregion


//#region State
let _form         = null;
let _championBody = null;
let _combineBody  = null;
let _onDirty      = null;
let _allProspects = [];
let _profileRole  = '';
//#endregion


//#region Public API

export function initProspectForm({ form, championBody, combineBody, onDirty, allProspects = [], profileRole = '' }) {
    _form         = form;
    _championBody = championBody;
    _combineBody  = combineBody;
    _onDirty      = onDirty;
    _allProspects = allProspects;
    _profileRole  = (profileRole || '').toUpperCase();
}

export function populateProspectForm(prospect) {
    _profileRole = (prospect.role || '').toUpperCase();
    populateForm(_form, prospect);
    prospect.champion?.forEach(c  => addChampionRow(c));
    prospect.combineLog?.forEach(r => addCombineRow(r));
}

export function collectProspectData() {
    const data = collectForm(_form);

    data.champion = [];
    _championBody.querySelectorAll('tr').forEach(tr => {
        const row = {};
        tr.querySelectorAll('input[name], textarea[name]').forEach(el => {
            if (el.name) row[el.name] = el.value;
        });
        if (row.champion) data.champion.push(row);
    });

    data.combineLog = [];
    _combineBody.querySelectorAll('tr').forEach(tr => {
        const row = {};
        tr.querySelectorAll('input[name], textarea[name]').forEach(el => {
            if (el.name) row[el.name] = el.value;
        });
        // Collect opponentId from the select
        const oppSelect = tr.querySelector('[name="opponentSelect"]');
        if (oppSelect) {
            row.opponentId = oppSelect.value || '';
            const selectedOpt = oppSelect.options[oppSelect.selectedIndex];
            row.opponent = oppSelect.value ? (selectedOpt?.dataset.name || '') : '';
        }
        data.combineLog.push(row);
    });

    return data;
}

export function addChampionRow(data = createEmptyChampionInput()) {
    const tr = document.createElement('tr');
    tr.innerHTML = /*html*/`
        <td><input type="text"   name="champion"  placeholder="e.g. Jayce" value="${escAttr(data.champion  || '')}"></td>
        <td><input type="number" name="games"     placeholder="0"          value="${escAttr(data.games     || '')}" style="width:60px"></td>
        <td><input type="number" name="wins"      placeholder="0"          value="${escAttr(data.wins      || '')}" style="width:60px"></td>
        <td><input type="number" name="losses"    placeholder="0"          value="${escAttr(data.losses    || '')}" style="width:60px"></td>
        <td><input type="text"   name="winRate"   value="${escAttr(data.winRate || '—')}" readonly style="width:70px;font-family:var(--f-mono)"></td>
        <td><input type="text"   name="kda"       placeholder="KDA"        value="${escAttr(data.kda       || '')}"></td>
        <td><input type="text"   name="csPerMin"  placeholder="CS/min"     value="${escAttr(data.csPerMin  || '')}"></td>
        <td><input type="text"   name="gdAt15"    placeholder="+/-"        value="${escAttr(data.gdAt15    || '')}" style="width:60px"></td>
        <td><input type="text"   name="lobby"     placeholder="L-01"       value="${escAttr(data.lobby     || '')}" style="width:60px"></td>
        <td><input type="text"   name="opponent"  placeholder="vs. who?"   value="${escAttr(data.opponent  || '')}"></td>
        <td>
            <input type="hidden" name="notes" value="${escAttr(data.notes || '')}">
            <div class="note-cell note-trigger">
                <span class="note-cell-text ${data.notes ? '' : 'empty'}">${data.notes ? escHtml(data.notes) : 'No note'}</span>
                <span class="note-cell-edit">EDIT</span>
            </div>
        </td>
        <td><button type="button" class="btn btn-danger row-del-btn">✕</button></td>
    `;

    const winsEl   = tr.querySelector('[name="wins"]');
    const lossesEl = tr.querySelector('[name="losses"]');
    const wrEl     = tr.querySelector('[name="winRate"]');

    const updateWinRate = () => {
        const w = Number(winsEl.value)   || 0;
        const l = Number(lossesEl.value) || 0;
        wrEl.value = (w + l === 0) ? '—' : `${Math.round((w / (w + l)) * 100)}%`;
    };

    winsEl.addEventListener('input',   updateWinRate);
    lossesEl.addEventListener('input', updateWinRate);
    if (data.wins || data.losses) updateWinRate();

    tr.querySelector('.note-trigger').addEventListener('click', () => {
        const hiddenInput = tr.querySelector('[name="notes"]');
        const textEl      = tr.querySelector('.note-cell-text');
        openNoteModal({
            title:   `${tr.querySelector('[name="champion"]')?.value || 'Champion'} — Notes`,
            content: hiddenInput.value,
            onSave: val => {
                hiddenInput.value = val;
                textEl.textContent = val || 'No note';
                textEl.classList.toggle('empty', !val);
                _onDirty?.();
            },
        });
    });

    tr.querySelector('.row-del-btn').addEventListener('click', () => {
        tr.remove();
        _onDirty?.();
    });

    _championBody.appendChild(tr);
}

export function addCombineRow(data = createEmptyCombineInput()) {
    const tr = document.createElement('tr');
    const opponentOptions = _buildOpponentOptions(data.opponentId || '');

    tr.innerHTML = /*html*/`
        <td><input type="text"   name="lobby"          placeholder="L-01"  value="${escAttr(data.lobby          || '')}" style="width:64px"></td>
        <td><input type="number" name="gameNum"        placeholder="1"     value="${escAttr(data.gameNum        || '')}" style="width:56px"></td>
        <td><input type="text"   name="championPlayed" placeholder="Champ" value="${escAttr(data.championPlayed || '')}"></td>
        <td><input type="number" name="axis1"          placeholder="1-4"   value="${escAttr(data.axis1          || '')}" min="1" max="4" step="0.25" style="width:70px;font-family:var(--f-mono)"></td>
        <td><input type="number" name="axis2"          placeholder="1-4"   value="${escAttr(data.axis2          || '')}" min="1" max="4" step="0.25" style="width:70px;font-family:var(--f-mono)"></td>
        <td>
            <select name="opponentSelect" class="field-select opponent-select" style="min-width:130px;font-size:12px">
                ${opponentOptions}
            </select>
        </td>
        <td><input type="text"   name="coach"          placeholder="Coach" value="${escAttr(data.coach          || '')}"></td>
        <td>
            <input type="hidden" name="coachNotes" value="${escAttr(data.coachNotes || '')}">
            <div class="note-cell note-trigger">
                <span class="note-cell-text ${data.coachNotes ? '' : 'empty'}">${data.coachNotes ? escHtml(data.coachNotes) : 'No note'}</span>
                <span class="note-cell-edit">EDIT</span>
            </div>
        </td>
        <td><button type="button" class="btn btn-danger row-del-btn">✕</button></td>
    `;

    tr.querySelector('.note-trigger').addEventListener('click', () => {
        const hiddenInput = tr.querySelector('[name="coachNotes"]');
        const textEl      = tr.querySelector('.note-cell-text');
        openNoteModal({
            title:   `${tr.querySelector('[name="championPlayed"]')?.value || 'Entry'} — Coach Notes`,
            content: hiddenInput.value,
            onSave: val => {
                hiddenInput.value = val;
                textEl.textContent = val || 'No note';
                textEl.classList.toggle('empty', !val);
                _onDirty?.();
            },
        });
    });

    tr.querySelector('[name="opponentSelect"]').addEventListener('change', () => _onDirty?.());

    tr.querySelector('.row-del-btn').addEventListener('click', () => {
        tr.remove();
        _onDirty?.();
    });

    _combineBody.appendChild(tr);
}

//#endregion


//#region Private

function _buildOpponentOptions(selectedId) {
    const SOS_MIN_ENTRIES = 3;

    const eligible = _allProspects.filter(p => {
        const role    = (p.data?.role || '').toUpperCase();
        const score   = Number(p.data?.rawScore || p.data?.overallScore) || 0;
        const entries = (p.data?.combineLog || []).filter(r => Number(r.axis1) > 0).length;
        return role === _profileRole && score > 0 && entries >= SOS_MIN_ENTRIES;
    });

    const none = `<option value="">— No opponent —</option>`;
    if (!eligible.length) return none;

    const options = eligible.map(p => {
        const name     = p.data?.candidateUsername || p.data?.candidateFullname || 'Unnamed';
        const score    = Number(p.data?.rawScore || p.data?.overallScore || 0).toFixed(2);
        const selected = p.id === selectedId ? ' selected' : '';
        return `<option value="${escAttr(p.id)}" data-name="${escAttr(name)}"${selected}>${escHtml(name)} (${score})</option>`;
    }).join('');

    return none + options;
}

//#endregion