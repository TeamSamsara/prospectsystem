/**
 * app.js
 * @version 2.0.2
 *
 * Wires inactivity timer — starts on authenticated session, stops on sign-out.
 */


//#region Imports
import { initRouter                               } from './router.js';
import { buildStickyFooter                        } from './footer.js';
import { initAuth, onSessionChange,
         signOut, getSession,
         startInactivityTimer, stopInactivityTimer } from './auth/authService.js';
import { guardRoute                               } from './auth/authGuard.js';
import { can, P                                   } from './auth/permissions.js';
import { navigate                                 } from './router.js';
import { escHtml                                  } from './renderer.js';

import { ProspectListView } from './views/prospectListView.js';
import { ProspectReadView } from './views/prospectReadView.js';
import { ProspectEditView } from './views/prospectEditView.js';
import { InterviewView    } from './views/interviewView.js';
import { CombineView      } from './views/combineView.js';
import { LobbyView        } from './views/lobbyView.js';
import { LoginView        } from './views/loginView.js';
import { SetupView        } from './views/setupView.js';
import { AdminView        } from './views/adminView.js';
//#endregion


//#region Routes

const ROUTES = [
    { path: '/login',                view: LoginView        },
    { path: '/setup',                view: SetupView        },
    { path: '/admin',                view: AdminView        },
    { path: '/',                     view: ProspectListView },
    { path: '/prospects',            view: ProspectListView },
    { path: '/prospects/new/edit',   view: ProspectEditView },
    { path: '/prospects/:id/edit',   view: ProspectEditView },
    { path: '/prospects/:id',        view: ProspectReadView },
    { path: '/interviews',           view: InterviewView    },
    { path: '/combine',              view: CombineView      },
    { path: '/lobby',                view: LobbyView        },
];

//#endregion


//#region Shell

function buildShell() {
    document.body.innerHTML = /*html*/`
        <header id="appHeader">
            <div class="brand">
                <div class="bmark">TS</div>
                <div>
                    <div class="bt-sub">TEAM SAMSARA</div>
                    <div class="bt-name">TRUE SIGHT</div>
                </div>
            </div>
            <nav class="nav" id="appNav"></nav>
        </header>
        <main id="viewOutlet"></main>
    `;
}

function syncNav(session) {
    const nav     = document.getElementById('appNav');
    if (!nav) return;

    const path    = window.location.pathname;
    const profile = session.userProfile;

    if (!session.isAuthenticated || !profile) {
        nav.innerHTML = '';
        return;
    }

    const navLink = (href, label, route) => {
        const on = path.startsWith('/' + route) ? ' on' : '';
        return `<a href="${href}" class="nav-link${on}" data-link data-route="${route}">${label}</a>`;
    };

    let html = '';
    html += navLink('/prospects',  'PROSPECTS',   'prospects');
    html += navLink('/interviews', 'INTERVIEWS',  'interviews');
    html += navLink('/combine',    'COMBINE',     'combine');
    html += navLink('/lobby',      'LOBBY CODES', 'lobby');

    if (can(profile, P.ADMIN_ACCESS)) {
        const on = path.startsWith('/admin') ? ' on' : '';
        html += `<a href="/admin" class="nav-link${on}" data-link data-route="admin" style="color:var(--gold);border-color:var(--gold-line)">ADMIN</a>`;
    }

    const displayName = profile.displayName || profile.email || '';
    html += `
        <div class="nav-sep"></div>
        <span class="nav-user">${escHtml(displayName)}</span>
        <button class="btn btn-ghost nav-signout" id="signOutBtn">SIGN OUT</button>
    `;

    nav.innerHTML = html;

    document.getElementById('signOutBtn')?.addEventListener('click', async () => {
        stopInactivityTimer();
        await signOut();
        navigate('/login');
    });
}

function syncNavActive() {
    const path = window.location.pathname;
    document.querySelectorAll('.nav-link[data-route]').forEach(link => {
        const route = link.dataset.route;
        link.classList.toggle('on', path.startsWith('/' + route));
    });
}

//#endregion


//#region Init

(async function init() {
    buildShell();

    buildStickyFooter({
        onSave:         () => document.dispatchEvent(new CustomEvent('app:save')),
        onCancel:       () => document.dispatchEvent(new CustomEvent('app:cancel')),
        onLeaveAndSave: () => document.dispatchEvent(new CustomEvent('app:leaveAndSave')),
    });

    const outlet = document.getElementById('viewOutlet');

    initRouter({
        outlet,
        routes:      ROUTES,
        notFound:    ProspectListView,
        beforeMount: (path) => guardRoute(path),
    });

    let _wasAuthenticated = false;

    onSessionChange(session => {
        syncNav(session);

        const justLoggedIn  = session.isAuthenticated && !session.isLoading && !_wasAuthenticated;
        const justLoggedOut = !session.isAuthenticated && !session.isLoading && _wasAuthenticated;

        if (justLoggedIn) {
            _wasAuthenticated = true;
            startInactivityTimer();

            const path = window.location.pathname;
            if (path === '/login' || path === '/') {
                navigate(session.userProfile?.isFirstLogin ? '/setup' : '/prospects');
            }
        }

        if (justLoggedOut) {
            _wasAuthenticated = false;
            stopInactivityTimer();

            const path = window.location.pathname;
            if (!path.startsWith('/login') && !path.startsWith('/setup')) {
                navigate('/login');
            }
        }
    });

    initAuth();

    window.addEventListener('popstate', syncNavActive);
    document.addEventListener('click', e => {
        if (e.target.closest('[data-link]')) syncNavActive();
    });
})();

//#endregion