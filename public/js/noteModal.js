/**
 * noteModal.js
 * @version 1.0.1
 */


//#region State
let _modal   = null;
let _overlay = null;
let _built   = false;
//#endregion


//#region Public API

export function openNoteModal({ title = 'Note', content = '', onSave = null }) {
    _ensureBuilt();

    const isEdit = typeof onSave === 'function';

    _modal.querySelector('#nmTitle').textContent = title;

    const modeEl = _modal.querySelector('#nmMode');
    modeEl.textContent = isEdit ? 'EDIT' : 'VIEW';
    modeEl.className   = `nm-mode-badge ${isEdit ? 'nm-mode-edit' : 'nm-mode-view'}`;

    const textarea = _modal.querySelector('#nmTextarea');
    const readEl   = _modal.querySelector('#nmReadText');

    if (isEdit) {
        textarea.value         = content;
        textarea.style.display = '';
        readEl.style.display   = 'none';
    } else {
        readEl.textContent     = content || 'No notes recorded.';
        readEl.style.display   = '';
        textarea.style.display = 'none';
    }

    const saveBtn   = _modal.querySelector('#nmSaveBtn');
    const cancelBtn = _modal.querySelector('#nmCancelBtn');

    saveBtn.style.display = isEdit ? '' : 'none';
    cancelBtn.textContent = isEdit ? 'CANCEL' : 'CLOSE';

    // Replace save button to remove stale listeners
    if (isEdit) {
        const newBtn = saveBtn.cloneNode(true);
        saveBtn.parentNode.replaceChild(newBtn, saveBtn);
        _modal.querySelector('#nmSaveBtn').addEventListener('click', () => {
            onSave(textarea.value.trim());
            _close();
        });
    }

    _overlay.classList.add('open');
    if (isEdit) textarea.focus();
}

//#endregion


//#region Private

function _ensureBuilt() {
    if (_built) return;
    _built = true;

    _overlay = document.createElement('div');
    _overlay.id        = 'noteModalOverlay';
    _overlay.className = 'nm-overlay';
    _overlay.innerHTML = /*html*/`
        <div class="nm-box" id="noteModal">
            <div class="nm-header">
                <div class="nm-header-left">
                    <span class="nm-title" id="nmTitle">Note</span>
                    <span class="nm-mode-badge nm-mode-view" id="nmMode">VIEW</span>
                </div>
                <button class="nm-close-btn" id="nmCloseBtn">✕</button>
            </div>
            <div class="nm-body">
                <div class="nm-read-text" id="nmReadText"></div>
                <textarea class="nm-textarea" id="nmTextarea" placeholder="Write your note…"></textarea>
            </div>
            <div class="nm-footer">
                <button class="btn btn-ghost" id="nmCancelBtn">CLOSE</button>
                <button class="btn btn-cta"   id="nmSaveBtn">◈ SAVE NOTE</button>
            </div>
        </div>
    `;

    document.body.appendChild(_overlay);
    _modal = _overlay.querySelector('#noteModal');

    document.getElementById('nmCloseBtn').addEventListener('click',  _close);
    document.getElementById('nmCancelBtn').addEventListener('click', _close);
    _overlay.addEventListener('click', e => { if (e.target === _overlay) _close(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _overlay.classList.contains('open')) _close();
    });
}

function _close() {
    _overlay?.classList.remove('open');
}

//#endregion