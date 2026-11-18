/**
 * interviewUI.js
 * @version 1.0.0
 *
 * Page controller for the interview scheduler.
 * Owns view switching, event wiring, rendering, and auto-schedule logic.
 *
 * Imports from:
 *   - interview/interviewRepository.js  → Firestore ops
 *   - interview/interviewModel.js       → data normalization, status constants
 *   - prospect/prospectRepository.js    → fetching prospects for display
 */


//#region Imports
import {
    fetchAllInterviews,
    saveInterview,
} from '../interview/interviewRepository.js';

import {
    INTERVIEW_STATUS,
    hasAvailability,
    isTerminal,
} from '../interview/interviewModel.js';

import { fetchAllProspects } from '../prospect/prospectRepository.js';
//#endregion


//#region Constants
const WEEK = [
    { key: 'mon', label: 'Monday',    date: 'Mar 16' },
    { key: 'tue', label: 'Tuesday',   date: 'Mar 17' },
    { key: 'wed', label: 'Wednesday', date: 'Mar 18' },
    { key: 'thu', label: 'Thursday',  date: 'Mar 19' },
    { key: 'fri', label: 'Friday',    date: 'Mar 20' },
    { key: 'sat', label: 'Saturday',  date: 'Mar 21' },
    { key: 'sun', label: 'Sunday',    date: 'Mar 22' },
];

const TIME_SLOTS = [
    { key: 's1', label: '6:00' },
    { key: 's2', label: '6:45' },
    { key: 's3', label: '7:30' },
    { key: 's4', label: '8:15' },
    { key: 's5', label: '9:00' },
];

const ALL_SLOT_IDS  = WEEK.flatMap(d => TIME_SLOTS.map(t => `${d.key}_${t.key}`));
const TOTAL_SLOTS   = ALL_SLOT_IDS.length;
const ROLE_ORDER    = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
//#endregion


//#region State
let _prospects   = [];
let _activeFilter = 'ALL';
let _searchQuery  = '';
//#endregion


//#region Init

(async function init() {
    _buildLegend();
    await _loadData();
    _setTab('availability');
    _renderAll();
    _wireEvents();
})();

//#endregion


//#region Data

async function _loadData() {
    const [prospectDocs, interviewMap] = await Promise.all([
        fetchAllProspects(),
        fetchAllInterviews(),
    ]);

    prospectDocs.sort((a, b) => {
        const ra = ROLE_ORDER.indexOf((a.data.role || '').toUpperCase());
        const rb = ROLE_ORDER.indexOf((b.data.role || '').toUpperCase());
        const ra2 = ra === -1 ? 99 : ra;
        const rb2 = rb === -1 ? 99 : rb;
        if (ra2 !== rb2) return ra2 - rb2;
        return (a.data.candidateFullname || '').localeCompare(b.data.candidateFullname || '');
    });

    _prospects = prospectDocs.map(p => ({
        ...p,
        interviewData: interviewMap[p.id] ?? {
            availability:  [],
            scheduledSlot: null,
            status:        INTERVIEW_STATUS.PENDING,
        },
    }));
}

//#endregion


//#region Render

function _renderAll() {
    _updateSpillBar();
    _renderProspectList();
    _renderSchedule();
}

function _updateSpillBar() {
    const total     = _prospects.length;
    const availSet  = _prospects.filter(p => hasAvailability(p.interviewData)).length;
    const noAvail   = _prospects.filter(p => !hasAvailability(p.interviewData)).length;
    const scheduled = _prospects.filter(p => p.interviewData.status === INTERVIEW_STATUS.SCHEDULED).length;
    const done      = _prospects.filter(p => p.interviewData.status === INTERVIEW_STATUS.DONE).length;
    const noShow    = _prospects.filter(p => p.interviewData.status === INTERVIEW_STATUS.NO_SHOW).length;
    const usedSlots = _prospects.filter(p => p.interviewData.scheduledSlot).length;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set('iStatTotal',     total);
    set('iStatAvail',     availSet);
    set('iStatNoAvail',   noAvail);
    set('iStatScheduled', scheduled);
    set('iStatDone',      done);
    set('iStatNoShow',    noShow);
    set('iStatSlots',     TOTAL_SLOTS - usedSlots);
}

function _renderProspectList() {
    const container = document.getElementById('prospectAvailList');
    if (!container) return;

    const scrollMap = {};
    container.querySelectorAll('.avail-row[data-pid]').forEach(row => {
        const slotsEl = row.querySelector('.avail-slots');
        if (slotsEl) scrollMap[row.dataset.pid] = slotsEl.scrollLeft;
    });

    const filtered = _prospects.filter(p => {
        const name        = ((p.data.candidateFullname || '') + ' ' + (p.data.candidateUsername || '')).toLowerCase();
        const status      = p.interviewData.status;
        const matchSearch = _searchQuery === '' || name.includes(_searchQuery);
        const matchFilter =
            _activeFilter === 'ALL'
            || (_activeFilter === 'AVAILABLE'       && hasAvailability(p.interviewData))
            || (_activeFilter === 'NO_AVAILABILITY'  && !hasAvailability(p.interviewData))
            || (_activeFilter === 'SCHEDULED'        && status === INTERVIEW_STATUS.SCHEDULED)
            || (_activeFilter === 'UNSCHEDULED'      && status === INTERVIEW_STATUS.PENDING && hasAvailability(p.interviewData))
            || (_activeFilter === 'DONE'             && status === INTERVIEW_STATUS.DONE)
            || (_activeFilter === 'NO_SHOW'          && status === INTERVIEW_STATUS.NO_SHOW);
        return matchSearch && matchFilter;
    });

    if (filtered.length === 0) {
        container.innerHTML = '<div class="iv-loading">No prospects match the current filter.</div>';
        return;
    }

    container.innerHTML = filtered.map(p => {
        const role   = (p.data.role || 'N/A').toUpperCase();
        const status = p.interviewData.status;
        const avail  = p.interviewData.availability;
        const booked = p.interviewData.scheduledSlot;

        const statusBadge = status !== INTERVIEW_STATUS.PENDING
            ? `<span class="avail-status ${status}">${status.toUpperCase().replace('NOSHOW', 'NO-SHOW')}</span>`
            : '';

        const slots = ALL_SLOT_IDS.map(slotId => {
            let cls = '';
            if      (slotId === booked && status === INTERVIEW_STATUS.SCHEDULED) cls = 'booked';
            else if (slotId === booked && status === INTERVIEW_STATUS.DONE)      cls = 'done';
            else if (slotId === booked && status === INTERVIEW_STATUS.NO_SHOW)   cls = 'noshow';
            else if (avail.includes(slotId))                                     cls = 'available';

            const locked  = isTerminal(p.interviewData) || slotId === booked;
            const timeKey = slotId.split('_')[1];
            const time    = TIME_SLOTS.find(t => t.key === timeKey);

            return /*html*/`
                <div class="avail-slot ${cls}"
                    data-prospect="${p.id}"
                    data-slot="${slotId}"
                    ${locked ? 'data-locked="true"' : ''}
                    title="${_getSlotLabel(slotId)}">
                    <span class="avail-slot-time">${time ? time.label : ''}</span>
                </div>`;
        }).join('');

        return /*html*/`
            <div class="avail-row" data-pid="${p.id}">
                <div class="avail-prospect-info">
                    <div class="avail-name">${_escHtml(p.data.candidateFullname || p.data.candidateUsername || 'Unnamed')}</div>
                    <div class="avail-meta"><span class="role role-${role}">${role}</span></div>
                </div>
                <div class="avail-slots">${slots}</div>
                ${statusBadge}
            </div>`;
    }).join('');

    container.querySelectorAll('.avail-row[data-pid]').forEach(row => {
        const slotsEl = row.querySelector('.avail-slots');
        if (slotsEl && scrollMap[row.dataset.pid] !== undefined) {
            slotsEl.scrollLeft = scrollMap[row.dataset.pid];
        }
    });
}

function _renderSchedule() {
    const view  = document.getElementById('scheduleView');
    const empty = document.getElementById('scheduleEmpty');
    if (!view || !empty) return;

    const slotMap = {};
    _prospects.forEach(p => {
        if (p.interviewData.scheduledSlot) slotMap[p.interviewData.scheduledSlot] = p;
    });

    const availMap = {};
    ALL_SLOT_IDS.forEach(slotId => {
        availMap[slotId] = _prospects.filter(p =>
            p.interviewData.availability.includes(slotId) &&
            !p.interviewData.scheduledSlot &&
            p.interviewData.status === INTERVIEW_STATUS.PENDING
        );
    });

    const hasAnyScheduled = Object.keys(slotMap).length > 0;
    empty.classList.toggle('hidden', hasAnyScheduled);
    view.classList.toggle('hidden', !hasAnyScheduled);

    if (!hasAnyScheduled) return;

    view.innerHTML = WEEK.map(day => {
        const daySlots = TIME_SLOTS.map(time => {
            const slotId  = `${day.key}_${time.key}`;
            const booked  = slotMap[slotId];
            const waiting = availMap[slotId] || [];

            if (booked) {
                const role   = (booked.data.role || 'N/A').toUpperCase();
                const status = booked.interviewData.status;
                const statusClass = {
                    [INTERVIEW_STATUS.SCHEDULED]: 'rec-FLAG',
                    [INTERVIEW_STATUS.DONE]:      'rec-PASS',
                    [INTERVIEW_STATUS.NO_SHOW]:   'rec-NO',
                }[status] || 'rec-PENDING';

                return /*html*/`
                    <div class="schedule-slot booked">
                        <div class="schedule-slot-time">${time.label} PM</div>
                        <div class="schedule-slot-name">${_escHtml(booked.data.candidateFullname || booked.data.candidateUsername || 'Unknown')}</div>
                        <span class="role role-${role}" style="font-size:10px">${role}</span>
                        <span class="rec ${statusClass}" style="font-size:10px;margin-top:4px">${status.toUpperCase()}</span>
                        <div class="schedule-slot-actions">
                            <select class="reassign-select" data-pid="${booked.id}">
                                <option value="">Move to…</option>
                                ${ALL_SLOT_IDS.filter(s => !slotMap[s]).map(s => `<option value="${s}">${_getSlotLabel(s)}</option>`).join('')}
                            </select>
                            ${status === INTERVIEW_STATUS.SCHEDULED ? `
                                <button class="btn btn-ghost" data-action="done"        data-pid="${booked.id}" style="font-size:10px;padding:3px 8px">DONE</button>
                                <button class="btn btn-ghost" data-action="noshow"      data-pid="${booked.id}" style="font-size:10px;padding:3px 8px">NO-SHOW</button>
                                <button class="btn btn-ghost" data-action="unschedule"  data-pid="${booked.id}" style="font-size:10px;padding:3px 8px">UNSCHEDULE</button>
                            ` : ''}
                        </div>
                    </div>`;
            }

            return /*html*/`
                <div class="schedule-slot empty">
                    <div class="schedule-slot-time">${time.label} PM</div>
                    <select class="assign-select" data-slot="${slotId}">
                        <option value="">— empty —</option>
                        ${waiting.map(p => `<option value="${p.id}">${_escHtml(p.data.candidateFullname || p.data.candidateUsername || 'Unnamed')}</option>`).join('')}
                    </select>
                </div>`;
        }).join('');

        return /*html*/`
            <div class="schedule-day">
                <div class="schedule-day-header">${day.label} <span style="color:var(--text3)">${day.date}</span></div>
                ${daySlots}
            </div>`;
    }).join('');
}

//#endregion


//#region Auto-Schedule

function _onAutoScheduleClick() {
    const unscheduled = _prospects.filter(p =>
        hasAvailability(p.interviewData) &&
        !p.interviewData.scheduledSlot &&
        p.interviewData.status === INTERVIEW_STATUS.PENDING
    );

    if (unscheduled.length === 0) {
        alert('No unscheduled prospects with availability set.');
        return;
    }

    const modal = document.getElementById('autoScheduleModal');
    if (modal) {
        document.getElementById('modalCanSchedule').textContent = unscheduled.length;
        document.getElementById('modalTotalSlots').textContent  = TOTAL_SLOTS;
        modal.classList.remove('hidden');
    } else {
        _runAutoSchedule();
    }
}

async function _runAutoSchedule() {
    const pool = _prospects.filter(p =>
        hasAvailability(p.interviewData) &&
        !p.interviewData.scheduledSlot &&
        p.interviewData.status === INTERVIEW_STATUS.PENDING
    );
    if (pool.length === 0) return;

    const usedSlots = new Set(
        _prospects.filter(p => p.interviewData.scheduledSlot).map(p => p.interviewData.scheduledSlot)
    );

    const assigned = new Set();
    const saves    = [];

    for (const slotId of ALL_SLOT_IDS) {
        if (usedSlots.has(slotId)) continue;

        const candidates = pool.filter(p =>
            !assigned.has(p.id) &&
            p.interviewData.availability.includes(slotId)
        );
        if (candidates.length === 0) continue;

        candidates.sort((a, b) => {
            const ra  = ROLE_ORDER.indexOf((a.data.role || '').toUpperCase());
            const rb  = ROLE_ORDER.indexOf((b.data.role || '').toUpperCase());
            const ra2 = ra === -1 ? 99 : ra;
            const rb2 = rb === -1 ? 99 : rb;
            if (ra2 !== rb2) return ra2 - rb2;
            return (a.data.candidateFullname || '').localeCompare(b.data.candidateFullname || '');
        });

        const p = candidates[0];
        p.interviewData.scheduledSlot = slotId;
        p.interviewData.status        = INTERVIEW_STATUS.SCHEDULED;
        assigned.add(p.id);
        usedSlots.add(slotId);
        saves.push(saveInterview(p.id, p.interviewData));
    }

    await Promise.all(saves);
    _setTab('schedule');
    _renderAll();
}

async function _onClearSchedule() {
    if (!confirm('Clear all scheduled slots? Availability data will be kept.')) return;

    await Promise.all(
        _prospects
            .filter(p => p.interviewData.scheduledSlot)
            .map(p => {
                p.interviewData.scheduledSlot = null;
                p.interviewData.status        = INTERVIEW_STATUS.PENDING;
                return saveInterview(p.id, p.interviewData);
            })
    );

    _renderAll();
}

//#endregion


//#region Tab

function _setTab(name) {
    document.querySelectorAll('.iv-tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`tab${name.charAt(0).toUpperCase() + name.slice(1)}`)?.classList.remove('hidden');
    document.querySelectorAll('.iv-tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
    _renderTabActions(name);
}

function _renderTabActions(tab) {
    const container = document.getElementById('tabActions');
    if (!container) return;

    if (tab === 'availability') {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = /*html*/`
        <button class="btn btn-ghost" id="clearScheduleBtn">CLEAR SCHEDULE</button>
        <button class="btn btn-cta"   id="autoScheduleBtn">◈ AUTO-SCHEDULE</button>
    `;

    document.getElementById('autoScheduleBtn')?.addEventListener('click', _onAutoScheduleClick);
    document.getElementById('clearScheduleBtn')?.addEventListener('click', _onClearSchedule);
}

//#endregion


//#region Events

function _wireEvents() {
    // Tabs
    document.addEventListener('click', e => {
        const tab = e.target.closest('.iv-tab');
        if (tab) _setTab(tab.dataset.tab);
    });

    // Filter chips
    document.addEventListener('click', e => {
        const chip = e.target.closest('[data-ifilter]');
        if (!chip) return;
        _activeFilter = chip.dataset.ifilter;
        document.querySelectorAll('[data-ifilter]').forEach(c =>
            c.classList.toggle('on', c.dataset.ifilter === _activeFilter));
        _renderProspectList();
    });

    // Search
    document.addEventListener('input', e => {
        if (e.target?.id !== 'iSearch') return;
        _searchQuery = e.target.value.trim().toLowerCase();
        _renderProspectList();
    });

    // Availability slot toggle
    document.addEventListener('click', async e => {
        const slot = e.target.closest('.avail-slot');
        if (!slot || slot.dataset.locked) return;

        const pid    = slot.dataset.prospect;
        const slotId = slot.dataset.slot;
        const p      = _prospects.find(x => x.id === pid);
        if (!p) return;

        const avail = p.interviewData.availability;
        const idx   = avail.indexOf(slotId);
        if (idx === -1) avail.push(slotId);
        else            avail.splice(idx, 1);

        await saveInterview(pid, p.interviewData);
        _updateSpillBar();
        _renderProspectList();
    });

    // Manual assign
    document.addEventListener('change', async e => {
        const select = e.target.closest('.assign-select');
        if (!select || !select.value) return;

        const slotId = select.dataset.slot;
        const pid    = select.value;
        const p      = _prospects.find(x => x.id === pid);
        if (!p) return;

        p.interviewData.scheduledSlot = slotId;
        p.interviewData.status        = INTERVIEW_STATUS.SCHEDULED;

        await saveInterview(pid, p.interviewData);
        _renderAll();
    });

    // Reassign
    document.addEventListener('change', async e => {
        const select = e.target.closest('.reassign-select');
        if (!select || !select.value) return;

        const pid     = select.dataset.pid;
        const newSlot = select.value;
        const p       = _prospects.find(x => x.id === pid);
        if (!p) return;

        p.interviewData.scheduledSlot = newSlot;
        p.interviewData.status        = INTERVIEW_STATUS.SCHEDULED;

        await saveInterview(pid, p.interviewData);
        _renderAll();
    });

    // Schedule actions
    document.addEventListener('click', async e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const pid = btn.dataset.pid;
        const p   = _prospects.find(x => x.id === pid);
        if (!p) return;

        switch (btn.dataset.action) {
            case 'done':        p.interviewData.status = INTERVIEW_STATUS.DONE;    break;
            case 'noshow':      p.interviewData.status = INTERVIEW_STATUS.NO_SHOW; break;
            case 'unschedule':  p.interviewData.scheduledSlot = null; p.interviewData.status = INTERVIEW_STATUS.PENDING; break;
        }

        await saveInterview(pid, p.interviewData);
        _renderAll();
    });

    // Modal
    document.getElementById('modalCancelBtn')?.addEventListener('click', () =>
        document.getElementById('autoScheduleModal')?.classList.add('hidden'));

    document.getElementById('modalConfirmBtn')?.addEventListener('click', async () => {
        document.getElementById('autoScheduleModal')?.classList.add('hidden');
        await _runAutoSchedule();
    });

    // Arrow key fix for selects
    document.addEventListener('keydown', e => {
        if (!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) return;
        const active = document.activeElement;
        if (active?.classList.contains('conflict-select') ||
            active?.classList.contains('reassign-select') ||
            active?.classList.contains('assign-select')) {
            e.stopPropagation();
        }
    });
}

//#endregion


//#region Helpers

function _buildLegend() {
    const container = document.getElementById('legendSlots');
    if (!container) return;
    container.innerHTML = WEEK.map(day => /*html*/`
        <div class="legend-day-group">
            <div class="legend-day-label">${day.label} <span style="color:var(--text3);font-weight:400">${day.date}</span></div>
            <div class="legend-slots-row">
                ${TIME_SLOTS.map(t => `<div class="legend-slot">${t.label}</div>`).join('')}
            </div>
        </div>
    `).join('');
}

function _getSlotLabel(slotId) {
    const [dayKey, timeKey] = slotId.split('_');
    const day  = WEEK.find(d => d.key === dayKey);
    const time = TIME_SLOTS.find(t => t.key === timeKey);
    if (!day || !time) return slotId;
    return `${day.label} ${day.date} · ${time.label} PM EST`;
}

function _escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

//#endregion