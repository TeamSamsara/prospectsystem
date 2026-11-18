/**
 * form.js
 * @version 1.1.0
 *
 * Generic form utilities.
 * No knowledge of any specific data model.
 * escHtml / escAttr live in renderer.js — import from there.
 */


//#region Imports
import { escHtml, escAttr } from '/js/renderer.js';
//#endregion


//#region Public API

export { escHtml, escAttr };

/**
 * Populates a form with flat key/value data.
 * Skips arrays, objects, and null — only sets strings and numbers.
 */
export function populateForm(formEl, data) {
    for (const key in data) {
        const value = data[key];
        if (typeof value !== 'string' && typeof value !== 'number') continue;
        const el = formEl.querySelector(`[name="${key}"]`);
        if (el) el.value = value;
    }
}

/**
 * Reads a form and returns a flat key/value object.
 */
export function collectForm(formEl) {
    return Object.fromEntries(new FormData(formEl).entries());
}

/**
 * Resets a form to its default state.
 */
export function resetForm(formEl) {
    formEl.reset();
}

//#endregion