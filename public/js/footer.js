/**
 * footer.js
 * @version 1.1.0
 */


//#region State
let _onSave        = null;
let _onCancel      = null;
let _onLeaveAndSave = null;
//#endregion


//#region Constants
const STATUS_CONFIG = {
    idle:   { dot: 'ssb-dot-saved',   text: 'All changes saved'       },
    dirty:  { dot: 'ssb-dot-unsaved', text: 'Unsaved changes'         },
    saving: { dot: 'ssb-dot-saving',  text: 'Saving…'                 },
    saved:  { dot: 'ssb-dot-saved',   text: 'Saved'                   },
    error:  { dot: 'ssb-dot-error',   text: 'Save failed — try again' },
};
//#endregion


//#region Public API

/**
 * Build the sticky footer bar.
 * Call once from app.js on init.
 */
export function buildStickyFooter({ onSave, onCancel, onLeaveAndSave }) {
    if (document.getElementById('stickyFooter')) return;

    _onSave         = onSave;
    _onCancel       = onCancel;
    _onLeaveAndSave = onLeaveAndSave;

    const bar = document.createElement('div');
    bar.id        = 'stickyFooter';
    bar.className = 'sticky-save-bar hidden';
    bar.innerHTML = /*html*/`
        <div class="ssb-left">
            <span class="ssb-status-dot ssb-dot-saved" id="ssbDot"></span>
            <span class="ssb-status-text"              id="ssbText">All changes saved</span>
        </div>
        <div class="ssb-right">
            <button type="button" class="btn btn-ghost" id="ssbCancelBtn">CANCEL</button>
            <button type="button" class="btn btn-ghost" id="ssbLeaveBtn">LEAVE & SAVE</button>
            <button type="button" class="btn btn-cta"   id="ssbSaveBtn">◈ SAVE PROFILE</button>
        </div>
    `;

    document.body.appendChild(bar);

    document.getElementById('ssbCancelBtn').addEventListener('click',  () => _onCancel?.());
    document.getElementById('ssbLeaveBtn').addEventListener('click',   () => _onLeaveAndSave?.());
    document.getElementById('ssbSaveBtn').addEventListener('click',    () => _onSave?.());
}

/**
 * Visibility
 */
export function showStickyFooter() {
    document.getElementById('stickyFooter')?.classList.remove('hidden');
}

export function hideStickyFooter() {
    document.getElementById('stickyFooter')?.classList.add('hidden');
}

/**
 * Status indicator
 */
export function setSaveStatus(status) {
    const dot  = document.getElementById('ssbDot');
    const text = document.getElementById('ssbText');
    if (!dot || !text) return;

    const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle;
    dot.className    = `ssb-status-dot ${config.dot}`;
    text.textContent = config.text;
}

/**
 * Save button loading state
 */
export function setSaveBtnLoading(loading) {
    const btn = document.getElementById('ssbSaveBtn');
    if (!btn) return;
    btn.disabled    = loading;
    btn.textContent = loading ? 'Saving…' : '◈ SAVE PROFILE';
}

//#endregion