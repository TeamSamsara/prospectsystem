/**
 * authGuard.js
 * @version 1.0.1
 *
 * Route protection layer.
 * All permission checks flow through session.userProfile —
 * the session is the container, userProfile is the identity.
 *
 * can(session.userProfile, P.*) is the correct call pattern everywhere.
 */

import { getSession        } from './authService.js';
import { navigate          } from '../router.js';
import { can               } from './permissions.js';
import { P                 } from './permissions.js';


//#region Route Permissions

const ROUTE_PERMISSIONS = {
    '/':                     null,
    '/prospects':            null,
    '/prospects/new/edit':   P.PROSPECTS_WRITE,
    '/prospects/:id':        P.PROSPECTS_READ,
    '/prospects/:id/edit':   P.PROSPECTS_WRITE,
    '/interviews':           P.INTERVIEWS_READ,
    '/combine':              P.COMBINES_READ,
    '/lobby':                P.LOBBY_READ,
    '/admin':                P.ADMIN_ACCESS,
};

const PUBLIC_ROUTES  = ['/login', '/setup'];
const LOGIN_ROUTE    = '/login';
const SETUP_ROUTE    = '/setup';
const DEFAULT_ROUTE  = '/prospects';

//#endregion


//#region Public API

/**
 * guardRoute(path)
 *
 * Called before every route mount.
 * All checks flow through session first, then session.userProfile.
 *
 * @param {string} path
 * @returns {string} path to actually mount (may be a redirect)
 */
export function guardRoute(path) {
    // Public routes always allowed
    if (PUBLIC_ROUTES.some(r => path.startsWith(r))) return path;

    const session = getSession();

    // Not authenticated — send to login
    if (!session.isAuthenticated) return LOGIN_ROUTE;

    // First login not completed — send to setup
    if (session.userProfile?.isFirstLogin) return SETUP_ROUTE;

    // Check route-specific permission via session.userProfile
    const requiredPermission = _resolvePermission(path);
    if (requiredPermission && !can(session.userProfile, requiredPermission)) {
        return DEFAULT_ROUTE;
    }

    return path;
}

/**
 * requirePermission(permission)
 *
 * Inline guard for use inside view mount() methods.
 * Checks session first, then delegates to session.userProfile for the permission check.
 *
 * @param {string} permission — one of P.*
 * @returns {boolean}
 */
export function requirePermission(permission) {
    const session = getSession();

    if (!session.isAuthenticated) {
        navigate(LOGIN_ROUTE);
        return false;
    }

    if (!can(session.userProfile, permission)) {
        navigate(DEFAULT_ROUTE);
        return false;
    }

    return true;
}

/**
 * requireAuth()
 *
 * Checks session is authenticated and first login is complete.
 * Returns session if valid, navigates away and returns null if not.
 *
 * @returns {Object|null}
 */
export function requireAuth() {
    const session = getSession();

    if (!session.isAuthenticated) {
        navigate(LOGIN_ROUTE);
        return null;
    }

    if (session.userProfile?.isFirstLogin) {
        navigate(SETUP_ROUTE);
        return null;
    }

    return session;
}

//#endregion


//#region Private

function _resolvePermission(path) {
    if (ROUTE_PERMISSIONS[path] !== undefined) return ROUTE_PERMISSIONS[path];

    for (const [pattern, permission] of Object.entries(ROUTE_PERMISSIONS)) {
        if (_matchesPattern(path, pattern)) return permission;
    }

    return null;
}

function _matchesPattern(path, pattern) {
    const regex = new RegExp(
        '^' +
        pattern
            .replace(/\//g, '\\/')
            .replace(/:([a-zA-Z]+)/g, '[^\\/]+') +
        '\\/?$'
    );
    return regex.test(path);
}

//#endregion