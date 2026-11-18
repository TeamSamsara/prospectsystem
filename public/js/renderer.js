/**
 * renderer.js
 * @version 1.0.0
 *
 * Shared rendering primitives used across all views.
 * No domain-specific logic — pure DOM utilities.
 */


//#region Sanitization

/**
 * Escapes a string for safe use inside innerHTML.
 */
export function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Escapes a string for safe use inside HTML attribute values.
 */
export function escAttr(str) {
    return String(str ?? '')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

//#endregion


//#region Tagged Template

/**
 * Tagged template literal for building HTML strings.
 * Automatically escapes interpolated values.
 *
 * Usage:
 *   const markup = html`<div>${player.name}</div>`
 *
 * To inject trusted raw HTML:
 *   const markup = html`<div>${html.raw(innerMarkup)}</div>`
 */
export function html(strings, ...values) {
    return strings.reduce((result, str, i) => {
        const value = values[i - 1];
        if (value instanceof RawHtml) return result + value.content + str;
        return result + escHtml(value ?? '') + str;
    });
}

class RawHtml {
    constructor(content) { this.content = content; }
}

html.raw = content => new RawHtml(content);

//#endregion


//#region DOM

/**
 * Clears a container and sets new content.
 * Accepts a string or an HTMLElement.
 */
export function render(container, content) {
    container.innerHTML = '';
    if (typeof content === 'string') {
        container.innerHTML = content;
    } else {
        container.appendChild(content);
    }
}

/**
 * Creates a DOM element with optional props and innerHTML.
 */
export function createElement(tag, props = {}, innerHTML = '') {
    const el = document.createElement(tag);
    if (props.className) el.className = props.className;
    if (props.id)        el.id        = props.id;
    if (props.style)     Object.assign(el.style, props.style);
    if (props.dataset)   Object.assign(el.dataset, props.dataset);
    for (const [key, val] of Object.entries(props)) {
        if (['className','id','style','dataset'].includes(key)) continue;
        el.setAttribute(key, val);
    }
    if (innerHTML) el.innerHTML = innerHTML;
    return el;
}

//#endregion


//#region State Displays

/**
 * Renders a loading state into a container.
 */
export function renderLoading(container, message = 'Loading…') {
    container.innerHTML = `
        <div class="state-display state-display--loading">
            <div class="state-display-icon">◈</div>
            <div class="state-display-text">${escHtml(message)}</div>
        </div>`;
}

/**
 * Renders an empty state into a container.
 */
export function renderEmpty(container, message = 'Nothing here yet.', sub = '') {
    container.innerHTML = `
        <div class="state-display state-display--empty">
            <div class="state-display-icon">◈</div>
            <div class="state-display-text">${escHtml(message)}</div>
            ${sub ? `<div class="state-display-sub">${escHtml(sub)}</div>` : ''}
        </div>`;
}

/**
 * Renders an error state into a container.
 */
export function renderError(container, message = 'Something went wrong.') {
    container.innerHTML = `
        <div class="state-display state-display--error">
            <div class="state-display-icon">✕</div>
            <div class="state-display-text">${escHtml(message)}</div>
        </div>`;
}

//#endregion