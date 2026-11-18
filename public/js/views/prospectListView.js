/**
 * prospectListView.js
 * @version 2.0.0
 *
 * Changes from 1.0.0:
 *   - Fetches all prospects once, passes to calculateProfileStats for SOS
 *   - New flex-based row layout:
 *     Rank | Player | Role | [A1] [A2] [SS] | RAW -> ADJ delta | Confidence | Decision
 *   - Axis values as monospace numbers
 *   - Game count colored yellow when < 3
 *   - Raw and adjusted shown side by side with delta
 *   - Confidence percentage derived from axis1Confidence
 */


//#region Imports
import { navigate                              } from '../router.js';
import { renderError                           } from '../renderer.js';
import { fetchAllProspects, deleteProspect     } from '../prospect/prospectRepository.js';
import { calculateProfileStats                 } from '../formulas.js';
import { initList, setListData                 } from '../prospect/prospectList.js';
//#endregion


export class ProspectListView {

    //#region State
    _container = null;
    //#endregion


    //#region Lifecycle

    async mount(container) {
        this._container = container;
        this._render();
        await this._loadData();
    }

    unmount() {
        this._container = null;
    }

    //#endregion


    //#region Render

    _render() {
        this._container.innerHTML = /*html*/`

            <!-- SPILL BAR -->
            <div class="spill-bar">
                <div class="spill">
                    <div class="spill-lbl">TOTAL</div>
                    <div class="spill-val" id="statTotal">—</div>
                </div>
                <div class="spill">
                    <div class="spill-lbl">SIGN</div>
                    <div class="spill-val" style="color:var(--pass)" id="statSign">—</div>
                </div>
                <div class="spill">
                    <div class="spill-lbl">TRIAL</div>
                    <div class="spill-val" style="color:var(--flag)" id="statTrial">—</div>
                </div>
                <div class="spill">
                    <div class="spill-lbl">FLAG</div>
                    <div class="spill-val" style="color:var(--gold)" id="statFlag">—</div>
                </div>
                <div class="spill">
                    <div class="spill-lbl">NO</div>
                    <div class="spill-val" style="color:var(--no)" id="statNo">—</div>
                </div>
                <div class="spill">
                    <div class="spill-lbl">PENDING</div>
                    <div class="spill-val" id="statPending">—</div>
                </div>
            </div>

            <!-- ROLE BAR -->
            <div class="role-bar">
                <div class="role-stat">
                    <span class="role-stat-pill top">TOP</span>
                    <div>
                        <div class="role-stat-count" id="roleTop">—</div>
                        <div class="role-stat-lbl">prospects</div>
                    </div>
                </div>
                <div class="role-stat">
                    <span class="role-stat-pill jg">JG</span>
                    <div>
                        <div class="role-stat-count" id="roleJg">—</div>
                        <div class="role-stat-lbl">prospects</div>
                    </div>
                </div>
                <div class="role-stat">
                    <span class="role-stat-pill mid">MID</span>
                    <div>
                        <div class="role-stat-count" id="roleMid">—</div>
                        <div class="role-stat-lbl">prospects</div>
                    </div>
                </div>
                <div class="role-stat">
                    <span class="role-stat-pill adc">ADC</span>
                    <div>
                        <div class="role-stat-count" id="roleAdc">—</div>
                        <div class="role-stat-lbl">prospects</div>
                    </div>
                </div>
                <div class="role-stat">
                    <span class="role-stat-pill sup">SUP</span>
                    <div>
                        <div class="role-stat-count" id="roleSup">—</div>
                        <div class="role-stat-lbl">prospects</div>
                    </div>
                </div>
            </div>

            <!-- TOOLBAR -->
            <div class="list-toolbar">
                <div class="tb-left">
                    <input type="text" id="listSearch" class="search-input" placeholder="Search prospects…">
                    <div class="chip-sep"></div>
                    <button class="chip on"           data-role="ALL">ALL</button>
                    <button class="chip top"          data-role="TOP">TOP</button>
                    <button class="chip jg"           data-role="JG">JG</button>
                    <button class="chip mid"          data-role="MID">MID</button>
                    <button class="chip adc"          data-role="ADC">ADC</button>
                    <button class="chip sup"          data-role="SUP">SUP</button>
                    <div class="chip-sep"></div>
                    <button class="chip chip-sign"    data-decision="SIGN">SIGN</button>
                    <button class="chip chip-trial"   data-decision="TRIAL">TRIAL</button>
                    <button class="chip chip-flag"    data-decision="FLAG">FLAG</button>
                    <button class="chip chip-no"      data-decision="NO">NO</button>
                    <button class="chip chip-pending" data-decision="PENDING">PENDING</button>
                    <span class="filter-count" id="filterCount"></span>
                </div>
                <div class="tb-right">
                    <button class="btn btn-cta" id="createProspectBtn">◈ NEW PROSPECT</button>
                </div>
            </div>

            <!-- LIST HEADER -->
            <div class="prospect-list-header">
                <div class="plh-rank">#</div>
                <div class="plh-player">PLAYER</div>
                <div class="plh-axes">AXES</div>
                <div class="plh-score">SCORE</div>
                <div class="plh-conf">CONF</div>
                <div class="plh-decision">DECISION</div>
                <div class="plh-actions"></div>
            </div>

            <!-- LIST -->
            <ul class="prospect-list" id="profileList">
                <div class="state-display">
                    <div class="state-display-icon">◈</div>
                    <div class="state-display-text">Loading prospects…</div>
                </div>
            </ul>
        `;

        initList({
            listEl:   this._container.querySelector('#profileList'),
            onView:   id => navigate(`/prospects/${id}`),
            onEdit:   id => navigate(`/prospects/${id}/edit`),
            onDelete: id => this._deleteProspect(id),
        });

        this._container.querySelector('#createProspectBtn')
            ?.addEventListener('click', () => navigate('/prospects/new/edit'));
    }

    //#endregion


    //#region Data

    async _loadData() {
        try {
            const docs = await fetchAllProspects();

            // Pass full list for SOS resolution
            docs.forEach(({ data }) => calculateProfileStats(data, docs));

            docs.sort((a, b) =>
                (Number(b.data.adjustedScore) || 0) - (Number(a.data.adjustedScore) || 0));

            setListData(docs);
        } catch (err) {
            console.error('Failed to load prospects:', err);
            renderError(
                this._container.querySelector('#profileList'),
                `Could not load data — ${err.message}`
            );
        }
    }

    async _deleteProspect(id) {
        if (!confirm('Delete this profile? This cannot be undone.')) return;
        try {
            await deleteProspect(id);
            await this._loadData();
        } catch (err) {
            alert('Delete failed — ' + err.message);
        }
    }

    //#endregion

}