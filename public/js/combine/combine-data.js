import {
    db,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    setDoc,
    serverTimestamp
} from "../firestore.js";

//#region Constants

export const TRIAL_DAYS = [
    { key: 'apr4',  label: 'Trial Day 1', date: 'April 4',  short: 'Apr 4'  },
    { key: 'apr5',  label: 'Trial Day 2', date: 'April 5',  short: 'Apr 5'  },
    { key: 'apr11', label: 'Trial Day 3', date: 'April 11', short: 'Apr 11' },
    { key: 'apr12', label: 'Trial Day 4', date: 'April 12', short: 'Apr 12' }
];

export const BLOCKS = [
    {
        key: 'block1', label: 'Block 1',
        slots: [
            { key: 'b1s1', label: '4:00 PM', lobbies: [1, 2] },
            { key: 'b1s2', label: '4:30 PM', lobbies: [3, 4] },
        ]
    },
    {
        key: 'block2', label: 'Block 2',
        slots: [
            { key: 'b2s1', label: '8:00 PM', lobbies: [5, 6] },
            { key: 'b2s2', label: '9:30 PM', lobbies: [7, 8] },
        ]
    },
];

export const ROLES            = ['TOP', 'JG', 'MID', 'ADC', 'SUP'];
export const LOBBIES_PER_DAY  = 8;
export const GAMES_PER_LOBBY  = 2;
export const PLAYERS_PER_TEAM = 5;

export const ROLE_COLORS = {
    TOP: 'var(--top)',
    JG:  'var(--jg)',
    MID: 'var(--mid)',
    ADC: 'var(--adc)',
    SUP: 'var(--sup)',
};

//#endregion

//#region STATE

export let combines      = [];
export let activeCombine = null;
export let activeLobbies = [];
export let prospects     = [];
export let selectedPool  = new Set();

export function setActiveCombine(c) { activeCombine = c; }
export function setActiveLobbies(l) { activeLobbies = l; }
export function setCombines(list)   { combines = list; }
export function setProspects(list)  { prospects = list; }

//#endregion

//#region Prospects

export async function loadProspects() {
    const snap = await getDocs(collection(db, 'prospects'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, data: d.data() }));
    list.sort((a, b) => {
        const ra = ROLES.indexOf((a.data.role || '').toUpperCase());
        const rb = ROLES.indexOf((b.data.role || '').toUpperCase());
        const ra2 = ra === -1 ? 99 : ra;
        const rb2 = rb === -1 ? 99 : rb;
        if (ra2 !== rb2) return ra2 - rb2;
        return (a.data.candidateFullname || '').localeCompare(b.data.candidateFullname || '');
    });
    setProspects(list);
}

//#endregion

//#region Combines

export async function loadCombines() {
    const snap = await getDocs(collection(db, 'combines'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setCombines(list);
}

export async function saveCombine(data, editId = null) {
    if (editId) {
        await updateDoc(doc(db, 'combines', editId), data);
        return editId;
    }
    const ref = await addDoc(collection(db, 'combines'), {
        ...data,
        status:    'planning',
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function deleteCombine(combineId) {
    const snap = await getDocs(collection(db, 'combineLobbies'));
    const deletions = [];
    snap.forEach(d => {
        if (d.data().combineId === combineId) {
            deletions.push(deleteDoc(doc(db, 'combineLobbies', d.id)));
        }
    });
    await Promise.all(deletions);
    await deleteDoc(doc(db, 'combines', combineId));
}

//#endregion

//#region Lobbies

export async function loadLobbiesForCombine(combineId) {
    const snap = await getDocs(collection(db, 'combineLobbies'));
    const list = [];
    snap.forEach(d => {
        if (d.data().combineId === combineId) list.push({ id: d.id, ...d.data() });
    });
    list.sort((a, b) => a.dayIndex !== b.dayIndex
        ? a.dayIndex - b.dayIndex
        : a.lobbyNumber - b.lobbyNumber
    );
    setActiveLobbies(list);
}

export async function saveLobby(lobbyData) {
    if (lobbyData.id) {
        const { id, ...data } = lobbyData;
        await setDoc(doc(db, 'combineLobbies', id), data);
    } else {
        const ref = await addDoc(collection(db, 'combineLobbies'), lobbyData);
        lobbyData.id = ref.id;
    }
}

export async function updateLobby(lobbyId, updates) {
    const lobby = activeLobbies.find(l => l.id === lobbyId);
    if (!lobby) return;
    Object.assign(lobby, updates);
    const { id, ...data } = lobby;
    await setDoc(doc(db, 'combineLobbies', lobbyId), data);
}

export async function generateLobbies(combineId) {
    const allSlots = BLOCKS.flatMap(b => b.slots);
    const saves    = [];

    TRIAL_DAYS.forEach((day, dayIndex) => {
        allSlots.forEach((slot, slotIndex) => {
            const block = BLOCKS.find(b => b.slots.includes(slot));
            slot.lobbies.forEach((localNum, localIndex) => {
                const globalNum = dayIndex * LOBBIES_PER_DAY + slotIndex * 2 + localIndex + 1;
                saves.push(saveLobby({
                    combineId,
                    dayKey:        day.key,
                    dayIndex,
                    dayLabel:      day.label,
                    dayDate:       day.date,
                    blockKey:      block.key,
                    blockLabel:    block.label,
                    slotKey:       slot.key,
                    timeLabel:     slot.label,
                    lobbyNumber:   globalNum,
                    lobbyLabel:    `L-${String(globalNum).padStart(2, '0')}`,
                    gamesPerLobby: GAMES_PER_LOBBY,
                    blueStartTeam: 1,
                    team1:         ROLES.map(role => ({ role, prospectId: null })),
                    team2:         ROLES.map(role => ({ role, prospectId: null })),
                    coaches:       [],
                    status:        'planned',
                }));
            });
        });
    });

    await Promise.all(saves);
}

//#endregion

//#region Lobby Builder

export function getAssignedProspectIds() {
    const assigned = new Set();
    activeLobbies.forEach(lobby => {
        [...(lobby.team1 || []), ...(lobby.team2 || [])].forEach(slot => {
            if (slot.prospectId) assigned.add(slot.prospectId);
        });
    });
    return assigned;
}

export function getUnassignedPlayers() {
    const assigned = getAssignedProspectIds();
    return prospects.filter(p =>
        (activeCombine?.participantIds || []).includes(p.id) && !assigned.has(p.id)
    );
}

export function getAvailableForSlot(lobbyId, role) {
    const assigned    = getAssignedProspectIds();
    const lobby       = activeLobbies.find(l => l.id === lobbyId);
    const inThisLobby = new Set();
    if (lobby) {
        [...(lobby.team1 || []), ...(lobby.team2 || [])].forEach(s => {
            if (s.prospectId) inThisLobby.add(s.prospectId);
        });
    }
    return prospects.filter(p =>
        (activeCombine?.participantIds || []).includes(p.id) &&
        (p.data.role || '').toUpperCase() === role.toUpperCase() &&
        !assigned.has(p.id)
    );
}

export async function assignPlayerToSlot(lobbyId, team, role, prospectId) {
    const lobby   = activeLobbies.find(l => l.id === lobbyId);
    if (!lobby) return;
    const teamArr = team === 'team1' ? lobby.team1 : lobby.team2;
    const slot    = teamArr.find(s => s.role === role);
    if (!slot) return;
    slot.prospectId = prospectId || null;
    await updateLobby(lobbyId, { [team]: teamArr });
}

export async function removePlayerFromSlot(lobbyId, team, role) {
    await assignPlayerToSlot(lobbyId, team, role, null);
}

export async function toggleBlueSide(lobbyId) {
    const lobby = activeLobbies.find(l => l.id === lobbyId);
    if (!lobby) return;
    await updateLobby(lobbyId, { blueStartTeam: lobby.blueStartTeam === 1 ? 2 : 1 });
}

export async function autoFillLobbies() {
    const participantIds = activeCombine?.participantIds || [];
    const poolPlayers = prospects.filter(p => participantIds.includes(p.id));
    const saves = [];

    // Pre-calculate total games once to avoid repeating it inside loops
    const playerStats = new Map(poolPlayers.map(p => [p.id, { 
        totalGames: 0,
        dailyGames: {} // e.g. { 'apr4': 1, 'apr5': 0 }
    }]));

    // Fill the stats Map based on current assignments
    activeLobbies.forEach(l => {
        [...(l.team1 || []), ...(l.team2 || [])].forEach(s => {
            if (s.prospectId && playerStats.has(s.prospectId)) {
                const stats = playerStats.get(s.prospectId);
                stats.totalGames++;
                stats.dailyGames[l.dayKey] = (stats.dailyGames[l.dayKey] || 0) + 1;
            }
        });
    });

    for (const lobby of activeLobbies) {
        let lobbyChanged = false;
        const currentDayIdx = TRIAL_DAYS.findIndex(d => d.key === lobby.dayKey);
        const prevDayKey = currentDayIdx > 0 ? TRIAL_DAYS[currentDayIdx - 1].key : null;

        // Process all empty slots in this lobby at once
        const teams = ['team1', 'team2'];
        for (const teamKey of teams) {
            for (const slot of lobby[teamKey]) {
                if (slot.prospectId) continue;

                // 1. Filter candidates using pre-calculated stats
                const candidates = poolPlayers.filter(p => {
                    const stats = playerStats.get(p.id);
                    const isRole = (p.data.role || '').toUpperCase() === slot.role;
                    if (!isRole) return false;

                    const inThisLobby = [...lobby.team1, ...lobby.team2].some(s => s.prospectId === p.id);
                    if (inThisLobby) return false;

                    const todayCount = stats.dailyGames[lobby.dayKey] || 0;
                    if (todayCount >= 2) return false;

                    const yesterdayCount = prevDayKey ? (stats.dailyGames[prevDayKey] || 0) : 0;
                    if (yesterdayCount >= 2) return false;

                    return true;
                });

                // 2. Sort and Assign
                if (candidates.length > 0) {
                    candidates.sort((a, b) => {
                        const sA = playerStats.get(a.id);
                        const sB = playerStats.get(b.id);
                        
                        if (prevDayKey) {
                            const aPrev = sA.dailyGames[prevDayKey] || 0;
                            const bPrev = sB.dailyGames[prevDayKey] || 0;
                            if (aPrev === 1 && bPrev !== 1) return -1;
                            if (bPrev === 1 && aPrev !== 1) return 1;
                        }
                        return sA.totalGames - sB.totalGames;
                    });

                    const best = candidates[0];
                    slot.prospectId = best.id;
                    
                    // 3. Update local stats immediately so the NEXT slot knows this player is busy
                    const bStats = playerStats.get(best.id);
                    bStats.totalGames++;
                    bStats.dailyGames[lobby.dayKey] = (bStats.dailyGames[lobby.dayKey] || 0) + 1;
                    
                    lobbyChanged = true;
                }
            }
        }

        if (lobbyChanged) {
            saves.push(updateLobby(lobby.id, { team1: lobby.team1, team2: lobby.team2 }));
        }
    }

    await Promise.all(saves);
    alert("Optimized Auto-Fill Complete!");
}

export async function clearAllAssignments() {
    const saves = activeLobbies.map(lobby => {
        lobby.team1 = ROLES.map(r => ({ role: r, prospectId: null }));
        lobby.team2 = ROLES.map(r => ({ role: r, prospectId: null }));
        return updateLobby(lobby.id, { team1: lobby.team1, team2: lobby.team2 });
    });
    await Promise.all(saves);
}

export async function updateLobbyCoaches(lobbyId, coachString) {
    const coaches = coachString.split(',').map(s => s.trim()).filter(Boolean);
    await updateLobby(lobbyId, { coaches });
}

//#endregion
 
//#region Utils

export function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function getRoleColor(role) {
    return ROLE_COLORS[(role || '').toUpperCase()] || 'var(--text3)';
}

//#endregion