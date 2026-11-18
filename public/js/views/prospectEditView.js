/**
 * prospectEditView.js
 * @version 1.3.0
 *
 * Changes from 1.2.1:
 *   - mount() fetches all prospects for opponent dropdown
 *   - _initModules() passes allProspects + profileRole to initProspectForm
 *   - calculateProfileStats called with allProspects for SOS resolution
 *   - debug logs removed
 */


//#region Imports
import { navigate                                                             } from '../router.js';
import { renderLoading, renderError                                           } from '../renderer.js';
import { fetchProspect, fetchAllProspects,
         createProspect, updateProspect, deleteProspect                      } from '../prospect/prospectRepository.js';
import { createEmptyProspect, createScoutingInput                            } from '../prospect/prospectModel.js';
import { calculateProfileStats                                                } from '../formulas.js';
import { initProspectForm, populateProspectForm, collectProspectData,
         addChampionRow, addCombineRow                                        } from '../form/prospectForm.js';
import { initCalc, runLiveCalc                                                } from '../prospect/calc.js';
import { setSaveStatus, setSaveBtnLoading,
         showStickyFooter, hideStickyFooter                                   } from '../footer.js';
import { openNoteModal                                                        } from '../noteModal.js';
import { showConfirmModal                                                     } from '../confirmModal.js';
import { escAttr, escHtml                                                     } from '../renderer.js';
//#endregion


export class ProspectEditView {

    //#region State
    _container     = null;
    _prospect      = null;
    _allProspects  = [];
    _id            = null;
    _isNew         = false;
    _activeTab     = 'identity';
    _isDirty       = false;
    _isSaving      = false;
    _autoSaveTimer = null;
    _handlers      = [];

    static AUTOSAVE_DELAY = 3000;
    //#endregion


    //#region Lifecycle

    async mount(container, params) {
        this._container = container;
        this._isNew     = !params.id;
        this._id        = params.id || null;
        this._activeTab = 'identity';

        renderLoading(container, this._isNew ? 'Preparing form…' : 'Loading profile…');

        try {
            // Fetch all prospects for opponent dropdown in combine log
            this._allProspects = await fetchAllProspects();

            if (this._isNew) {
                this._prospect = createEmptyProspect();
            } else {
                const data = await fetchProspect(this._id);
                if (!data) { navigate('/prospects'); return; }
                calculateProfileStats(data, this._allProspects);
                this._prospect = data;
            }
            this._render();
            this._initModules();
            showStickyFooter();

        } catch (err) {
            console.error('[Edit] Error:', err);
            console.error('[Edit] Stack:', err.stack);
            renderError(container, `Could not load profile — ${err.message}`);
        }
    }

    unmount() {
        this._handlers.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
        this._handlers     = [];
        this._container    = null;
        this._prospect     = null;
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
        hideStickyFooter();
    }

    //#endregion


    //#region Init Modules

    _initModules() {
        const form        = this._container.querySelector('#prospectForm');
        const champBody   = this._container.querySelector('#championPoolTable tbody');
        const combineBody = this._container.querySelector('#combineLogTable tbody');

        if (!form) return;

        initCalc({ form, combineBody, allProspects: this._allProspects });

        initProspectForm({
            form,
            championBody: champBody,
            combineBody,
            onDirty:      () => { this._markDirty(); runLiveCalc(); },
            allProspects: this._allProspects,
            profileRole:  this._prospect?.role || '',
        });
        console.log('[Edit] initProspectForm done');

        if (!this._isNew) {
            populateProspectForm(this._prospect);
        }

        runLiveCalc();

        form.addEventListener('input',  () => { this._markDirty(); runLiveCalc(); });
        form.addEventListener('submit', e  => { e.preventDefault(); this._save(); });

        const saveFn         = () => this._save();
        const cancelFn       = () => this._handleCancel();
        const leaveAndSaveFn = () => this._handleLeaveAndSave();

        document.addEventListener('app:save',         saveFn);
        document.addEventListener('app:cancel',       cancelFn);
        document.addEventListener('app:leaveAndSave', leaveAndSaveFn);

        this._handlers.push(
            { el: document, type: 'app:save',         fn: saveFn         },
            { el: document, type: 'app:cancel',       fn: cancelFn       },
            { el: document, type: 'app:leaveAndSave', fn: leaveAndSaveFn },
        );

        this._container.querySelector('#addChampionBtn')?.addEventListener('click', () => {
            addChampionRow(); this._markDirty();
        });
        this._container.querySelector('#addCombineRowBtn')?.addEventListener('click', () => {
            addCombineRow(); this._markDirty();
        });
        this._container.querySelector('#addScoutBtn')?.addEventListener('click', () => {
            this._addScoutingReport();
        });

        this._wireScoutingEvents();

        this._container.addEventListener('click', e => {
            const trigger = e.target.closest('.sg-note-cell .note-trigger');
            if (!trigger) return;
            const noteName    = trigger.dataset.noteName;
            const label       = trigger.dataset.softLabel;
            const hiddenInput = this._container.querySelector(`[name="${noteName}"]`);
            const textEl      = trigger.querySelector('.note-cell-text');
            if (!hiddenInput) return;
            openNoteModal({
                title:   label,
                content: hiddenInput.value,
                onSave: val => {
                    hiddenInput.value = val;
                    textEl.textContent = val || 'No note';
                    textEl.classList.toggle('empty', !val);
                    this._markDirty();
                },
            });
        });

        console.log('[Edit] _initModules complete');
    }

    //#endregion


    //#region Render Shell

    _render() {
        this._container.innerHTML = /*html*/`
            <div class="profile-subnav">
                <div class="psn-left">
                    <button class="psn-back" id="backBtn">← BACK</button>
                    <div class="psn-divider"></div>
                    <span class="psn-crumb">${this._isNew ? 'NEW PROFILE' : 'EDIT PROFILE'}</span>
                    <div class="psn-divider"></div>
                    <button class="psn-tab on" data-tab="identity">IDENTITY</button>
                    <button class="psn-tab"    data-tab="pool">POOL</button>
                    <button class="psn-tab"    data-tab="log">COMBINE LOG</button>
                    <button class="psn-tab"    data-tab="soft">SOFT SKILLS</button>
                    <button class="psn-tab"    data-tab="scouting">SCOUTING</button>
                    <button class="psn-tab"    data-tab="verdict">VERDICT</button>
                </div>
                <div class="psn-right">
                    <div class="psn-mode-indicator">
                        <span class="psn-mode-badge">VIEW</span>
                        <span class="psn-mode-badge on">EDIT</span>
                    </div>
                    ${!this._isNew ? `<button class="btn btn-ghost" id="deleteBtn" style="color:var(--no);border-color:rgba(242,92,92,.2)">DELETE</button>` : ''}
                </div>
            </div>

            <div class="profile-layout">
                <aside class="profile-sidebar">
                    ${this._renderVerdictSidebar()}
                </aside>
                <div class="profile-content">
                    <form id="prospectForm" novalidate>
                        ${this._renderIdentity()}
                        ${this._renderPool()}
                        ${this._renderCombineLog()}
                        ${this._renderSoftSkills()}
                        ${this._renderScouting()}
                        ${this._renderVerdict()}
                    </form>
                </div>
            </div>
        `;

        this._applyTab(this._activeTab);
        this._wireEvents();
    }

    //#endregion


    //#region Tab Show/Hide

    _applyTab(tab) {
        const tabs = ['identity','pool','log','soft','scouting','verdict'];
        tabs.forEach(t => {
            const el = this._container.querySelector(`#formSection-${t}`);
            if (el) el.style.display = t === tab ? '' : 'none';
        });
        this._container.querySelectorAll('.psn-tab').forEach(btn =>
            btn.classList.toggle('on', btn.dataset.tab === tab));
        this._activeTab = tab;
    }

    //#endregion


    //#region Verdict Sidebar

    _renderVerdictSidebar() {
        return /*html*/`
            <div class="verdict-panel" id="liveVerdictPanel">
                <div class="vp-eyebrow">LIVE EVALUATION</div>
                <div class="vp-score-block">
                    <div class="lvp-score">—</div>
                    <div class="lvp-raw" style="font-family:var(--f-mono);font-size:11px;margin-top:4px;letter-spacing:.5px"></div>
                    <div class="vp-score-label">ADJUSTED SCORE</div>
                </div>
                <div class="vp-grade-row">
                    <div class="vp-grade-block">
                        <div class="vp-sublabel">GRADE</div>
                        <div class="lvp-grade">—</div>
                    </div>
                    <div class="vp-decision-block">
                        <div class="vp-sublabel">DECISION</div>
                        <div class="lvp-decision rec rec-PENDING">PENDING</div>
                    </div>
                </div>
                <div class="vp-divider"></div>
                <div class="vp-axes">
                    <div class="vp-axis-row">
                        <div class="vp-axis-label">AXIS 1 <span class="vp-axis-sub">MECHANICS</span></div>
                        <div class="vp-axis-right">
                            <div class="bar"><div class="bar-fill lvp-bar-1" style="width:0%"></div></div>
                            <span class="bar-num lvp-val-1">—</span>
                        </div>
                    </div>
                    <div class="lvp-conf-1" style="font-size:10px;letter-spacing:.5px;text-align:right;margin-top:-4px;margin-bottom:6px"></div>
                    <div class="vp-axis-row">
                        <div class="vp-axis-label">AXIS 2 <span class="vp-axis-sub">COMP. IQ</span></div>
                        <div class="vp-axis-right">
                            <div class="bar"><div class="bar-fill lvp-bar-2" style="width:0%"></div></div>
                            <span class="bar-num lvp-val-2">—</span>
                        </div>
                    </div>
                    <div class="lvp-conf-2" style="font-size:10px;letter-spacing:.5px;text-align:right;margin-top:-4px;margin-bottom:6px"></div>
                    <div class="vp-axis-row">
                        <div class="vp-axis-label">SOFT SKILLS</div>
                        <div class="vp-axis-right">
                            <div class="bar"><div class="bar-fill lvp-bar-3" style="width:0%"></div></div>
                            <span class="bar-num lvp-val-3">—</span>
                        </div>
                    </div>
                </div>
                <div class="vp-divider"></div>
                <div class="vp-hint">Updates as you fill the form</div>
            </div>
        `;
    }

    //#endregion


    //#region Form Sections

    _renderIdentity() {
        return /*html*/`
            <div class="form-section" id="formSection-identity">
                <div class="fs-header">
                    <div class="fs-eyebrow">01 — IDENTITY</div>
                    <div class="fs-title">Player Profile</div>
                </div>
                <div class="field-grid-2">
                    <label class="field-label">Full Name<input name="candidateFullname" type="text" placeholder="First Last"></label>
                    <label class="field-label">Username / Riot ID<input name="candidateUsername" type="text" placeholder="Summoner#TAG"></label>
                    <label class="field-label">Role
                        <select name="role" class="field-select">
                            <option value="">— Select Role —</option>
                            <option value="TOP">TOP</option><option value="JG">JG</option>
                            <option value="MID">MID</option><option value="ADC">ADC</option>
                            <option value="SUP">SUP</option>
                        </select>
                    </label>
                    <label class="field-label">Region
                        <select name="region" class="field-select">
                            <option value="">— Select Region —</option>
                            <option value="NA">NA</option><option value="EUW">EUW</option>
                            <option value="EUNE">EUNE</option><option value="KR">KR</option>
                            <option value="LAN">LAN</option><option value="LAS">LAS</option>
                            <option value="OCE">OCE</option><option value="BR">BR</option>
                        </select>
                    </label>
                    <label class="field-label">Evaluated By<input name="evaluatedLastBy" type="text" placeholder="Coach name"></label>
                    <label class="field-label">Current Team<input name="currentTeam" type="text" placeholder="Team name or Free Agent"></label>
                    <label class="field-label">Current Rank<input name="currentRank" type="text" placeholder="e.g. Challenger 800LP"></label>
                    <label class="field-label">Peak Rank<input name="peakRank" type="text" placeholder="e.g. Challenger 1200LP"></label>
                    <label class="field-label">Previous Teams<input name="previousTeam" type="text" placeholder="Team A, Team B"></label>
                    <label class="field-label">Discord<input name="discord" type="text" placeholder="username"></label>
                    <label class="field-label">Twitter / X<input name="twitter" type="text" placeholder="@handle"></label>
                    <label class="field-label">Age<input name="age" type="number" placeholder="—" min="14" max="40"></label>
                    <label class="field-label field-col-2">Notable Achievements
                        <textarea name="achievement" placeholder="Tournaments, championships, notable placements…"></textarea>
                    </label>
                </div>
            </div>`;
    }

    _renderPool() {
        return /*html*/`
            <div class="form-section" id="formSection-pool">
                <div class="fs-header">
                    <div class="fs-eyebrow">02 — CHAMPION POOL</div>
                    <div class="fs-title">Pool & Performance</div>
                </div>
                <div class="table-wrap">
                    <table id="championPoolTable">
                        <thead><tr>
                            <th>Champion</th><th>G</th><th>W</th><th>L</th>
                            <th>Win%</th><th>KDA</th><th>CS/min</th><th>GD@15</th>
                            <th>Lobby</th><th>Opponent</th><th>Notes</th><th></th>
                        </tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
                <button type="button" id="addChampionBtn" class="btn btn-ghost table-add-btn">+ ADD CHAMPION</button>
            </div>`;
    }

    _renderCombineLog() {
        return /*html*/`
            <div class="form-section" id="formSection-log">
                <div class="fs-header">
                    <div class="fs-eyebrow">03 — COMBINE LOG</div>
                    <div class="fs-title">Performance Entries</div>
                </div>
                <div class="axis-legend">
                    <div class="axis-legend-item"><span class="axis-dot axis-dot-1"></span><span>Axis 1 — Mechanics / Execution</span></div>
                    <div class="axis-legend-item"><span class="axis-dot axis-dot-2"></span><span>Axis 2 — Competitive IQ</span></div>
                    <div class="axis-legend-item axis-scale">Scale: 1 = Below avg · 2 = Average · 3 = Above avg · 4 = Elite</div>
                </div>
                <div class="table-wrap">
                    <table id="combineLogTable">
                        <thead><tr>
                            <th>Lobby</th><th>Game #</th><th>Champion</th>
                            <th class="axis-col-1">Axis 1</th>
                            <th class="axis-col-2">Axis 2</th>
                            <th>Coach</th><th>Notes</th><th></th>
                        </tr></thead>
                        <tbody></tbody>
                    </table>
                </div>
                <button type="button" id="addCombineRowBtn" class="btn btn-ghost table-add-btn">+ ADD ENTRY</button>
            </div>`;
    }

    _renderSoftSkills() {
        return /*html*/`
            <div class="form-section" id="formSection-soft">
                <div class="fs-header">
                    <div class="fs-eyebrow">04 — SOFT SKILLS</div>
                    <div class="fs-title">Coachability & Character</div>
                </div>
                <div class="score-grid">
                    <div class="sg-head-label">CRITERIA</div>
                    <div class="sg-head-label">SCORE (1–4)</div>
                    <div class="sg-head-label">NOTES</div>
                    ${this._softRow('Coachability',            'Receptiveness to feedback',     'coachability',  'coachabilityNote')}
                    ${this._softRow('Communication',           'Shotcalling, comms quality',     'communication', 'communicationNote')}
                    ${this._softRow('Attitude Under Pressure', 'Tilt resistance, resilience',    'attitude',      'attitudeNote')}
                    ${this._softRow('Team Fit',                'Culture, synergy, adaptability', 'teamFit',       'teamFitNote')}
                    ${this._softRow('Self-Awareness',          'Understands own weaknesses',     'selfAwareness', 'selfAwarenessNote')}
                </div>
            </div>`;
    }

    _softRow(label, sub, scoreName, noteName) {
        const existingNote = this._prospect?.[noteName] || '';
        return /*html*/`
            <div class="sg-row-label">
                <div class="sg-main">${label}</div>
                <div class="sg-sub">${sub}</div>
            </div>
            <div class="sg-cell">
                <input type="number" name="${scoreName}" min="1" max="4" step="0.25" placeholder="1–4">
            </div>
            <div class="sg-cell sg-note-cell">
                <input type="hidden" name="${noteName}" value="${escAttr(existingNote)}">
                <div class="note-cell note-trigger"
                     data-soft-label="${label}"
                     data-note-name="${noteName}">
                    <span class="note-cell-text ${existingNote ? '' : 'empty'}">
                        ${existingNote ? escHtml(existingNote) : 'No note'}
                    </span>
                    <span class="note-cell-edit">EDIT</span>
                </div>
            </div>`;
    }

    _renderScouting() {
        const reports = this._prospect?.scoutingReports || [];
        return /*html*/`
            <div class="form-section" id="formSection-scouting">
                <div class="fs-header">
                    <div>
                        <div class="fs-eyebrow">05 — SCOUTING REPORTS</div>
                        <div class="fs-title">Coach & Scout Observations</div>
                    </div>
                    <button type="button" class="btn btn-ghost" id="addScoutBtn">+ ADD REPORT</button>
                </div>
                <div id="scoutingReportsContainer">
                    ${this._renderScoutingList(reports)}
                </div>
            </div>`;
    }

    _renderScoutingList(reports) {
        if (!reports.length) {
            return '<div class="card-empty" style="padding:24px">No reports yet. Add one above.</div>';
        }
        return reports.map((r, i) => /*html*/`
            <div class="scout-report-item">
                <div class="scout-report-header" data-scout-idx="${i}">
                    <div>
                        <div class="scout-report-coach">
                            ${r.isLegacy || !r.coach ? '<span class="scout-unclaimed">UNCLAIMED</span>' : r.coach}
                        </div>
                        <div class="scout-report-date">${r.date || '—'}</div>
                    </div>
                    <div class="scout-report-preview">${r.strengths || r.concerns || r.notes || 'No content'}</div>
                    <button type="button" class="scout-report-expand">EDIT ↓</button>
                </div>
                <div class="scout-report-body" id="scout-edit-${i}">
                    ${r.isLegacy ? /*html*/`
                        <div class="scout-claim-row">
                            <span class="scout-claim-label">Claim this report</span>
                            <input class="scout-claim-input" type="text" placeholder="Your name…" data-claim-idx="${i}" value="${r.coach || ''}">
                            <button type="button" class="scout-claim-btn" data-claim-idx="${i}">CLAIM</button>
                        </div>
                    ` : /*html*/`
                        <div class="field-grid-2" style="padding:0 0 16px">
                            <label class="field-label">Coach<input type="text" class="scout-field" data-idx="${i}" data-field="coach" value="${r.coach || ''}" placeholder="Coach name"></label>
                            <label class="field-label">Date<input type="text" class="scout-field" data-idx="${i}" data-field="date" value="${r.date || ''}" placeholder="e.g. Apr 5 · L-03"></label>
                        </div>
                    `}
                    <div class="scout-obs-grid">
                        ${this._scoutObsCard(i, 'strength',  '↑', 'Strengths',  'strengths',  r.strengths)}
                        ${this._scoutObsCard(i, 'concern',   '↓', 'Concerns',   'concerns',   r.concerns)}
                        ${this._scoutObsCard(i, 'highlight', '★', 'Highlights', 'highlights', r.highlights)}
                        ${this._scoutObsCard(i, 'notes',     '◈', 'Notes',      'notes',      r.notes)}
                    </div>
                    <div class="scout-report-footer">
                        <span class="scout-report-meta">Report ${i + 1} of ${reports.length}</span>
                        <button type="button" class="scout-remove-btn" data-remove-idx="${i}">Remove Report</button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    _scoutObsCard(idx, type, icon, label, field, content) {
        return /*html*/`
            <div class="scout-obs-card scout-obs-card--${type}">
                <div class="scout-obs-head">
                    <span class="scout-obs-icon">${icon}</span>
                    <span class="scout-obs-label">${label}</span>
                </div>
                <textarea class="scout-obs-textarea scout-field" data-idx="${idx}" data-field="${field}" placeholder="${label}…">${content || ''}</textarea>
            </div>`;
    }

    _renderVerdict() {
        return /*html*/`
            <div class="form-section form-section--verdict" id="formSection-verdict">
                <div class="fs-header">
                    <div class="fs-eyebrow">06 — FINAL VERDICT</div>
                    <div class="fs-title">Evaluation Summary</div>
                </div>
                <div class="verdict-scores-row">
                    <div class="vs-cell"><div class="vs-label">AXIS 1 AVG</div><input name="axis1Avg" type="text" readonly class="vs-input"></div>
                    <div class="vs-cell"><div class="vs-label">AXIS 2 AVG</div><input name="axis2Avg" type="text" readonly class="vs-input"></div>
                    <div class="vs-cell"><div class="vs-label">SOFT SKILLS</div><input name="softSkillsAvg" type="text" readonly class="vs-input"></div>
                    <div class="vs-cell vs-cell--highlight"><div class="vs-label">OVERALL SCORE</div><input name="overallScore" type="text" readonly class="vs-input vs-input--score"></div>
                    <div class="vs-cell"><div class="vs-label">GRADE</div><input name="letterGrade" type="text" readonly class="vs-input"></div>
                    <div class="vs-cell"><div class="vs-label">AUTO DECISION</div><input name="autoDecision" type="text" readonly class="vs-input vs-input--decision"></div>
                </div>
                <div class="written-rec-block">
                    <div class="wr-header">
                        <span class="wr-icon">✍</span>
                        <span class="wr-title">WRITTEN RECOMMENDATION</span>
                    </div>
                    <div class="field-grid-2">
                        <label class="field-label">Final Decision Override
                            <select name="finalDecisions" class="field-select">
                                <option value="">— Follow Auto Decision —</option>
                                <option value="SIGN">SIGN — Offer contract</option>
                                <option value="TRIAL">TRIAL — Extended evaluation</option>
                                <option value="FLAG">FLAG — Re-evaluate later</option>
                                <option value="NO">NO — Do not proceed</option>
                            </select>
                        </label>
                        <label class="field-label">Ceiling Assessment
                            <select name="ceilingAssessment" class="field-select">
                                <option value="">— Select ceiling —</option>
                                <option value="Pro League Contender">Pro League Contender</option>
                                <option value="Academy Level">Academy Level</option>
                                <option value="Amateur Competitive">Amateur Competitive</option>
                                <option value="Developmental">Developmental</option>
                                <option value="Unknown">Unknown — Needs more data</option>
                            </select>
                        </label>
                        <label class="field-label field-col-2">Written Recommendation
                            <textarea name="writtenRecommendation" class="rec-textarea" placeholder="Full written assessment…"></textarea>
                        </label>
                        <label class="field-label">Follow-Up Action<input name="followUpAction" type="text" placeholder="e.g. Schedule 1-on-1 VOD review"></label>
                        <label class="field-label">Follow-Up Date<input name="followUpDate" type="date"></label>
                    </div>
                </div>
            </div>`;
    }

    //#endregion


    //#region Save

    async _save() {
        if (this._isSaving) return;
        this._isSaving = true;
        setSaveStatus('saving');
        setSaveBtnLoading(true);

        try {
            const data = collectProspectData();
            data.scoutingReports = this._prospect.scoutingReports || [];
            calculateProfileStats(data, this._allProspects);

            if (this._isNew) {
                this._id    = await createProspect(data);
                this._isNew = false;
                this._clearDirty();
                setSaveStatus('saved');
                setTimeout(() => navigate(`/prospects/${this._id}`), 500);
            } else {
                await updateProspect(this._id, data);
                this._clearDirty();
                setSaveStatus('saved');
                setTimeout(() => { if (!this._isDirty) setSaveStatus('idle'); }, 2000);
            }
        } catch (err) {
            console.error('Save failed:', err);
            setSaveStatus('error');
            alert('Save failed — ' + err.message);
            this._isDirty = true;
        } finally {
            this._isSaving = false;
            setSaveBtnLoading(false);
        }
    }

    async _handleLeaveAndSave() {
        await this._save();
        if (!this._isDirty) {
            navigate(this._isNew ? '/prospects' : `/prospects/${this._id}`);
        }
    }

    async _runAutoSave() {
        if (!this._id || this._isSaving) return;
        const form = this._container?.querySelector('#prospectForm');
        if (!form) return;
        const hasName = form.querySelector('[name="candidateFullname"]')?.value?.trim()
                     || form.querySelector('[name="candidateUsername"]')?.value?.trim();
        if (!hasName) return;

        this._isSaving = true;
        setSaveStatus('saving');
        try {
            const data = collectProspectData();
            data.scoutingReports = this._prospect.scoutingReports || [];
            calculateProfileStats(data, this._allProspects);
            await updateProspect(this._id, data);
            this._clearDirty();
            setSaveStatus('saved');
            setTimeout(() => { if (!this._isDirty) setSaveStatus('idle'); }, 2000);
        } catch (err) {
            setSaveStatus('error');
            this._isDirty = true;
        } finally {
            this._isSaving = false;
        }
    }

    _markDirty() {
        this._isDirty = true;
        setSaveStatus('dirty');
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
        if (this._id) {
            this._autoSaveTimer = setTimeout(
                () => this._runAutoSave(),
                ProspectEditView.AUTOSAVE_DELAY
            );
        }
    }

    _clearDirty() {
        this._isDirty = false;
        if (this._autoSaveTimer) clearTimeout(this._autoSaveTimer);
        this._autoSaveTimer = null;
    }

    //#endregion


    //#region Events

    _wireEvents() {
        const on = (el, type, fn) => {
            if (!el) return;
            el.addEventListener(type, fn);
            this._handlers.push({ el, type, fn });
        };

        on(this._container.querySelector('#backBtn'),   'click', () => this._handleCancel());
        on(this._container.querySelector('#deleteBtn'), 'click', () => this._handleDelete());

        on(this._container, 'click', e => {
            const tab = e.target.closest('.psn-tab');
            if (!tab) return;
            this._applyTab(tab.dataset.tab);
        });
    }

    _wireScoutingEvents() {
        const c = this._container;
        if (!c) return;

        c.querySelectorAll('.scout-report-header').forEach(header => {
            header.addEventListener('click', () => {
                const idx    = header.dataset.scoutIdx;
                const body   = c.querySelector(`#scout-edit-${idx}`);
                const btn    = header.querySelector('.scout-report-expand');
                const isOpen = body?.classList.contains('open');
                c.querySelectorAll('.scout-report-body').forEach(b => b.classList.remove('open'));
                c.querySelectorAll('.scout-report-expand').forEach(b => b.textContent = 'EDIT ↓');
                if (!isOpen && body) { body.classList.add('open'); btn.textContent = 'CLOSE ↑'; }
            });
        });

        c.querySelectorAll('.scout-claim-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx   = Number(btn.dataset.claimIdx);
                const input = c.querySelector(`.scout-claim-input[data-claim-idx="${idx}"]`);
                const name  = input?.value?.trim();
                if (!name) { alert('Enter your name to claim this report.'); return; }
                const report    = this._prospect.scoutingReports[idx];
                report.coach    = name;
                report.isLegacy = false;
                this._refreshScoutingContainer();
                this._markDirty();
            });
        });

        c.querySelectorAll('.scout-field').forEach(field => {
            field.addEventListener('input', () => {
                const idx = Number(field.dataset.idx);
                const key = field.dataset.field;
                if (this._prospect.scoutingReports?.[idx]) {
                    this._prospect.scoutingReports[idx][key] = field.value;
                }
                this._markDirty();
            });
        });

        c.querySelectorAll('.scout-remove-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idx = Number(btn.dataset.removeIdx);
                const confirmed = await showConfirmModal({
                    title:   'Remove this report?',
                    message: 'This cannot be undone.',
                    confirm: 'REMOVE',
                    danger:  true,
                });
                if (!confirmed) return;
                this._prospect.scoutingReports.splice(idx, 1);
                this._refreshScoutingContainer();
                this._markDirty();
            });
        });
    }

    _addScoutingReport() {
        const report = createScoutingInput();
        if (!this._prospect.scoutingReports) this._prospect.scoutingReports = [];
        this._prospect.scoutingReports.push(report);
        this._refreshScoutingContainer();
        this._markDirty();
    }

    _refreshScoutingContainer() {
        const container = this._container.querySelector('#scoutingReportsContainer');
        if (!container) return;
        container.innerHTML = this._renderScoutingList(this._prospect.scoutingReports || []);
        this._wireScoutingEvents();
    }

    async _handleCancel() {
        if (this._isDirty) {
            const confirmed = await showConfirmModal({
                title:   'Leave without saving?',
                message: 'Your changes will be lost.',
                confirm: 'DISCARD & LEAVE',
                cancel:  'STAY',
                danger:  true,
            });
            if (!confirmed) return;
        }
        this._clearDirty();
        navigate(this._isNew ? '/prospects' : `/prospects/${this._id}`);
    }

    async _handleDelete() {
        const confirmed = await showConfirmModal({
            title:   'Delete this profile?',
            message: 'This cannot be undone.',
            confirm: 'DELETE',
            cancel:  'CANCEL',
            danger:  true,
        });
        if (!confirmed) return;
        try {
            await deleteProspect(this._id);
            navigate('/prospects');
        } catch (err) {
            alert('Delete failed — ' + err.message);
        }
    }

    //#endregion

}