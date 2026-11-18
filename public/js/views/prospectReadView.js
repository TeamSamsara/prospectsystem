/**
 * prospectReadView.js
 * @version 1.2.0
 *
 * Changes from 1.1.0:
 *   - mount() fetches all prospects for SOS resolution
 *   - Sidebar shows adjusted + raw scores with delta
 *   - Verdict tab has collapsible score breakdown panel
 */


//#region Imports
import { navigate                               } from '../router.js';
import { renderLoading, renderError, escHtml    } from '../renderer.js';
import { fetchProspect, fetchAllProspects       } from '../prospect/prospectRepository.js';
import { calculateProfileStats                  } from '../formulas.js';
import { scoreColor, formatScore, decisionClass } from '../prospect/prospectUtils.js';
import { openNoteModal                          } from '../noteModal.js';
//#endregion


export class ProspectReadView {

    //#region State
    _container    = null;
    _prospect     = null;
    _allProspects = [];
    _id           = null;
    _activeTab    = 'overview';
    _handlers     = [];
    //#endregion


    //#region Lifecycle

    async mount(container, params) {
        this._container = container;
        this._activeTab = 'overview';

        renderLoading(container, 'Loading profile…');

        try {
            const [prospect, allProspects] = await Promise.all([
                fetchProspect(params.id),
                fetchAllProspects(),
            ]);
            if (!prospect) { navigate('/prospects'); return; }
            this._allProspects = allProspects;
            calculateProfileStats(prospect, allProspects);
            this._prospect = prospect;
            this._id       = params.id;
            this._render();
        } catch (err) {
            renderError(container, `Could not load profile — ${err.message}`);
        }
    }

    unmount() {
        this._handlers.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
        this._handlers  = [];
        this._container = null;
        this._prospect  = null;
    }

    //#endregion


    //#region Render Shell

    _render() {
        const p    = this._prospect;
        const role = (p.role || 'N/A').toUpperCase();

        this._container.innerHTML = /*html*/`

            <!-- SUB NAV -->
            <div class="profile-subnav">
                <div class="psn-left">
                    <a href="/prospects" class="psn-back" data-link>← BACK</a>
                    <div class="psn-divider"></div>
                    <span class="psn-crumb">PLAYER PROFILE</span>
                    <div class="psn-divider"></div>
                    <button class="psn-tab on" data-tab="overview">OVERVIEW</button>
                    <button class="psn-tab"    data-tab="log">COMBINE LOG</button>
                    <button class="psn-tab"    data-tab="verdict">FINAL VERDICT</button>
                </div>
                <div class="psn-right">
                    <div class="psn-mode-indicator">
                        <span class="psn-mode-badge on">VIEW</span>
                        <span class="psn-mode-badge">EDIT</span>
                    </div>
                    <button class="btn btn-cta" id="modifyBtn">◈ MODIFY PROFILE</button>
                </div>
            </div>

            <!-- PROFILE LAYOUT -->
            <div class="profile-layout">

                <!-- SIDEBAR -->
                <aside class="profile-sidebar">
                    ${this._renderSidebar(p, role)}
                </aside>

                <!-- CONTENT -->
                <div class="profile-content" id="profileContent">
                    ${this._renderTab(this._activeTab)}
                </div>

            </div>
        `;

        this._wireEvents();
    }

    //#endregion


    //#region Sidebar

    _renderSidebar(p, role) {
        const score    = Number(p.adjustedScore) || Number(p.overallScore) || 0;
        const rawScore = Number(p.rawScore)      || 0;
        const delta    = score - rawScore;
        const decision = p.autoDecision          || 'PENDING';
        const a1       = Number(p.axis1Final)    || 0;
        const a2       = Number(p.axis2Final)    || 0;
        const soft     = Number(p.softSkillsAvg) || 0;

        // Calculate overall win rate from champion pool
        const totalWins  = (p.champion || []).reduce((sum, c) => sum + (Number(c.wins)  || 0), 0);
        const totalGames = (p.champion || []).reduce((sum, c) => sum + (Number(c.games) || 0), 0);
        const overallWr  = totalGames > 0 ? `${Math.round((totalWins / totalGames) * 100)}%` : '—';
        const wrRatio    = totalGames > 0 ? totalWins / totalGames : 0;
        const wrColor    = wrRatio >= 0.6 ? 'var(--pass)'
                         : wrRatio >= 0.45 ? 'var(--flag)'
                         : wrRatio > 0 ? 'var(--no)'
                         : 'var(--text3)';

        return /*html*/`
            <div class="sidebar-card sidebar-card--player">
                <div class="player-avatar">${escHtml((p.candidateFullname || p.candidateUsername || '?')[0].toUpperCase())}</div>
                <div class="player-name">${escHtml(p.candidateFullname || p.candidateUsername || 'Unnamed')}</div>
                <div class="player-handle">${escHtml(p.candidateUsername || '—')}</div>
                <span class="role role-${role}" style="display:inline-block;width:auto;margin-bottom:16px">${role}</span>

                <div class="sidebar-score" style="color:${scoreColor(score)}">${formatScore(score)}</div>
                ${rawScore > 0 && Math.abs(delta) > 0.005 ? `
                    <div style="font-family:var(--f-mono);font-size:11px;color:${delta > 0 ? 'var(--pass)' : 'var(--no)'};margin-top:2px;letter-spacing:.5px">
                        RAW ${rawScore.toFixed(2)} ${delta > 0 ? '+' : ''}${delta.toFixed(2)}
                    </div>
                ` : rawScore > 0 ? `
                    <div style="font-family:var(--f-mono);font-size:11px;color:var(--text3);margin-top:2px">RAW ${rawScore.toFixed(2)}</div>
                ` : ''}
                <div class="sidebar-score-lbl">Adjusted Score</div>

                <div class="verdict-row">
                    <span class="rec ${decisionClass(decision)}">${decision}</span>
                    <span class="grade-lbl">${p.letterGrade || '—'}</span>
                </div>

                <div class="mini-stats">
                    <div class="mini-stat">
                        <div class="mini-stat-val">${(p.combineLog || []).length}</div>
                        <div class="mini-stat-lbl">Entries</div>
                    </div>
                    <div class="mini-stat">
                        <div class="mini-stat-val">${(p.champion || []).length}</div>
                        <div class="mini-stat-lbl">Champions</div>
                    </div>
                    <div class="mini-stat">
                        <div class="mini-stat-val" style="color:${wrColor}">${overallWr}</div>
                        <div class="mini-stat-lbl">Win %</div>
                    </div>
                </div>
            </div>

            <div class="sidebar-card">
                <div class="sidebar-card-head">Evaluation Axes</div>
                <div class="sidebar-axes">
                    ${this._axisRow('MECHANICS',   a1,   'var(--accent)')}
                    ${this._axisRow('COMP IQ',     a2,   'var(--sup)')}
                    ${this._axisRow('SOFT SKILLS', soft, 'var(--mid)')}
                </div>
            </div>

            <div class="sidebar-card">
                <div class="sidebar-card-head">Player Info</div>
                ${this._infoRow('Rank',    p.currentRank             || '—')}
                ${this._infoRow('Peak',    p.peakRank                || '—')}
                ${this._infoRow('Team',    p.currentTeam             || 'Free Agent')}
                ${this._infoRow('Eval by', p.evaluatedLastBy || p.evaluatedBy || '—')}
                ${this._infoRow('Role',    role)}
            </div>
        `;
    }

    _axisRow(label, val, color) {
        const pct = `${Math.min((val / 4) * 100, 100)}%`;
        return /*html*/`
            <div class="axis-row">
                <div class="axis-lbl">${label}</div>
                <div class="abar"><div class="abar-fill" style="width:${pct};background:${color}"></div></div>
                <div class="axis-val">${val > 0 ? val.toFixed(2) : '—'}</div>
            </div>`;
    }

    _infoRow(key, val) {
        return /*html*/`
            <div class="info-row">
                <span class="info-key">${key}</span>
                <span class="info-val">${escHtml(val)}</span>
            </div>`;
    }

    //#endregion


    //#region Tabs

    _renderTab(tab) {
        switch (tab) {
            case 'overview': return this._renderOverview();
            case 'log':      return this._renderCombineLog();
            case 'verdict':  return this._renderVerdict();
            default:         return this._renderOverview();
        }
    }

    _renderOverview() {
        const p = this._prospect;
        return /*html*/`
            <div class="profile-card">
                <div class="profile-card-head">
                    <div>
                        <div class="card-eyebrow">Champion Pool</div>
                        <div class="card-title">Pool & Performance</div>
                    </div>
                    <div class="card-meta">${(p.champion || []).length} champions</div>
                </div>
                ${this._renderChampionTable(p.champion || [])}
            </div>

            <div class="profile-card">
                <div class="profile-card-head">
                    <div>
                        <div class="card-eyebrow">Scout Report</div>
                        <div class="card-title">Evaluator Notes</div>
                    </div>
                    <div class="card-meta">${(p.scoutingReports || []).length} report${(p.scoutingReports || []).length !== 1 ? 's' : ''}</div>
                </div>
                ${this._renderScoutingReports(p.scoutingReports || [])}
            </div>
        `;
    }

    _renderChampionTable(champions) {
        if (!champions.length) {
            return '<div class="card-empty">No champion data recorded.</div>';
        }

        return /*html*/`
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Champion</th><th>G</th><th>W</th><th>L</th>
                        <th>Win%</th><th>KDA</th><th>CS/min</th><th>GD@15</th>
                        <th>Lobby</th><th>Opponent</th><th>Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${champions.map((c, i) => {
                        // Handle both "71%" string and 0.71 decimal
                        const rawWr   = c.winRate?.toString() || '';
                        const isPercent = rawWr.includes('%');
                        const wrNum   = isPercent ? parseInt(rawWr) / 100 : parseFloat(rawWr);
                        const wrFmt   = isPercent
                            ? rawWr
                            : (!isNaN(wrNum) && wrNum > 0)
                                ? `${Math.round(wrNum * 100)}%`
                                : '—';
                        const wrClass = wrNum >= 0.6 ? 'wr-pass'
                                      : wrNum >= 0.45 ? 'wr-mid'
                                      : wrNum > 0 ? 'wr-bad'
                                      : 'td-mono';
                        const hasNote = !!c.notes;

                        return /*html*/`
                            <tr>
                                <td class="td-name">${escHtml(c.champion  || '—')}</td>
                                <td class="td-mono">${escHtml(c.games     || '—')}</td>
                                <td class="td-mono">${escHtml(c.wins      || '—')}</td>
                                <td class="td-mono">${escHtml(c.losses    || '—')}</td>
                                <td class="${wrClass}">${wrFmt}</td>
                                <td class="td-mono">${escHtml(c.kda       || '—')}</td>
                                <td class="td-mono">${escHtml(c.csPerMin  || '—')}</td>
                                <td class="td-mono">${escHtml(c.gdAt15    || '—')}</td>
                                <td class="td-mono">${escHtml(c.lobby     || '—')}</td>
                                <td class="td-mono">${escHtml(c.opponent  || '—')}</td>
                                <td>
                                    <div class="note-cell note-trigger" data-note-idx="${i}" data-note-type="champion">
                                        <span class="note-cell-text ${hasNote ? '' : 'empty'}">${hasNote ? escHtml(c.notes) : 'No note'}</span>
                                        <span class="note-cell-edit">VIEW</span>
                                    </div>
                                </td>
                            </tr>`;
                    }).join('')}
                </tbody>
            </table>`;
    }

    _renderScoutingReports(reports) {
        if (!reports.length) {
            return '<div class="card-empty">No scouting reports yet.</div>';
        }
        return /*html*/`
            <div class="scout-report-list">
                ${reports.map((r, i) => /*html*/`
                    <div class="scout-report-item">
                        <div class="scout-report-header" data-scout-idx="${i}">
                            <div>
                                <div class="scout-report-coach">
                                    ${r.isLegacy || !r.coach
                                        ? '<span class="scout-unclaimed">UNCLAIMED</span>'
                                        : escHtml(r.coach)}
                                </div>
                                <div class="scout-report-date">${escHtml(r.date || '—')}</div>
                            </div>
                            <div class="scout-report-preview">
                                ${escHtml(r.strengths || r.concerns || r.notes || 'No content')}
                            </div>
                            <button class="scout-report-expand">VIEW ↓</button>
                        </div>
                        <div class="scout-report-body" id="scout-body-${i}">
                            <div class="scout-obs-grid">
                                ${this._obsCard('↑', 'strength',  'Strengths',  r.strengths)}
                                ${this._obsCard('↓', 'concern',   'Concerns',   r.concerns)}
                                ${this._obsCard('★', 'highlight', 'Highlights', r.highlights)}
                                ${this._obsCard('◈', 'notes',     'Notes',      r.notes)}
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    }

    _obsCard(icon, type, label, content) {
        if (!content) return '';
        return /*html*/`
            <div class="scout-obs-card scout-obs-card--${type}">
                <div class="scout-obs-head">
                    <span class="scout-obs-icon">${icon}</span>
                    <span class="scout-obs-label">${label}</span>
                </div>
                <div class="scout-obs-body-text">${escHtml(content)}</div>
            </div>`;
    }

    _renderCombineLog() {
        const entries = this._prospect.combineLog || [];
        return /*html*/`
            <div class="profile-card">
                <div class="profile-card-head">
                    <div>
                        <div class="card-eyebrow">Combine Log</div>
                        <div class="card-title">Performance Entries</div>
                    </div>
                    <div class="card-meta">${entries.length} entries</div>
                </div>
                ${entries.length === 0
                    ? '<div class="card-empty">No combine entries recorded.</div>'
                    : /*html*/`
                        <div class="log-head-row log-grid">
                            <span>Lobby</span><span>Game</span><span>Champion</span>
                            <span style="color:var(--accent)">Axis 1</span>
                            <span style="color:var(--sup)">Axis 2</span>
                            <span>Coach</span><span>Notes</span>
                        </div>
                        ${entries.map((r, i) => /*html*/`
                            <div class="log-grid">
                                <span class="log-mono">${escHtml(r.lobby           || '—')}</span>
                                <span class="log-mono">${escHtml(r.gameNum         || '—')}</span>
                                <span class="log-champ">${escHtml(r.championPlayed || '—')}</span>
                                <span class="a1">${escHtml(r.axis1                 || '—')}</span>
                                <span class="a2">${escHtml(r.axis2                 || '—')}</span>
                                <span style="font-size:13px">${escHtml(r.coach     || '—')}</span>
                                <span>
                                    <div class="note-cell note-trigger" data-note-idx="${i}" data-note-type="combine">
                                        <span class="note-cell-text ${r.coachNotes ? '' : 'empty'}">${r.coachNotes ? escHtml(r.coachNotes) : 'No note'}</span>
                                        <span class="note-cell-edit">VIEW</span>
                                    </div>
                                </span>
                            </div>
                        `).join('')}
                    `
                }
            </div>`;
    }

    _renderVerdict() {
        const p        = this._prospect;
        const adjusted = Number(p.adjustedScore) || Number(p.overallScore) || 0;
        const raw      = Number(p.rawScore)      || 0;
        const decision = p.autoDecision          || 'PENDING';

        return /*html*/`
            <div class="profile-card">
                <div class="profile-card-head">
                    <div>
                        <div class="card-eyebrow">Final Verdict</div>
                        <div class="card-title">Evaluation Summary</div>
                    </div>
                </div>
                <div class="verdict-scores-row">
                    <div class="vs-cell"><div class="vs-label">AXIS 1</div><div class="vs-val">${formatScore(p.axis1Final || p.axis1Avg)}</div></div>
                    <div class="vs-cell"><div class="vs-label">AXIS 2</div><div class="vs-val">${formatScore(p.axis2Final || p.axis2Avg)}</div></div>
                    <div class="vs-cell"><div class="vs-label">SOFT SKILLS</div><div class="vs-val">${formatScore(p.softSkillsAvg)}</div></div>
                    <div class="vs-cell vs-cell--highlight">
                        <div class="vs-label">ADJUSTED</div>
                        <div class="vs-val vs-val--score" style="color:${scoreColor(adjusted)}">${formatScore(adjusted)}</div>
                    </div>
                    <div class="vs-cell"><div class="vs-label">GRADE</div><div class="vs-val">${escHtml(p.letterGrade || '—')}</div></div>
                    <div class="vs-cell">
                        <div class="vs-label">DECISION</div>
                        <div style="margin-top:6px"><span class="rec ${decisionClass(decision)}">${decision}</span></div>
                    </div>
                </div>

                <!-- Collapsible breakdown -->
                <div class="breakdown-toggle" id="breakdownToggle">
                    <span class="breakdown-toggle-icon" id="breakdownIcon">▸</span>
                    <span>SCORE BREAKDOWN</span>
                </div>
                <div class="breakdown-panel" id="breakdownPanel" style="display:none">
                    ${this._renderBreakdown(p, raw)}
                </div>

                ${p.writtenRecommendation ? /*html*/`
                    <div class="written-block">
                        <div class="written-lbl">✍ Written Recommendation</div>
                        <div class="written-text">${escHtml(p.writtenRecommendation)}</div>
                        <div class="written-meta">
                            ${p.ceilingAssessment ? `<div class="wm-item"><div class="wm-lbl">Ceiling</div><div class="wm-val">${escHtml(p.ceilingAssessment)}</div></div>` : ''}
                            ${p.followUpAction    ? `<div class="wm-item"><div class="wm-lbl">Follow-Up</div><div class="wm-val">${escHtml(p.followUpAction)}</div></div>` : ''}
                        </div>
                    </div>
                ` : '<div class="card-empty">No written recommendation yet.</div>'}

                ${(p.coachability || p.communication || p.attitude || p.teamFit || p.selfAwareness) ? /*html*/`
                    <div class="written-block" style="border-top:1px solid var(--line)">
                        <div class="written-lbl">Soft Skills</div>
                        <div class="soft-read-grid">
                            ${this._softReadRow('Coachability',            p.coachability,  p.coachabilityNote)}
                            ${this._softReadRow('Communication',           p.communication, p.communicationNote)}
                            ${this._softReadRow('Attitude Under Pressure', p.attitude,      p.attitudeNote)}
                            ${this._softReadRow('Team Fit',                p.teamFit,       p.teamFitNote)}
                            ${this._softReadRow('Self-Awareness',          p.selfAwareness, p.selfAwarenessNote)}
                        </div>
                    </div>
                ` : ''}
            </div>`;
    }

    _renderBreakdown(p, raw) {
        const fmt  = v => (Number(v) > 0 ? Number(v).toFixed(2) : '—');
        const sign = v => v > 0 ? `+${v.toFixed(2)}` : v < 0 ? v.toFixed(2) : '—';

        const a1Raw      = Number(p.axis1Raw)       || 0;
        const a1Bayes    = Number(p.axis1Bayes)     || 0;
        const a1Depth    = Number(p.axis1PoolDepth) || 0;
        const a1Final    = Number(p.axis1Final)     || 0;
        const a1Conf     = Number(p.axis1Confidence)|| 0;
        const a1Entries  = Number(p.axis1Entries)   || 0;

        const a2Raw     = Number(p.axis2Raw)        || 0;
        const a2Final   = Number(p.axis2Final)      || 0;
        const a2Conf    = Number(p.axis2Confidence) || 0;
        const a2Entries = Number(p.axis2Entries)    || 0;

        const softAvg   = Number(p.softSkillsAvg)   || 0;
        const softCount = Number(p.softSkillsCount)  || 0;

        const adjusted  = Number(p.adjustedScore) || Number(p.overallScore) || 0;
        const delta     = adjusted - raw;

        return /*html*/`
            <div class="bd-body">

                <div class="bd-section">
                    <div class="bd-section-title">Axis 1 — Mechanics</div>
                    <div class="bd-rows">
                        <div class="bd-row"><span class="bd-lbl">Raw average</span><span class="bd-val">${fmt(a1Raw)}</span></div>
                        <div class="bd-row"><span class="bd-lbl">Bayesian adjusted</span><span class="bd-val">${fmt(a1Bayes)}</span></div>
                        <div class="bd-row"><span class="bd-lbl">Confidence</span><span class="bd-val" style="color:${a1Conf >= 67 ? 'var(--pass)' : a1Conf >= 40 ? 'var(--flag)' : 'var(--no)'}">${a1Conf}%  ·  ${a1Entries} entries</span></div>
                        ${a1Depth !== 0 ? `<div class="bd-row"><span class="bd-lbl">Pool depth</span><span class="bd-val" style="color:${a1Depth > 0 ? 'var(--pass)' : 'var(--no)'}">${sign(a1Depth)}</span></div>` : ''}
                        <div class="bd-row bd-row--final"><span class="bd-lbl">Final</span><span class="bd-val">${fmt(a1Final)}</span></div>
                    </div>
                </div>

                <div class="bd-section">
                    <div class="bd-section-title">Axis 2 — Competitive IQ</div>
                    <div class="bd-rows">
                        <div class="bd-row"><span class="bd-lbl">Raw average</span><span class="bd-val">${fmt(a2Raw)}</span></div>
                        <div class="bd-row"><span class="bd-lbl">Bayesian adjusted</span><span class="bd-val">${fmt(a2Final)}</span></div>
                        <div class="bd-row bd-row--final"><span class="bd-lbl">Confidence</span><span class="bd-val" style="color:${a2Conf >= 67 ? 'var(--pass)' : a2Conf >= 40 ? 'var(--flag)' : 'var(--no)'}">${a2Conf}%  ·  ${a2Entries} entries</span></div>
                    </div>
                </div>

                ${softAvg > 0 ? `
                <div class="bd-section">
                    <div class="bd-section-title">Soft Skills</div>
                    <div class="bd-rows">
                        <div class="bd-row bd-row--final"><span class="bd-lbl">Average (${softCount}/5 fields)</span><span class="bd-val">${fmt(softAvg)}</span></div>
                    </div>
                </div>` : ''}

                <div class="bd-section bd-section--weight">
                    <div class="bd-row"><span class="bd-lbl">Weighting</span><span class="bd-val" style="color:var(--text3)">${softAvg > 0 ? 'Axes 75% · Soft 25%' : 'Axes 100%'}</span></div>
                    <div class="bd-row"><span class="bd-lbl">Raw score</span><span class="bd-val">${fmt(raw)}</span></div>
                    <div class="bd-row bd-row--final"><span class="bd-lbl">SOS + Bayesian delta</span><span class="bd-val" style="color:${delta > 0.005 ? 'var(--pass)' : delta < -0.005 ? 'var(--no)' : 'var(--text3)'}">${sign(delta)}</span></div>
                </div>

            </div>
        `;
    }

    _softReadRow(label, score, note) {
        if (!score) return '';
        const s     = Number(score) || 0;
        const color = s >= 3 ? 'var(--pass)' : s >= 2 ? 'var(--flag)' : s > 0 ? 'var(--no)' : 'var(--text3)';
        return /*html*/`
            <div class="soft-read-row">
                <div class="soft-read-label">${label}</div>
                <div class="soft-read-score" style="color:${color}">${s > 0 ? s : '—'}</div>
                <div class="note-cell note-trigger soft-note-trigger" data-soft-label="${label}" data-soft-note="${escHtml(note || '')}">
                    <span class="note-cell-text ${note ? '' : 'empty'}">${note ? escHtml(note) : 'No note'}</span>
                    <span class="note-cell-edit">VIEW</span>
                </div>
            </div>`;
    }

    //#endregion


    //#region Events

    _wireEvents() {
        const on = (el, type, fn) => {
            if (!el) return;
            el.addEventListener(type, fn);
            this._handlers.push({ el, type, fn });
        };

        on(this._container.querySelector('#modifyBtn'), 'click', () => {
            navigate(`/prospects/${this._id}/edit`);
        });

        on(this._container, 'click', e => {
            const tab = e.target.closest('.psn-tab');
            if (tab) {
                this._activeTab = tab.dataset.tab;
                this._container.querySelectorAll('.psn-tab').forEach(t =>
                    t.classList.toggle('on', t.dataset.tab === this._activeTab));
                this._container.querySelector('#profileContent').innerHTML =
                    this._renderTab(this._activeTab);
                this._wireContentEvents();
                return;
            }
        });

        this._wireContentEvents();
    }

    _wireContentEvents() {
        const c = this._container;

        // Breakdown toggle
        const toggle = c.querySelector('#breakdownToggle');
        const panel  = c.querySelector('#breakdownPanel');
        const icon   = c.querySelector('#breakdownIcon');
        if (toggle && panel) {
            toggle.addEventListener('click', () => {
                const open = panel.style.display !== 'none';
                panel.style.display = open ? 'none' : '';
                if (icon) icon.textContent = open ? '▸' : '▾';
            });
        }

        // Scout accordion
        c.querySelectorAll('.scout-report-header').forEach(header => {
            header.addEventListener('click', () => {
                const idx    = header.dataset.scoutIdx;
                const body   = c.querySelector(`#scout-body-${idx}`);
                const btn    = header.querySelector('.scout-report-expand');
                const isOpen = body?.classList.contains('open');
                c.querySelectorAll('.scout-report-body').forEach(b => b.classList.remove('open'));
                c.querySelectorAll('.scout-report-expand').forEach(b => b.textContent = 'VIEW ↓');
                if (!isOpen && body) { body.classList.add('open'); btn.textContent = 'CLOSE ↑'; }
            });
        });

        // Champion pool note cells
        c.querySelectorAll('.note-trigger[data-note-type="champion"]').forEach(trigger => {
            trigger.addEventListener('click', e => {
                e.stopPropagation();
                const idx   = Number(trigger.dataset.noteIdx);
                const champ = this._prospect.champion?.[idx];
                if (!champ) return;
                openNoteModal({
                    title:   `${champ.champion || 'Champion'} — Notes`,
                    content: champ.notes || '',
                });
            });
        });

        // Combine log note cells
        c.querySelectorAll('.note-trigger[data-note-type="combine"]').forEach(trigger => {
            trigger.addEventListener('click', e => {
                e.stopPropagation();
                const idx   = Number(trigger.dataset.noteIdx);
                const entry = this._prospect.combineLog?.[idx];
                if (!entry) return;
                openNoteModal({
                    title:   `${entry.championPlayed || 'Entry'} — Coach Notes`,
                    content: entry.coachNotes || '',
                });
            });
        });

        // Soft skill note cells
        c.querySelectorAll('.soft-note-trigger').forEach(trigger => {
            trigger.addEventListener('click', e => {
                e.stopPropagation();
                openNoteModal({
                    title:   trigger.dataset.softLabel,
                    content: trigger.dataset.softNote || '',
                });
            });
        });
    }

    //#endregion

}