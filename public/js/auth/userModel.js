/**
 * userModel.js
 * @version 1.0.0
 *
 * Defines the User schema and normalization logic.
 * Users are staff members with platform access.
 * Users are NOT prospects — no evaluation data lives here.
 *
 * Permission and role logic lives in:
 *   /js/auth/permissions.js  — P.* constants, can/canAll/canAny
 *   /js/auth/roles.js        — ROLES, resolvePermissions
 *
 * Firestore collection: users/{uid}
 * The document ID is the Firebase Auth uid — uid is never stored as a field.
 */


//#region Schema

const EMPTY_USER_PROFILE = {

    // Identity
    email:       '',   // Firebase Auth email — source of truth
    displayName: '',   // Set by user on first login
    role:        '',   // One of ROLES values from roles.js

    // Auth lifecycle
    isFirstLogin:       true,
    mustChangePassword: true,
    tempPassword:       '',    // admin-generated, cleared after first login

    // Status
    isActive: true,    // false = account revoked

    // Metadata
    createdBy:   '',   // uid of admin who created this account
    createdAt:   null, // serverTimestamp — set by repository
    lastLoginAt: null, // updated on each successful sign-in
};

//#endregion


//#region Public API

export function createEmptyUser() {
    return structuredClone(EMPTY_USER_PROFILE);
}

/**
 * normalizeUser(raw, uid)
 *
 * uid is passed separately — it is the Firestore document ID, not a stored field.
 */
export function normalizeUser(raw, uid) {
    const user = {
        ...createEmptyUser(),
        ...raw,
        uid,
    };

    delete user.id;

    if (typeof user.isActive !== 'boolean')           user.isActive = true;
    if (typeof user.isFirstLogin !== 'boolean')       user.isFirstLogin = false;
    if (typeof user.mustChangePassword !== 'boolean') user.mustChangePassword = false;

    return user;
}

/**
 * createUserForFirestore({ email, role, displayName, createdBy, tempPassword })
 *
 * Builds the object written to Firestore when admin creates a new account.
 * uid is NOT included — it becomes the document ID set by the repository.
 */
export function createUserForFirestore({ email, role, displayName = '', createdBy, tempPassword }) {
    return {
        email:              email.trim().toLowerCase(),
        displayName:        displayName.trim(),
        role,
        isFirstLogin:       true,
        mustChangePassword: true,
        tempPassword,
        isActive:           true,
        createdBy,
        createdAt:          null,
        lastLoginAt:        null,
    };
}

/**
 * generateTempPassword()
 *
 * 12-character readable temporary password.
 * Avoids ambiguous characters (0/O, 1/l/I).
 * Guarantees uppercase, lowercase, digit, and special character.
 */
export function generateTempPassword() {
    const upper   = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    const lower   = 'abcdefghjkmnpqrstuvwxyz';
    const digits  = '23456789';
    const special = '!@#$%&*';
    const all     = upper + lower + digits + special;

    const rand = chars => chars[Math.floor(Math.random() * chars.length)];

    const required = [rand(upper), rand(lower), rand(digits), rand(special)];
    const rest     = Array.from({ length: 8 }, () => rand(all));

    return [...required, ...rest]
        .sort(() => Math.random() - 0.5)
        .join('');
}

//#endregion