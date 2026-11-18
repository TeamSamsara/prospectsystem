/**
 * permissions.js
 * @version 1.0.0
 * 
 * Defines all valid permissions as composable domain:operation strings
 * Each permissions are 100% role agnostic
 * Permissions only know about what actions exist and how to check them against a user
 * 
 * Usage:
 * import {P, can, canAll, canAny} from '/js/auth/permissions.js';
 * if(can(user, P.PROSPECT_DELETE)) {....}
 * if (canAll(user, [P.COMBINES_WRITE, P.LOBBY_MANAGE])) { ... }
 */

//#region Constants
export const DOMAINS = {
    PROSPECTS: 'prospects',
    COMBINES: 'combines',
    INTERVIEWS: 'interviews',
    LOBBY: 'lobby',
    USERS: 'users',
    ADMIN: 'admin',
};

export const OPERATIONS = {
    READ : 'read',
    WRITE: 'write',
    DELETE: 'delete',
    MANAGE: 'manage'
}
//#endregion

//#region Public API
/**
 * All valide permissions - domain:operation strings
 * P is the single import point for permission constant troughout the app.
 * Adding a new domain/operation is done here 
 */

const {PROSPECTS, COMBINES, INTERVIEWS, LOBBY, USERS, ADMIN} = DOMAINS;
const {READ, WRITE, DELETE, MANAGE} = OPERATIONS;

const perm = (domain, op) => `${domain}:${op}`;
export const P = Object.freeze({

    // Prospects
    PROSPECTS_READ:   perm(PROSPECTS, READ),
    PROSPECTS_WRITE:  perm(PROSPECTS, WRITE),
    PROSPECTS_DELETE: perm(PROSPECTS, DELETE),
    PROSPECTS_MANAGE: perm(PROSPECTS, MANAGE),

    // Combines
    COMBINES_READ:    perm(COMBINES, READ),
    COMBINES_WRITE:   perm(COMBINES, WRITE),
    COMBINES_DELETE:  perm(COMBINES, DELETE),
    COMBINES_MANAGE:  perm(COMBINES, MANAGE),

    // Interviews
    INTERVIEWS_READ:   perm(INTERVIEWS, READ),
    INTERVIEWS_WRITE:  perm(INTERVIEWS, WRITE),
    INTERVIEWS_DELETE: perm(INTERVIEWS, DELETE),
    INTERVIEWS_MANAGE: perm(INTERVIEWS, MANAGE),

    // Lobby
    LOBBY_READ:   perm(LOBBY, READ),
    LOBBY_WRITE:  perm(LOBBY, WRITE),
    LOBBY_DELETE: perm(LOBBY, DELETE),
    LOBBY_MANAGE: perm(LOBBY, MANAGE),

    // Users
    USERS_READ:   perm(USERS, READ),
    USERS_WRITE:  perm(USERS, WRITE),
    USERS_DELETE: perm(USERS, DELETE),
    USERS_MANAGE: perm(USERS, MANAGE),

    // Admin
    ADMIN_ACCESS: perm(ADMIN, READ),
    ADMIN_MANAGE: perm(ADMIN, MANAGE),
});

/**
 * can(user, permission)
 * 
 * Returns true if the user holds the given permission
 * Requires the user object to have 'permissions' array
 * Which is resolved by roles.js at login time and attached to the session
 */
export function can(user, permission){
    if(!user?.isActive) return false;
    if(!user?.permissions) return false;
    return user.permissions.includes(permission);
}

/**
 * canAll(user, permission)
 * 
 * Returns true if the user holds all of the given permissions
 * Use when an action requires multiple domains simultaneously
 */
export function canAll(user, permissions){
    return permissions.every(p=> can(user, p));
}

/**
 *  canAny(user, permissions)
 * Returns true if the user holds AT LEAST ONE of the given permissions.
 * Use for UI visibility where any qualifying role should see a feature.
 */
export function canAny(user, permissions) {
    return permissions.some(p => can(user, p));
}
//#endregion