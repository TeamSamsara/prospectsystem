// ════════════════════════════════════════════════════════════
//  lobby-codes-data.js
//  Data layer: Firestore persistence + Riot Tournament API
// ════════════════════════════════════════════════════════════

import {
    db,
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    deleteDoc,
    setDoc,
    getDoc,
    serverTimestamp
} from "../firestore.js";


// ════════════════════════════════════════
// RIOT CONFIG
//
// STUB_MODE = true  → generates realistic placeholder codes so the full
//                     UI works right now without a backend proxy.
//
// STUB_MODE = false → makes real Riot Tournament API calls.
//                     The Riot API does NOT support direct browser requests
//                     (CORS). You must proxy through a Cloud Function or
//                     backend endpoint. Set RIOT_PROXY_BASE to that URL.
//
//  Cloud Function example (Firebase):
//    exports.riotProxy = functions.https.onRequest(async (req, res) => {
//      res.set('Access-Control-Allow-Origin', '*');
//      const { path, method, body } = req.body;
//      const r = await fetch(`https://americas.api.riotgames.com${path}`, {
//        method, headers: { 'X-Riot-Token': RIOT_API_KEY,
//                           'Content-Type': 'application/json' },
//        body: body ? JSON.stringify(body) : undefined,
//      });
//      res.json(await r.json());
//    });
// ════════════════════════════════════════
export const STUB_MODE       = true;
export const RIOT_API_KEY    = '9e4b061a-9b6a-47a2-9e8d-8b2c693358f0';
export const RIOT_PROXY_BASE = 'https://YOUR-CLOUD-FUNCTION-URL/riotProxy'; // swap when ready
export const PROVIDER_URL    = 'https://truesight.gg';                      // your callback URL

// Region → Riot routing host
const REGION_HOST = {
    NA1:  'https://americas.api.riotgames.com',
    BR1:  'https://americas.api.riotgames.com',
    LA1:  'https://americas.api.riotgames.com',
    LA2:  'https://americas.api.riotgames.com',
    EUW1: 'https://europe.api.riotgames.com',
    EUN1: 'https://europe.api.riotgames.com',
    TR1:  'https://europe.api.riotgames.com',
    RU:   'https://europe.api.riotgames.com',
    KR:   'https://asia.api.riotgames.com',
    JP1:  'https://asia.api.riotgames.com',
    OC1:  'https://sea.api.riotgames.com',
};

// Region string expected by provider registration endpoint
const REGION_LABEL = {
    NA1: 'NA', BR1: 'BR', LA1: 'LAN', LA2: 'LAS',
    EUW1: 'EUW', EUN1: 'EUNE', TR1: 'TR', RU: 'RU',
    KR: 'KR', JP1: 'JP', OC1: 'OCE',
};


// ════════════════════════════════════════
// STATE
// ════════════════════════════════════════
export let sessions      = [];
export let activeSession = null;

export function setActiveSession(s) { activeSession = s; }
export function setSessions(list)   { sessions = list;   }


// ════════════════════════════════════════
// FIRESTORE — SESSIONS
// ════════════════════════════════════════
export async function loadSessions() {
    const snap = await getDocs(collection(db, 'lobbySessions'));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    setSessions(list);
}

export async function saveSession(data) {
    const ref = await addDoc(collection(db, 'lobbySessions'), {
        ...data,
        createdAt: serverTimestamp(),
    });
    return ref.id;
}

export async function updateSession(sessionId, updates) {
    await updateDoc(doc(db, 'lobbySessions', sessionId), updates);
    const idx = sessions.findIndex(s => s.id === sessionId);
    if (idx !== -1) Object.assign(sessions[idx], updates);
}

export async function deleteSession(sessionId) {
    await deleteDoc(doc(db, 'lobbySessions', sessionId));
    setSessions(sessions.filter(s => s.id !== sessionId));
}


// ════════════════════════════════════════
// FIRESTORE — RIOT PROVIDERS
// One provider doc per region, stored in `riotProviders/{region}`.
// Re-used across sessions so we don't re-register on every session.
// ════════════════════════════════════════
async function getOrCreateProvider(region) {
    const ref  = doc(db, 'riotProviders', region);
    const snap = await getDoc(ref);
    if (snap.exists()) return snap.data().providerId;

    const providerId = await riotRegisterProvider(region);
    await setDoc(ref, { region, providerId, createdAt: serverTimestamp() });
    return providerId;
}


// ════════════════════════════════════════
// RIOT API — PROVIDER REGISTRATION
//
// POST /lol/tournament/v5/providers
// Body: { "region": "NA", "url": "https://..." }
// Returns: providerId (integer)
// ════════════════════════════════════════
async function riotRegisterProvider(region) {
    if (STUB_MODE) return 99999; // stub

    const body = {
        region: REGION_LABEL[region] || 'NA',
        url:    PROVIDER_URL,
    };

    return await riotPost(region, '/lol/tournament/v5/providers', body);
}


// ════════════════════════════════════════
// RIOT API — TOURNAMENT CREATION
//
// POST /lol/tournament/v5/tournaments
// Body: { "providerId": 12345, "name": "Session Name" }
// Returns: tournamentId (integer)
// ════════════════════════════════════════
async function riotCreateTournament(region, providerId, name) {
    if (STUB_MODE) return Math.floor(Math.random() * 900000) + 100000; // stub

    const body = { providerId, name };
    return await riotPost(region, '/lol/tournament/v5/tournaments', body);
}


// ════════════════════════════════════════
// RIOT API — CODE GENERATION
//
// POST /lol/tournament/v5/codes?count={n}&tournamentId={id}
// Body: { "mapType", "pickType", "spectatorType", "teamSize": 5 }
// Returns: string[]  (one code per lobby)
// ════════════════════════════════════════
async function riotGenerateCodes(region, tournamentId, count, { mapType, pickType, spectatorType }) {
    if (STUB_MODE) return generateStubCodes(region, count); // stub

    const path = `/lol/tournament/v5/codes?count=${count}&tournamentId=${tournamentId}`;
    const body = { mapType, pickType, spectatorType, teamSize: 5 };
    return await riotPost(region, path, body);
}


// ════════════════════════════════════════
// RIOT API — HTTP HELPER
// Routes through RIOT_PROXY_BASE in production.
// ════════════════════════════════════════
async function riotPost(region, path, body) {
    const res = await fetch(RIOT_PROXY_BASE, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ region, path, method: 'POST', body }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.status?.message || `Riot API error ${res.status}`);
    }
    return res.json();
}


// ════════════════════════════════════════
// FULL GENERATE FLOW
// Called on session creation and on manual regen.
// ════════════════════════════════════════
export async function generateCodesForSession(sessionId) {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) throw new Error('Session not found');

    const { region, lobbyCount, mapType, pickType, spectatorType, name } = session;

    // 1 — Provider (reuse across sessions)
    const providerId = await getOrCreateProvider(region);

    // 2 — Tournament (one per session)
    const tournamentId = await riotCreateTournament(region, providerId, name);

    // 3 — Generate one code per lobby
    const rawCodes = await riotGenerateCodes(
        region, tournamentId, lobbyCount,
        { mapType, pickType, spectatorType }
    );

    // 4 — Shape into lobby objects
    const codes = rawCodes.map((code, i) => ({
        lobbyNumber: i + 1,
        label:       `L-${String(i + 1).padStart(2, '0')}`,
        code,
        status:      'ready',
    }));

    // 5 — Persist to Firestore
    await updateSession(sessionId, {
        codes,
        tournamentId,
        providerId,
        status: 'ready',
    });

    return codes;
}


// ════════════════════════════════════════
// STUB CODE GENERATOR
// Produces codes that look like real Riot tournament codes.
// Format: {REGION}{TOURNAMENT_ID}-{UUID_SEGMENT}
// ════════════════════════════════════════
function generateStubCodes(region, count) {
    const regionPrefix = (REGION_LABEL[region] || 'NA').toUpperCase();
    const tourId       = String(Math.floor(Math.random() * 90000000) + 10000000);
    const hex = (len) => [...Array(len)].map(() => Math.floor(Math.random()*16).toString(16)).join('');
    return Array.from({ length: count }, () =>
        `${regionPrefix}${tourId}-${hex(8)}-${hex(4)}-${hex(4)}-${hex(4)}-${hex(12)}`
    );
}


// ════════════════════════════════════════
// UTILS
// ════════════════════════════════════════
export function formatPickType(p) {
    return {
        TOURNAMENT_DRAFT: 'Tournament Draft',
        BLIND_PICK:       'Blind Pick',
        ALL_RANDOM:       'All Random',
        DRAFT_MODE:       'Draft Mode',
    }[p] || p;
}

export function formatMapType(m) {
    return {
        SUMMONERS_RIFT: "Summoner's Rift",
        HOWLING_ABYSS:  'Howling Abyss (ARAM)',
    }[m] || m;
}

export function formatSpectatorType(s) {
    return { ALL: 'All Spectators', LOBBYONLY: 'Lobby Only', NONE: 'No Spectators' }[s] || s;
}

export function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}