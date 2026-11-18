// ════════════════════════════════════════
// TRUE SIGHT — Local Riot API Proxy
// Run: node server.js
// ════════════════════════════════════════

const http = require('http');
const https = require('https');

// ── CONFIG ── change these two ──────────
const RIOT_API_KEY  = process.env.RIOT_API_KEY;
const PORT          = 3001;
// ────────────────────────────────────────

const RIOT_HOST     = 'americas.api.riotgames.com';   // stubbed endpoint is always americas
const STUBBED_BASE  = '/lol/tournament-stub/v5';

function corsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function riotPost(path, body, cb) {
    if (!RIOT_API_KEY) {
        cb(new Error('RIOT_API_KEY is not configured on the server.'));
        return;
    }
    const payload = JSON.stringify(body);
    const options = {
        hostname: RIOT_HOST,
        path:     path,
        method:   'POST',
        headers: {
            'X-Riot-Token':  RIOT_API_KEY,
            'Content-Type':  'application/json',
            'Content-Length': Buffer.byteLength(payload),
        }
    };
    const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => cb(null, res.statusCode, data));
    });
    req.on('error', err => cb(err));
    req.write(payload);
    req.end();
}

function riotGet(path, cb) {
    if (!RIOT_API_KEY) {
        cb(new Error('RIOT_API_KEY is not configured on the server.'));
        return;
    }
    const options = {
        hostname: RIOT_HOST,
        path:     path,
        method:   'GET',
        headers: { 'X-Riot-Token': RIOT_API_KEY }
    };
    const req = https.request(options, res => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => cb(null, res.statusCode, data));
    });
    req.on('error', err => cb(err));
    req.end();
}

function readBody(req, cb) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
        try { cb(null, JSON.parse(body || '{}')); }
        catch(e) { cb(e); }
    });
}

const server = http.createServer((req, res) => {
    corsHeaders(res);

    // Preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const url = req.url;

    // ── POST /create-provider ────────────────────────────
    // body: { region, url, callbackUrl }
    if (req.method === 'POST' && url === '/create-provider') {
        readBody(req, (err, body) => {
            if (err) { res.writeHead(400); res.end('Bad JSON'); return; }
            const payload = {
                region: body.region || 'NA',
                url:    body.callbackUrl || 'https://localhost'
            };
            riotPost(`${STUBBED_BASE}/providers`, payload, (err, status, data) => {
                if (err) { res.writeHead(500); res.end(err.message); return; }
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(data);
            });
        });
        return;
    }

    // ── POST /create-tournament ──────────────────────────
    // body: { providerId, name }
    if (req.method === 'POST' && url === '/create-tournament') {
        readBody(req, (err, body) => {
            if (err) { res.writeHead(400); res.end('Bad JSON'); return; }
            const payload = {
                providerId: body.providerId,
                name:       body.name || 'True Sight Combine'
            };
            riotPost(`${STUBBED_BASE}/tournaments`, payload, (err, status, data) => {
                if (err) { res.writeHead(500); res.end(err.message); return; }
                res.writeHead(status, { 'Content-Type': 'application/json' });
                res.end(data);
            });
        });
        return;
    }

    // ── POST /generate-codes ─────────────────────────────
    // body: { tournamentId, count, pickType, mapType, spectatorType, metadata }
    if (req.method === 'POST' && url === '/generate-codes') {
        readBody(req, (err, body) => {
            if (err) { res.writeHead(400); res.end('Bad JSON'); return; }

            const count = body.count || 1;
            const payload = {
                teamSize:      5,
                pickType:      body.pickType      || 'TOURNAMENT_DRAFT',
                mapType:       body.mapType       || 'SUMMONERS_RIFT',
                spectatorType: body.spectatorType || 'ALL',
                metadata:      body.metadata      || '',
                enoughPlayers: false
            };

            riotPost(
                `${STUBBED_BASE}/codes?count=${count}&tournamentId=${body.tournamentId}`,
                payload,
                (err, status, data) => {
                    if (err) { res.writeHead(500); res.end(err.message); return; }
                    res.writeHead(status, { 'Content-Type': 'application/json' });
                    res.end(data);
                }
            );
        });
        return;
    }

    // 404
    res.writeHead(404);
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║  TRUE SIGHT — Riot Proxy Running     ║
║  http://localhost:${PORT}               ║
╚══════════════════════════════════════╝
Routes:
  POST /create-provider
  POST /create-tournament  
  POST /generate-codes
`);
});