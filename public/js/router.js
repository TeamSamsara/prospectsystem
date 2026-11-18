/**
 * router.js
 * @version 1.1.0
 *
 * History API router.
 * Matches the current URL, mounts the correct view into the outlet,
 * and unmounts the previous one cleanly.
 *
 * Supports an optional beforeMount hook for auth guards —
 * if the hook returns a different path, the router silently
 * redirects before mounting.
 */


//#region State
let _currentView  = null;
let _routes       = [];
let _outlet       = null;
let _notFoundView = null;
let _beforeMount  = null;
//#endregion


//#region Public API

/**
 * Initialize the router.
 *
 * @param {Object}   options
 * @param {Element}  options.outlet       — DOM element to mount views into
 * @param {Array}    options.routes       — [{ path, view }]
 * @param {Function} [options.notFound]   — view class to mount when no route matches
 * @param {Function} [options.beforeMount] — (path: string) => string
 *                                          Called before mounting any view.
 *                                          Return a different path to redirect.
 *                                          Return the same path to allow.
 */
export function initRouter({ outlet, routes, notFound = null, beforeMount = null }) {
    _outlet       = outlet;
    _notFoundView = notFound;
    _beforeMount  = beforeMount;

    _routes = routes.map(r => ({
        ...r,
        pattern: _pathToPattern(r.path),
    }));

    // Handle browser back/forward
    window.addEventListener('popstate', () => _resolve());

    // Intercept all internal link clicks
    document.addEventListener('click', e => {
        const link = e.target.closest('[data-link]');
        if (!link) return;
        e.preventDefault();
        navigate(link.getAttribute('href'));
    });

    // Resolve initial URL
    _resolve();
}

/**
 * Navigate to a path programmatically.
 *
 * @param {string}  path
 * @param {boolean} [replace] — use replaceState instead of pushState
 */
export function navigate(path, replace = false) {
    if (replace) {
        window.history.replaceState(null, '', path);
    } else {
        window.history.pushState(null, '', path);
    }
    _resolve();
}

/**
 * Navigate back.
 */
export function goBack() {
    window.history.back();
}

//#endregion


//#region Private

/**
 * Resolve current URL to a route and mount the view.
 * If beforeMount is set, runs the guard first and redirects if needed.
 */
function _resolve() {
    let path = window.location.pathname;

    // Run auth guard — may redirect to a different path
    if (_beforeMount) {
        const guardedPath = _beforeMount(path);
        if (guardedPath !== path) {
            window.history.replaceState(null, '', guardedPath);
            path = guardedPath;
        }
    }

    for (const route of _routes) {
        const params = _match(path, route.pattern);
        if (params !== null) {
            _mount(route.view, params);
            return;
        }
    }

    // No match
    if (_notFoundView) {
        _mount(_notFoundView, {});
    } else {
        console.warn(`[Router] No route matched for: ${path}`);
    }
}

/**
 * Unmount current view and mount the new one.
 */
function _mount(ViewClass, params) {
    if (_currentView) {
        _currentView.unmount();
        _currentView = null;
    }

    _outlet.innerHTML = '';

    _currentView = new ViewClass();
    _currentView.mount(_outlet, params);
}

/**
 * Convert a route path string to a regex pattern with named params.
 * e.g. '/prospects/:id/edit' → { regex, keys: ['id'] }
 */
function _pathToPattern(path) {
    const keys  = [];
    const regex = new RegExp(
        '^' +
        path
            .replace(/\//g, '\\/')
            .replace(/:([a-zA-Z]+)/g, (_, key) => {
                keys.push(key);
                return '([^\\/]+)';
            }) +
        '\\/?$'
    );
    return { regex, keys };
}

/**
 * Try to match a path against a pattern.
 * Returns params object if matched, null if not.
 */
function _match(path, { regex, keys }) {
    const match = path.match(regex);
    if (!match) return null;

    const params = {};
    keys.forEach((key, i) => {
        params[key] = decodeURIComponent(match[i + 1]);
    });
    return params;
}

//#endregion