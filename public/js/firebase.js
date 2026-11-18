// public/js/firebase.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getFirestore  } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAuth       } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";


//#region Configs
const CONFIGS = {
    staging: {
        apiKey:            "AIzaSyCPkaIoGvvc9UiF0XG3QjE50E3F4VgNBPY",
        authDomain:        "prospecttooldev-staging.firebaseapp.com",
        projectId:         "prospecttooldev-staging",
        storageBucket:     "prospecttooldev-staging.firebasestorage.app",
        messagingSenderId: "614438934943",
        appId:             "1:614438934943:web:63b7ceb52898a63aaec5aa",
    },
    production: {
        apiKey:            "AIzaSyBzt3-9T_L7NJzBeAbls0ncSpWjJdIVbm0",
        authDomain:        "prospecttooldev-8ddbf.firebaseapp.com",
        projectId:         "prospecttooldev-8ddbf",
        storageBucket:     "prospecttooldev-8ddbf.firebasestorage.app",
        messagingSenderId: "505273806742",
        appId:             "1:505273806742:web:eea33008f82bc559cff7b7",
    },
};
//#endregion


//#region Environment Detection
function detectEnvironment() {
    const host = window.location.hostname;
    if (host.includes('staging')) return 'staging';
    return 'production';
}
//#endregion


//#region Init
export const env = detectEnvironment();

const app  = initializeApp(CONFIGS[env]);
const db   = getFirestore(app);
const auth = getAuth(app);

console.log(`[TrueSight] Environment: ${env} — ${CONFIGS[env].projectId}`);

export { app, db, auth };
//#endregion