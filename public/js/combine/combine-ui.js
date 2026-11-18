import {
    combines, activeCombine, activeLobbies, prospects, selectedPool,
    setActiveCombine,
    TRIAL_DAYS, BLOCKS, ROLES, ROLE_COLORS, LOBBIES_PER_DAY, GAMES_PER_LOBBY, PLAYERS_PER_TEAM,
    loadProspects, loadCombines, loadLobbiesForCombine,
    saveCombine, deleteCombine,
    saveLobby, updateLobby, generateLobbies,
    assignPlayerToSlot, removePlayerFromSlot, toggleBlueSide,
    autoFillLobbies, clearAllAssignments, updateLobbyCoaches,
    getAssignedProspectIds, getUnassignedPlayers, getAvailableForSlot,
    escHtml, escAttr, getRoleColor,
} from "./combine-data.js";


//#region Init

let currentView  = 'list';
let editCombineId = null;

(async function init() {
    await Promise.all([loadProspects(), loadCombines()]);
    showView('list');
    renderCombineList();
})();

//#endregion

//#region Views

function showView(name) {
    currentView = name;
    document.querySelectorAll('.combine-view').forEach(el => el.classList.add('hidden'));
    document.getElementById(`combineView_${name}`)?.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function showList() {
    await loadCombines();
    renderCombineList();
    showView('list');
}

function showCreate(combineId = null) {
    editCombineId = combineId;
    selectedPool.clear();

    if (combineId) {
        const combine = combines.find(c => c.id === combineId);
        if (combine) prefillCreateForm(combine);
    } else {
        resetCreateForm();
    }

    renderPoolSelector();
    showView('create');
}

async function showDashboard(combineId) {
    const combine = combines.find(c => c.id === combineId);
    if (!combine) return;
    setActiveCombine(combine);

    await loadLobbiesForCombine(combineId);

    if (activeLobbies.length === 0) {
        await generateLobbies(combineId);
        await loadLobbiesForCombine(combineId);
    }

    renderDashboard();
    showView('dashboard');
}

//#endregion

//#region Render — Combine List

function renderCombineList() {
    const container = document.getElementById('combineListCards');
    if (!container) return;

    if (combines.length === 0) {
        container.innerHTML = `
            <div class="combine-empty">
                <div class="combine-empty-icon">◈</div>
                <div class="combine-empty-title">No combines yet</div>
                <div class="combine-empty-sub">Create your first combine to get started</div>
            </div>`;
        return;
    }

    container.innerHTML = combines.map(combine => {
        const poolSize    = (combine.participantIds || []).length;
        const statusClass = { planning: 'rec-PENDING', live: 'rec-PASS', done: 'rec-FLAG' }[combine.status] || 'rec-PENDING';
        const statusLabel = { planning: 'PLANNING', live: 'LIVE', done: 'DONE' }[combine.status] || 'PLANNING';

        const roleCounts = ROLES.map(role => {
            const count = (combine.participantIds || []).filter(id => {
                const p = prospects.find(x => x.id === id);
                return p && (p.data.role || '').toUpperCase() === role;
            }).length;
            return `<span class="role role-${role}">${role} ${count}</span>`;
        }).join('');

        return `
            <div class="combine-card" data-combine-id="${combine.id}">
                <div class="combine-card-header">
                    <div>
                        <div class="combine-card-name">${escHtml(combine.name || 'Unnamed Combine')}</div>
                        <div class="combine-card-dates">${TRIAL_DAYS.map(d => d.short).join(' · ')}</div>
                    </div>
                    <span class="rec ${statusClass}">${statusLabel}</span>
                </div>
                <div class="combine-card-stats">
                    <div class="combine-stat"><div class="combine-stat-val">${poolSize}</div><div class="combine-stat-lbl">Players</div></div>
                    <div class="combine-stat"><div class="combine-stat-val">32</div><div class="combine-stat-lbl">Lobbies</div></div>
                    <div class="combine-stat"><div class="combine-stat-val">${poolSize > 0 ? Math.floor(poolSize / 10) : 0}</div><div class="combine-stat-lbl">Full Lobbies</div></div>
                </div>
                <div class="combine-card-roles">${roleCounts}</div>
                <div class="combine-card-actions">
                    <button class="btn btn-ghost" data-edit-combine="${combine.id}">EDIT</button>
                    <button class="btn btn-danger" data-delete-combine="${combine.id}">DELETE</button>
                    <button class="btn btn-cta" data-open-combine="${combine.id}">◈ OPEN DASHBOARD</button>
                </div>
            </div>`;
    }).join('');
}

//#endregion

//#region Render — Create Form

function resetCreateForm() {
    document.getElementById('createCombineForm')?.reset();
    selectedPool.clear();
}

function prefillCreateForm(combine) {
    const set = (name, val) => {
        const el = document.querySelector(`[name="${name}"]`);
        if (el && val !== undefined) el.value = val;
    };
    set('combineName', combine.name);
    combine.participantIds?.forEach(id => selectedPool.add(id));
}

function renderPoolSelector() {
    const container = document.getElementById('poolSelectorRows');
    if (!container) return;

    updatePoolStats();

    const byRole = {};
    ROLES.forEach(r => { byRole[r] = []; });
    prospects.forEach(p => {
        const role = (p.data.role || '').toUpperCase();
        if (byRole[role]) byRole[role].push(p);
    });

    container.innerHTML = ROLES.flatMap(role => {
        const group = byRole[role];
        if (!group.length) return [];

        const header = `
            <div class="pool-role-header">
                <span class="role role-${role}">${role}</span>
                <span class="pool-role-count">${group.length} prospects</span>
                <button class="btn btn-ghost pool-select-role-btn" data-role="${role}" style="font-size:10px;padding:4px 10px">
                    ${group.every(p => selectedPool.has(p.id)) ? 'DESELECT ALL' : 'SELECT ALL'}
                </button>
            </div>`;

        const rows = group.map(p => {
            const checked = selectedPool.has(p.id);
            return `
                <div class="pool-player-row ${checked ? 'selected' : ''}" data-pool-pid="${p.id}">
                    <div class="pool-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
                    <span class="pool-player-name">${escHtml(p.data.candidateUsername || p.data.candidateFullname || 'Unnamed')}</span>
                    <span class="pool-player-tag">#${escHtml(p.data.candidateUsername || '')}</span>
                    <span class="role role-${role}" style="font-size:10px;padding:2px 6px">${role}</span>
                    ${p.data.currentRank ? `<span class="pool-player-rank">${escHtml(p.data.currentRank)}</span>` : ''}
                </div>`;
        }).join('');

        return [header, rows];
    }).join('');
}

function updatePoolStats() {
    const el = document.getElementById('poolSelectedCount');
    if (el) el.textContent = selectedPool.size;

    const byRole = {};
    ROLES.forEach(r => { byRole[r] = 0; });
    selectedPool.forEach(id => {
        const p = prospects.find(x => x.id === id);
        if (p) {
            const role = (p.data.role || '').toUpperCase();
            if (byRole[role] !== undefined) byRole[role]++;
        }
    });

    ROLES.forEach(role => {
        const el = document.getElementById(`poolCount_${role}`);
        if (el) el.textContent = byRole[role];
    });
}

//#endregion

//#region Render — Dashboard

function renderDashboard() {
    if (!activeCombine) return;

    const nameEl = document.getElementById('dashCombineName');
    if (nameEl) nameEl.textContent = activeCombine.name || 'Combine Dashboard';

    const statsEl = document.getElementById('dashCombineStats');
    if (statsEl) {
        const poolSize   = (activeCombine.participantIds || []).length;
        const assigned   = getAssignedProspectIds().size;
        const unassigned = poolSize - assigned;
        statsEl.innerHTML = `
            <div class="dash-stat"><div class="dash-stat-val">${poolSize}</div><div class="dash-stat-lbl">Pool</div></div>
            <div class="dash-stat"><div class="dash-stat-val" style="color:var(--accent)">${assigned}</div><div class="dash-stat-lbl">Assigned</div></div>
            <div class="dash-stat"><div class="dash-stat-val" style="color:var(--flag)">${unassigned}</div><div class="dash-stat-lbl">Unassigned</div></div>
            <div class="dash-stat"><div class="dash-stat-val">${activeLobbies.length}</div><div class="dash-stat-lbl">Lobbies</div></div>`;
    }

    renderLobbyPlanner();
}

function renderLobbyPlanner() {
    const container = document.getElementById('lobbyPlannerDays');
    if (!container) return;

    const allSlots = BLOCKS.flatMap(b => b.slots);

    container.innerHTML = TRIAL_DAYS.map((day, dayIndex) => {
        const dayLobbies = activeLobbies.filter(l => l.dayKey === day.key);

        const blocksHtml = BLOCKS.map(block => {
            const slotsHtml = block.slots.map(slot => {
                const slotLobbies = slot.lobbies.map(localNum => {
                    const globalNum = dayIndex * LOBBIES_PER_DAY + allSlots.indexOf(slot) * 2 + slot.lobbies.indexOf(localNum) + 1;
                    return dayLobbies.find(l => l.lobbyNumber === globalNum);
                }).filter(Boolean);

                return `
                    <div class="planner-slot">
                        <div class="planner-slot-time">${slot.label}</div>
                        <div class="planner-lobbies-row">
                            ${slotLobbies.map(l => renderLobbyCard(l)).join('')}
                        </div>
                    </div>`;
            }).join('');

            return `
                <div class="planner-block">
                    <div class="planner-block-label">${block.label}</div>
                    ${slotsHtml}
                </div>`;
        }).join('');

        const assignedInDay = dayLobbies.reduce((sum, l) => {
            return sum +
                (l.team1 || []).filter(s => s.prospectId).length +
                (l.team2 || []).filter(s => s.prospectId).length;
        }, 0);

        return `
            <div class="planner-day" id="day_${day.key}">
                <div class="planner-day-header">
                    <div>
                        <div class="planner-day-name">${day.label} — ${day.date}</div>
                        <div class="planner-day-meta">Block 1: 4:00 / 4:30 PM &nbsp;·&nbsp; Break &nbsp;·&nbsp; Block 2: 8:00 / 9:30 PM</div>
                    </div>
                    <div class="planner-day-progress">${assignedInDay} / ${LOBBIES_PER_DAY * PLAYERS_PER_TEAM * 2} players assigned</div>
                </div>
                <div class="planner-blocks-row">${blocksHtml}</div>
            </div>`;
    }).join('');
}

function renderLobbyCard(lobby) {
    if (!lobby) return '';

    const statusClass = { planned: 'rec-PENDING', live: 'rec-PASS', sealed: 'rec-FLAG' }[lobby.status] || 'rec-PENDING';
    const statusLabel = { planned: 'PLANNED', live: 'LIVE', sealed: 'SEALED' }[lobby.status] || 'PLANNED';
    const blueTeam    = `Team ${lobby.blueStartTeam || 1}`;
    const redTeam     = `Team ${lobby.blueStartTeam === 2 ? 1 : 2}`;
    const filled1     = (lobby.team1 || []).filter(s => s.prospectId).length;
    const filled2     = (lobby.team2 || []).filter(s => s.prospectId).length;

    return `
        <div class="lobby-card" id="lobby_${lobby.id}">
            <div class="lobby-card-header">
                <span class="lobby-id">${lobby.lobbyLabel}</span>
                <div style="display:flex;align-items:center;gap:6px">
                    <button class="blue-side-toggle" data-lobby-id="${lobby.id}" title="Click to swap blue side">
                        <span class="side-dot blue-dot"></span>
                        <span style="font-size:9px;color:var(--sup)">${blueTeam} blue G1</span>
                    </button>
                    <span class="rec ${statusClass}" style="font-size:10px;padding:3px 8px">${statusLabel}</span>
                </div>
            </div>
            <div class="lobby-teams-grid">
                <div class="lobby-team">
                    <div class="lobby-team-label">
                        TEAM 1
                        <span class="side-indicator ${lobby.blueStartTeam === 1 ? 'blue-side' : 'red-side'}">
                            ${lobby.blueStartTeam === 1 ? '🔵' : '🔴'} G1
                        </span>
                    </div>
                    ${(lobby.team1 || []).map(slot => renderPlayerSlot(lobby.id, 'team1', slot)).join('')}
                    <div class="lobby-team-count">${filled1}/${PLAYERS_PER_TEAM}</div>
                </div>
                <div class="lobby-team-divider"></div>
                <div class="lobby-team">
                    <div class="lobby-team-label">
                        TEAM 2
                        <span class="side-indicator ${lobby.blueStartTeam === 2 ? 'blue-side' : 'red-side'}">
                            ${lobby.blueStartTeam === 2 ? '🔵' : '🔴'} G1
                        </span>
                    </div>
                    ${(lobby.team2 || []).map(slot => renderPlayerSlot(lobby.id, 'team2', slot)).join('')}
                    <div class="lobby-team-count">${filled2}/${PLAYERS_PER_TEAM}</div>
                </div>
            </div>
            <div class="lobby-card-footer">
                <span class="lobby-coach-lbl">Coach:</span>
                <input class="lobby-coach-input" type="text"
                    placeholder="Assign coach…"
                    value="${escAttr((lobby.coaches || []).join(', '))}"
                    data-lobby-id="${lobby.id}">
            </div>
        </div>`;
}

function renderPlayerSlot(lobbyId, team, slot) {
    const prospect  = slot.prospectId ? prospects.find(p => p.id === slot.prospectId) : null;
    const roleColor = getRoleColor(slot.role);

    if (prospect) {
        const name = escHtml(prospect.data.candidateUsername || prospect.data.candidateFullname || 'Unknown');
        return `
            <div class="player-slot filled" data-lobby-id="${lobbyId}" data-team="${team}" data-role="${slot.role}">
                <span class="player-slot-role" style="color:${roleColor}">${slot.role}</span>
                <span class="player-slot-name">${name}</span>
                <button class="player-slot-remove" data-lobby-id="${lobbyId}" data-team="${team}" data-role="${slot.role}">✕</button>
            </div>`;
    }

    const available = getAvailableForSlot(lobbyId, slot.role);
    const options   = available.map(p => {
        const n = escHtml(p.data.candidateUsername || p.data.candidateFullname || 'Unnamed');
        return `<option value="${p.id}">${n}</option>`;
    }).join('');

    return `
        <div class="player-slot empty">
            <span class="player-slot-role" style="color:${roleColor}">${slot.role}</span>
            <select class="player-slot-select" data-lobby-id="${lobbyId}" data-team="${team}" data-role="${slot.role}">
                <option value="">— assign —</option>
                ${options}
            </select>
        </div>`;
}

//#endregion

//#region Events

document.addEventListener('click', async e => {

    if (e.target.matches('#newCombineBtn'))    { showCreate(); return; }
    if (e.target.matches('#cancelCreateBtn') ||
        e.target.matches('#backToListBtn'))    { await showList(); return; }
    if (e.target.matches('#dashBackBtn'))      { await showList(); return; }

    if (e.target.matches('#poolSelectAllBtn')) {
        prospects.forEach(p => selectedPool.add(p.id));
        renderPoolSelector(); return;
    }

    if (e.target.matches('#poolClearBtn')) {
        selectedPool.clear();
        renderPoolSelector(); return;
    }

    const openBtn = e.target.closest('[data-open-combine]');
    if (openBtn) { await showDashboard(openBtn.dataset.openCombine); return; }

    const editBtn = e.target.closest('[data-edit-combine]');
    if (editBtn) { showCreate(editBtn.dataset.editCombine); return; }

    const delBtn = e.target.closest('[data-delete-combine]');
    if (delBtn) {
        if (!confirm('Delete this combine and all its lobbies? This cannot be undone.')) return;
        await deleteCombine(delBtn.dataset.deleteCombine);
        await showList(); return;
    }

    const roleBtn = e.target.closest('.pool-select-role-btn');
    if (roleBtn) {
        const role      = roleBtn.dataset.role;
        const inRole    = prospects.filter(p => (p.data.role || '').toUpperCase() === role);
        const allSel    = inRole.every(p => selectedPool.has(p.id));
        inRole.forEach(p => allSel ? selectedPool.delete(p.id) : selectedPool.add(p.id));
        renderPoolSelector(); return;
    }

    const poolRow = e.target.closest('[data-pool-pid]');
    if (poolRow) {
        const pid = poolRow.dataset.poolPid;
        selectedPool.has(pid) ? selectedPool.delete(pid) : selectedPool.add(pid);
        renderPoolSelector(); return;
    }

    const removeBtn = e.target.closest('.player-slot-remove');
    if (removeBtn) {
        const { lobbyId, team, role } = removeBtn.dataset;
        await removePlayerFromSlot(lobbyId, team, role);
        renderLobbyPlanner(); return;
    }

    const blueToggle = e.target.closest('.blue-side-toggle');
    if (blueToggle) {
        await toggleBlueSide(blueToggle.dataset.lobbyId);
        renderLobbyPlanner(); return;
    }

    if (e.target.matches('#autoFillBtn')) {
        if (!confirm('Auto-fill will assign unassigned pool players to empty slots by role. Continue?')) return;
        await autoFillLobbies();
        renderDashboard(); return;
    }

    if (e.target.matches('#clearAssignmentsBtn')) {
        if (!confirm('Clear all player assignments? This cannot be undone.')) return;
        await clearAllAssignments();
        renderDashboard(); return;
    }
});

document.addEventListener('change', async e => {
    const slotSelect = e.target.closest('.player-slot-select');
    if (slotSelect && slotSelect.value) {
        const { lobbyId, team, role } = slotSelect.dataset;
        await assignPlayerToSlot(lobbyId, team, role, slotSelect.value);
        renderLobbyPlanner(); return;
    }
});

document.addEventListener('focusout', async e => {
    const coachInput = e.target.closest('.lobby-coach-input');
    if (!coachInput) return;
    await updateLobbyCoaches(coachInput.dataset.lobbyId, coachInput.value);
});

document.addEventListener('submit', async e => {
    if (!e.target.matches('#createCombineForm')) return;
    e.preventDefault();

    const name = document.querySelector('[name="combineName"]')?.value?.trim();
    if (!name)                  { alert('Please enter a combine name.'); return; }
    if (selectedPool.size === 0) { alert('Please select at least one participant.'); return; }

    const saveBtn = document.getElementById('saveCombineBtn');
    if (saveBtn) { saveBtn.textContent = 'Saving…'; saveBtn.disabled = true; }

    try {
        const combineId = await saveCombine({
            name,
            trialDays:      TRIAL_DAYS.map(d => d.key),
            participantIds: [...selectedPool],
            gamesPerLobby:  GAMES_PER_LOBBY,
            lobbiesPerDay:  LOBBIES_PER_DAY,
        }, editCombineId);

        await loadCombines();
        await showDashboard(combineId);
    } catch (err) {
        console.error('Save combine failed:', err);
        alert('Save failed — ' + err.message);
    } finally {
        if (saveBtn) { saveBtn.textContent = '◈ CREATE & OPEN DASHBOARD'; saveBtn.disabled = false; }
    }
});

//#endregion