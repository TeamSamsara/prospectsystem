// ════════════════════════════════════════
// TRUE SIGHT — Lobby Codes UI
// ════════════════════════════════════════

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

// ── Local proxy server URL ───────────────
const PROXY = 'http://localhost:3001';

// ════════════════════════════════════════
// STATE
// ════════════════════════════════════════
let sessions      = [];
let activeSession = null;

// ════════════════════════════════════════
// INIT
// ════════════════════════════════════════
(async function init() {
    setupModalListeners();
    await loadSessions();
    renderSessionList();
    showView('list');
})();

// ════════════════════════════════════════
// VIEWS
// ════════════════════════════════════════
function showView(name) {
    document.querySelectorAll('.lc-view').forEach(v => v.classList.add('hidden'));
    document.getElementById(`lcView_${name}`)?.classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ════════════════════════════════════════
// LOAD SESSIONS
// ════════════════════════════════════════
async function loadSessions() {
    const snap = await getDocs(collection(db, 'lobbyCodeSessions'));
    sessions = [];
    snap.forEach(d => sessions.push({ id: d.id, ...d.data() }));
    sessions.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
}

// ════════════════════════════════════════
// RENDER SESSION LIST
// ════════════════════════════════════════
function renderSessionList() {
    const container = document.getElementById('sessionListCards');
    if (!container) return;

    if (sessions.length === 0) {
        container.innerHTML = `
            <div class="lc-empty">
                <div class="lc-empty-icon">◈</div>
                <div class="lc-empty-title">No sessions yet</div>
                <div class="lc-empty-sub">Create a session to generate lobby codes for your combine.</div>
            </div>`;
        return;
    }

    container.innerHTML = sessions.map(s => {
        const readyCount   = (s.lobbies || []).filter(l => l.code).length;
        const totalLobbies = (s.lobbies || []).length;
        const statusLabel  = readyCount === totalLobbies && totalLobbies > 0 ? 'READY' : readyCount > 0 ? 'PARTIAL' : 'PENDING';
        const statusClass  = statusLabel === 'READY' ? 'lc-status-ready' : statusLabel === 'PARTIAL' ? 'lc-status-pending' : 'lc-status-pending';

        return `
            <div class="session-card">
                <div class="session-card-header">
                    <div>
                        <div class="session-card-name">${escHtml(s.name || 'Unnamed Session')}</div>
                        <div class="session-card-meta">${escHtml(s.region || 'NA')} · ${s.pickType || 'TOURNAMENT_DRAFT'} · ${s.gamesPerLobby || 1} game(s)/lobby</div>
                    </div>
                    <span class="lc-status ${statusClass}">${statusLabel}</span>
                </div>
                <div class="session-card-stats">
                    <div class="sc-stat">
                        <div class="sc-stat-val accent">${readyCount}</div>
                        <div class="sc-stat-lbl">Codes Ready</div>
                    </div>
                    <div class="sc-stat">
                        <div class="sc-stat-val">${totalLobbies}</div>
                        <div class="sc-stat-lbl">Lobbies</div>
                    </div>
                    <div class="sc-stat">
                        <div class="sc-stat-val gold">${s.gamesPerLobby || 1}</div>
                        <div class="sc-stat-lbl">Games ea.</div>
                    </div>
                </div>
                <div class="session-card-actions">
                    <button class="btn btn-danger"  data-delete-session="${s.id}">DELETE</button>
                    <button class="btn btn-cta"     data-open-session="${s.id}">◈ OPEN</button>
                </div>
            </div>`;
    }).join('');
}

// ════════════════════════════════════════
// OPEN SESSION DASHBOARD
// ════════════════════════════════════════
function openSession(sessionId) {
    activeSession = sessions.find(s => s.id === sessionId);
    if (!activeSession) return;

    document.getElementById('dashSessionName').textContent = activeSession.name || '—';
    document.getElementById('dashSessionMeta').textContent =
        `${activeSession.region} · ${activeSession.pickType} · ${activeSession.map}`;

    renderDashStats();
    renderLobbyCodes();
    showView('dashboard');
}

function renderDashStats() {
    const s          = activeSession;
    const total      = (s.lobbies || []).length;
    const readyCount = (s.lobbies || []).filter(l => l.code).length;
    const el         = document.getElementById('dashSessionStats');
    if (!el) return;
    el.innerHTML = `
        <div class="dash-stat"><div class="dash-stat-val accent">${readyCount}</div><div class="dash-stat-lbl">Ready</div></div>
        <div class="dash-stat"><div class="dash-stat-val" style="color:var(--flag)">${total - readyCount}</div><div class="dash-stat-lbl">Pending</div></div>
        <div class="dash-stat"><div class="dash-stat-val">${total}</div><div class="dash-stat-lbl">Total</div></div>`;
}

// ════════════════════════════════════════
// RENDER LOBBY CODES
// ════════════════════════════════════════
function renderLobbyCodes() {
    const container = document.getElementById('lobbyCodesList');
    if (!container) return;

    const lobbies = activeSession.lobbies || [];

    if (lobbies.length === 0) {
        container.innerHTML = '<div class="iv-loading">No lobbies in this session.</div>';
        return;
    }

    container.innerHTML = lobbies.map((lobby, idx) => {
        const hasCode  = !!lobby.code;
        const statusCls = hasCode ? 'lc-status-ready' : 'lc-status-pending';
        const statusLbl = hasCode ? 'READY' : 'PENDING';

        return `
            <div class="lobby-code-row" id="lcrow_${idx}">
                <div class="lobby-code-row-header">
                    <span class="lobby-code-id">Lobby ${idx + 1}</span>
                    <span class="lobby-code-row-meta">${activeSession.gamesPerLobby || 1} game(s)</span>
                    <span class="lc-status ${statusCls}" id="lcstatus_${idx}">${statusLbl}</span>
                </div>
                <div class="lobby-code-body">
                    <span class="code-label">CODE</span>
                    <div class="code-value-wrap">
                        <span class="code-value ${hasCode ? '' : 'pending'}" id="lcval_${idx}">
                            ${hasCode ? escHtml(lobby.code) : 'Not generated yet…'}
                        </span>
                        ${hasCode ? `<button class="copy-code-btn" data-copy="${escHtml(lobby.code)}">COPY</button>` : ''}
                        <button class="btn btn-ghost" style="font-size:10px;padding:5px 12px"
                            data-regen-idx="${idx}" ${hasCode ? '' : ''}>
                            ${hasCode ? '↻ REGEN' : '⚡ GENERATE'}
                        </button>
                    </div>
                </div>
            </div>`;
    }).join('');
}

// ════════════════════════════════════════
// GENERATE CODE for ONE lobby
// ════════════════════════════════════════
async function generateCodeForLobby(idx) {
    const lobby = activeSession.lobbies[idx];

    // Update UI to loading
    const valEl    = document.getElementById(`lcval_${idx}`);
    const statusEl = document.getElementById(`lcstatus_${idx}`);
    if (valEl)    { valEl.className = 'code-value pending'; valEl.textContent = 'Generating…'; }
    if (statusEl) { statusEl.textContent = 'PENDING'; statusEl.className = 'lc-status lc-status-pending'; }

    try {
        const res = await fetch(`${PROXY}/generate-codes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tournamentId:  activeSession.tournamentId,
                count:         1,
                pickType:      activeSession.pickType      || 'TOURNAMENT_DRAFT',
                mapType:       activeSession.map           || 'SUMMONERS_RIFT',
                spectatorType: activeSession.spectatorType || 'ALL',
                metadata:      `Lobby ${idx + 1}`,
            })
        });

        if (!res.ok) throw new Error(`Riot API error ${res.status}`);

        const codes = await res.json();
        const code  = Array.isArray(codes) ? codes[0] : codes;

        // Save to session
        activeSession.lobbies[idx].code = code;
        await setDoc(doc(db, 'lobbyCodeSessions', activeSession.id), activeSession);

        // Update UI
        if (valEl)    { valEl.className = 'code-value'; valEl.textContent = code; }
        if (statusEl) { statusEl.textContent = 'READY'; statusEl.className = 'lc-status lc-status-ready'; }

        // Re-render the row to add copy button
        renderLobbyCodes();
        renderDashStats();

    } catch (err) {
        console.error('Generate failed:', err);
        if (valEl)    { valEl.className = 'code-value error'; valEl.textContent = 'Error — ' + err.message; }
        if (statusEl) { statusEl.textContent = 'ERROR'; statusEl.className = 'lc-status lc-status-error'; }
    }
}

// ════════════════════════════════════════
// GENERATE ALL CODES
// ════════════════════════════════════════
async function generateAllCodes() {
    const lobbies = activeSession.lobbies || [];

    try {
        const res = await fetch(`${PROXY}/generate-codes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tournamentId:  activeSession.tournamentId,
                count:         lobbies.length,
                pickType:      activeSession.pickType      || 'TOURNAMENT_DRAFT',
                mapType:       activeSession.map           || 'SUMMONERS_RIFT',
                spectatorType: activeSession.spectatorType || 'ALL',
                metadata:      'True Sight Combine',
            })
        });

        if (!res.ok) throw new Error(`Riot API error ${res.status}`);

        const codes = await res.json();

        codes.forEach((code, i) => {
            if (activeSession.lobbies[i]) {
                activeSession.lobbies[i].code = code;
            }
        });

        await setDoc(doc(db, 'lobbyCodeSessions', activeSession.id), activeSession);
        renderLobbyCodes();
        renderDashStats();

    } catch (err) {
        alert('Failed to generate codes: ' + err.message);
        console.error(err);
    }
}

// ════════════════════════════════════════
// COPY ALL CODES
// ════════════════════════════════════════
function copyAllCodes() {
    const lobbies = activeSession.lobbies || [];
    const lines   = lobbies
        .map((l, i) => `Lobby ${i + 1}: ${l.code || '(no code)'}`)
        .join('\n');

    navigator.clipboard.writeText(lines).then(() => {
        const btn = document.getElementById('copyAllCodesBtn');
        if (btn) { btn.textContent = 'COPIED!'; setTimeout(() => { btn.textContent = 'COPY ALL CODES'; }, 2000); }
    });
}

// ════════════════════════════════════════
// MODAL — NEW SESSION
// ════════════════════════════════════════
function setupModalListeners() {
    // Live summary update
    const countInput  = document.getElementById('lc-count');
    const gamesInput  = document.getElementById('lc-games');
    const regionInput = document.getElementById('lc-region');

    const updateSummary = () => {
        const n = parseInt(countInput?.value || 8);
        const g = parseInt(gamesInput?.value || 2);
        const r = regionInput?.value || 'NA1';
        const sumLobbies = document.getElementById('sum-lobbies');
        const sumGames   = document.getElementById('sum-games');
        const sumCodes   = document.getElementById('sum-codes');
        const sumRegion  = document.getElementById('sum-region');
        if (sumLobbies) sumLobbies.textContent = n;
        if (sumGames)   sumGames.textContent   = g;
        if (sumCodes)   sumCodes.textContent   = n;
        if (sumRegion)  sumRegion.textContent  = r;
    };

    countInput?.addEventListener('input',  updateSummary);
    gamesInput?.addEventListener('input',  updateSummary);
    regionInput?.addEventListener('change',updateSummary);
}

async function createSession() {
    const name       = document.getElementById('lc-name')?.value?.trim();
    const region     = document.getElementById('lc-region')?.value || 'NA1';
    const map        = document.getElementById('lc-map')?.value    || 'SUMMONERS_RIFT';
    const pickType   = document.getElementById('lc-pick')?.value   || 'TOURNAMENT_DRAFT';
    const spectators = document.getElementById('lc-spec')?.value   || 'ALL';
    const count      = parseInt(document.getElementById('lc-count')?.value || '8');
    const games      = parseInt(document.getElementById('lc-games')?.value || '2');

    if (!name) { alert('Please enter a session name.'); return; }

    const confirmBtn = document.getElementById('confirmSessionBtn');
    if (confirmBtn) { confirmBtn.textContent = 'Creating…'; confirmBtn.disabled = true; }

    try {
        // 1. Create provider
        const provRes = await fetch(`${PROXY}/create-provider`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ region: region.replace(/\d/g, ''), callbackUrl: 'https://localhost' })
        });
        if (!provRes.ok) throw new Error(`Provider error ${provRes.status}: ${await provRes.text()}`);
        const providerId = await provRes.json();

        // 2. Create tournament
        const tourRes = await fetch(`${PROXY}/create-tournament`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ providerId, name })
        });
        if (!tourRes.ok) throw new Error(`Tournament error ${tourRes.status}: ${await tourRes.text()}`);
        const tournamentId = await tourRes.json();

        // 3. Build lobby stubs (codes generated on demand)
        const lobbies = Array.from({ length: count }, (_, i) => ({
            lobbyNum: i + 1,
            label:    `Lobby ${i + 1}`,
            code:     null,
        }));

        // 4. Save to Firestore
        const sessionData = {
            name, region, map, pickType,
            spectatorType: spectators,
            gamesPerLobby: games,
            lobbies,
            providerId,
            tournamentId,
            createdAt: serverTimestamp(),
        };

        const ref = await addDoc(collection(db, 'lobbyCodeSessions'), sessionData);

        // Close modal
        document.getElementById('newSessionModal')?.classList.add('hidden');

        // Reload and open
        await loadSessions();
        renderSessionList();
        openSession(ref.id);

    } catch (err) {
        console.error('Create session failed:', err);
        alert('Failed — is the local server running? Error: ' + err.message);
    } finally {
        if (confirmBtn) { confirmBtn.textContent = '◈ GENERATE CODES'; confirmBtn.disabled = false; }
    }
}

// ════════════════════════════════════════
// EVENTS
// ════════════════════════════════════════
document.addEventListener('click', async e => {

    // Open modal
    if (e.target.matches('#newSessionBtn')) {
        document.getElementById('newSessionModal')?.classList.remove('hidden');
        return;
    }

    // Cancel modal
    if (e.target.matches('#cancelModalBtn')) {
        document.getElementById('newSessionModal')?.classList.add('hidden');
        return;
    }

    // Confirm create
    if (e.target.matches('#confirmSessionBtn')) {
        await createSession();
        return;
    }

    // Open session
    const openBtn = e.target.closest('[data-open-session]');
    if (openBtn) { openSession(openBtn.dataset.openSession); return; }

    // Back to list
    if (e.target.matches('#dashBackBtn')) {
        await loadSessions();
        renderSessionList();
        showView('list');
        return;
    }

    // Delete session
    const delBtn = e.target.closest('[data-delete-session]');
    if (delBtn) {
        if (!confirm('Delete this session and all its codes?')) return;
        await deleteDoc(doc(db, 'lobbyCodeSessions', delBtn.dataset.deleteSession));
        await loadSessions();
        renderSessionList();
        return;
    }

    // Copy single code
    const copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) {
        navigator.clipboard.writeText(copyBtn.dataset.copy).then(() => {
            copyBtn.textContent = 'COPIED!';
            copyBtn.classList.add('copied');
            setTimeout(() => { copyBtn.textContent = 'COPY'; copyBtn.classList.remove('copied'); }, 2000);
        });
        return;
    }

    // Copy all codes
    if (e.target.matches('#copyAllCodesBtn')) {
        copyAllCodes();
        return;
    }

    // Regen all
    if (e.target.matches('#regenSessionBtn')) {
        if (!confirm('Regenerate ALL codes? Existing codes will be replaced.')) return;
        activeSession.lobbies.forEach(l => { l.code = null; });
        await generateAllCodes();
        return;
    }

    // Generate / regen single lobby
    const regenBtn = e.target.closest('[data-regen-idx]');
    if (regenBtn) {
        const idx = parseInt(regenBtn.dataset.regenIdx);
        await generateCodeForLobby(idx);
        return;
    }
});

// ════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════
function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}