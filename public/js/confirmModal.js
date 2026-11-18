/**
 * confirmModal.js
 * @version 1.0.0
 *
 * Styled confirmation modal — returns a Promise<boolean>.
 *
 * Usage:
 *   const confirmed = await showConfirmModal({
 *       title:   'Leave without saving?',
 *       message: 'Your changes will be lost.',
 *       confirm: 'DISCARD & LEAVE',
 *       cancel:  'STAY',
 *       danger:  true,
 *   });
 *   if (confirmed) { ... }
 */


//#region State
let _overlay = null;
let _built   = false;
//#endregion


//#region Public API

export function showConfirmModal({
    title   = 'Are you sure?',
    message = '',
    confirm = 'CONFIRM',
    cancel  = 'CANCEL',
    danger  = false,
}) {
    _ensureBuilt();

    return new Promise(resolve => {
        _overlay.querySelector('#cmTitle').textContent   = title;
        _overlay.querySelector('#cmMessage').textContent = message;

        const confirmBtn = _overlay.querySelector('#cmConfirmBtn');
        const cancelBtn  = _overlay.querySelector('#cmCancelBtn');

        confirmBtn.textContent = confirm;
        cancelBtn.textContent  = cancel;
        confirmBtn.className   = `btn ${danger ? 'btn-confirm-danger' : 'btn-cta'}`;

        // Clone to strip stale listeners
        const newConfirm = confirmBtn.cloneNode(true);
        const newCancel  = cancelBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
        cancelBtn.parentNode.replaceChild(newCancel,  cancelBtn);

        _overlay.querySelector('#cmConfirmBtn').addEventListener('click', () => {
            _close(); resolve(true);
        });
        _overlay.querySelector('#cmCancelBtn').addEventListener('click', () => {
            _close(); resolve(false);
        });

        _overlay.classList.add('open');
    });
}

//#endregion


//#region Private

function _ensureBuilt() {
    if (_built) return;
    _built = true;

    _overlay = document.createElement('div');
    _overlay.id        = 'confirmModalOverlay';
    _overlay.className = 'cm-overlay';
    _overlay.innerHTML = /*html*/`
        <div class="cm-box">
            <div class="cm-header">
                <div class="cm-title" id="cmTitle">Are you sure?</div>
            </div>
            <div class="cm-body">
                <div class="cm-message" id="cmMessage"></div>
            </div>
            <div class="cm-footer">
                <button class="btn btn-ghost"       id="cmCancelBtn">CANCEL</button>
                <button class="btn btn-confirm-danger" id="cmConfirmBtn">CONFIRM</button>
            </div>
        </div>
    `;

    document.body.appendChild(_overlay);

    _overlay.addEventListener('click', e => {
        if (e.target === _overlay) { _close(); }
    });

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && _overlay.classList.contains('open')) _close();
    });
}

function _close() {
    _overlay?.classList.remove('open');
}

//#endregion