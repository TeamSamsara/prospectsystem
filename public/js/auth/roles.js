/**
 * roles.js
 * @version 1.0.0
 *
 * Defines roles and composes their permissions from permissions.js.
 * This file contains no permission logic — it only maps roles to
 * arrays of permissions. Changing what a role can do means editing
 * this file only.
 *
 * Usage:
 *   import { ROLES, resolvePermissions, ROLE_LABELS } from '/js/auth/roles.js';
 *   const user = { ...userData, permissions: resolvePermissions(userData.role) };
 */

import { P } from '/js/auth/permissions.js';


//#region Role Constants

export const ROLES = Object.freeze({
    ADMIN:   'admin',
    MANAGER: 'manager',
    COACH:   'coach',
    SCOUT:   'scout',
    PLAYER:  'player',
});

//#endregion


//#region Role Metadata

export const ROLE_LABELS = Object.freeze({
    [ROLES.ADMIN]:   'Admin',
    [ROLES.MANAGER]: 'Manager',
    [ROLES.COACH]:   'Coach',
    [ROLES.SCOUT]:   'Scout',
    [ROLES.PLAYER]:  'Player',
});

/**
 * Role hierarchy — higher rank = broader authority.
 * Used to prevent a user from modifying someone of equal or higher rank.
 */
export const ROLE_RANK = Object.freeze({
    [ROLES.ADMIN]:   4,
    [ROLES.MANAGER]: 3,
    [ROLES.COACH]:   2,
    [ROLES.SCOUT]:   1,
    [ROLES.PLAYER]:  0,
});

/**
 * Roles that are currently allowed to access the platform.
 * SCOUT and PLAYER exist but are not yet activated.
 */
export const ACTIVE_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.COACH];

/**
 * Roles that can create accounts for other users.
 */
export const CAN_CREATE_USERS = [ROLES.ADMIN];

//#endregion


//#region Permission Composition
//
// Each role is defined as a flat array of P.* constants.
// No logic — pure data. To adjust what a role can do, edit the array.
// To add a new role, add an entry here and to ROLES above.

const ROLE_PERMISSIONS = Object.freeze({

    [ROLES.ADMIN]: [
        // Full access to everything
        P.PROSPECTS_READ,
        P.PROSPECTS_WRITE,
        P.PROSPECTS_DELETE,
        P.PROSPECTS_MANAGE,

        P.COMBINES_READ,
        P.COMBINES_WRITE,
        P.COMBINES_DELETE,
        P.COMBINES_MANAGE,

        P.INTERVIEWS_READ,
        P.INTERVIEWS_WRITE,
        P.INTERVIEWS_DELETE,
        P.INTERVIEWS_MANAGE,

        P.LOBBY_READ,
        P.LOBBY_WRITE,
        P.LOBBY_DELETE,
        P.LOBBY_MANAGE,

        P.USERS_READ,
        P.USERS_WRITE,
        P.USERS_DELETE,
        P.USERS_MANAGE,

        P.ADMIN_ACCESS,
        P.ADMIN_MANAGE,
    ],

    [ROLES.MANAGER]: [
        // Full prospect access
        P.PROSPECTS_READ,
        P.PROSPECTS_WRITE,
        P.PROSPECTS_DELETE,
        P.PROSPECTS_MANAGE,

        // Full combine access
        P.COMBINES_READ,
        P.COMBINES_WRITE,
        P.COMBINES_DELETE,
        P.COMBINES_MANAGE,

        // Full interview access
        P.INTERVIEWS_READ,
        P.INTERVIEWS_WRITE,
        P.INTERVIEWS_DELETE,
        P.INTERVIEWS_MANAGE,

        // Full lobby access
        P.LOBBY_READ,
        P.LOBBY_WRITE,
        P.LOBBY_DELETE,
        P.LOBBY_MANAGE,

        // Can read user list but cannot manage accounts
        P.USERS_READ,

        // No admin access
    ],

    [ROLES.COACH]: [
        // Full prospect read/write — coaches evaluate players
        P.PROSPECTS_READ,
        P.PROSPECTS_WRITE,

        // Can delete their own entries but not prospects
        // (PROSPECTS_DELETE intentionally excluded)

        // Combine read/write — coaches participate in combines
        P.COMBINES_READ,
        P.COMBINES_WRITE,

        // Interview read/write
        P.INTERVIEWS_READ,
        P.INTERVIEWS_WRITE,

        // Lobby read/write — coaches manage lobbies they run
        P.LOBBY_READ,
        P.LOBBY_WRITE,

        // No user management
        // No admin access
    ],

    [ROLES.SCOUT]: [
        // Scouts read and write evaluations but cannot delete
        P.PROSPECTS_READ,
        P.PROSPECTS_WRITE,

        // Combine and interview read only
        P.COMBINES_READ,
        P.INTERVIEWS_READ,

        // Lobby read only
        P.LOBBY_READ,

        // No user management
        // No admin access
    ],

    [ROLES.PLAYER]: [
        // No platform access currently
        // Reserved for future player portal
    ],

});

//#endregion


//#region Public API

/**
 * resolvePermissions(role)
 *
 * Returns the permission array for a given role string.
 * Called once at login time — result is attached to the session user object.
 * Returns empty array for unknown roles (safe fallback, no access granted).
 *
 * @param {string} role — one of the ROLES constants
 * @returns {string[]}  — array of P.* permission strings
 */
export function resolvePermissions(role) {
    return [...(ROLE_PERMISSIONS[role] ?? [])];
}

/**
 * isRoleValid(role)
 * Returns true if the role string is a known, defined role.
 */
export function isRoleValid(role) {
    return Object.values(ROLES).includes(role);
}

/**
 * canPlatformAccess(role)
 * Returns true if this role is currently allowed to log in.
 */
export function canPlatformAccess(role) {
    return ACTIVE_ROLES.includes(role);
}

/**
 * getRoleOptions()
 * Returns role options formatted for a select dropdown.
 * Only includes roles that can be assigned to new users (excludes PLAYER for now).
 */
export function getRoleOptions() {
    return [ROLES.ADMIN, ROLES.MANAGER, ROLES.COACH, ROLES.SCOUT].map(role => ({
        value: role,
        label: ROLE_LABELS[role],
    }));
}

//#endregion