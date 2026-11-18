/**
 * main.js
 * @version 1.0.0
 *
 * App entry point.
 * Reads the current route and initializes the correct UI module.
 * No page logic lives here.
 */


//#region Route Map
const ROUTES = {
    '/':                   () => import('./prospect/prospectUI.js'),
    '/index.html':         () => import('./prospect/prospectUI.js'),
    '/interviews.html':    () => import('./interview/interviewUI.js'),
    '/combine.html':       () => import('./combine/combine-ui.js'),
    '/lobby-codes.html':   () => import('./lobby/lobby-codes-ui.js'),
};
//#endregion


//#region Init
(function init() {
    const path   = window.location.pathname;
    const loader = ROUTES[path];

    if (loader) {
        loader().catch(err => console.error(`Failed to load module for ${path}:`, err));
    } else {
        console.warn(`No route matched for path: ${path}`);
    }
})();
//#endregion