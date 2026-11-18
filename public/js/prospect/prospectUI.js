/**
 * prospectUI.js
 * @version 1.0.0
 */


//#region Imports
import { calculateProfileStats } from '/js/formulas.js';

import {
    buildStickyFooter,
    showStickyFooter,
    hideStickyFooter,
    setSaveStatus,
    setSaveBtnLoading,
} from '/js/footer.js';

import {
    fetchAllProspects,
    fetchProspect,
    createProspect,
    updateProspect,
    deleteProspect,
} from '/js/prospect/prospectRepository.js';

import {
    initList,
    setListData,
} from '/js/prospect/prospectList.js';

import {
    initCalc,
    runLiveCalc,
} from '/js/prospect/calc.js';

import {
    initProspectForm,
    populateProspectForm,
    collectProspectData,
    addChampionRow,
    addCombineRow,
} from '/js/form/prospectForm.js';
//#endregion


//#region State
let _currentEditId = null;
let _isDirty       = false;
let _isSaving      = false;
let _autoSaveTimer = null;

const AUTOSAVE_DELAY = 3000;
//#endregion


//#region DOM Refs
const profileFormSection    = document.getElementById('profileFormSection');
const profileListSection    = document.getElementById('profileListSection');
const prospectForm          = document.getElementById('prospectForm');
const championPoolTableBody = document.querySelector('#championPoolTable tbody');
const combineLogTableBody   = document.querySelector('#combineLogTable tbody');
const createProfileBtn      = document.getElementById('createProfileBtn');
const listProfileBtn        = document.getElementById('listProfileBtn');
const addChampionBtn        = document.getElementById('addChampionBtn');
const addCombineRowBtn      = document.getElementById('addCombineRowBtn');
//#endregion


//#region Init

(async function init() {
    _initModules();
    _wireEvents();
    await showList();
})();

function _initModules() {
    buildStickyFooter({
        onSave:   () => prospectForm.requestSubmit(),
        onCancel: () => safeNavigate(() => showList()),
    });

    initList({
        listEl:   document.getElementById('profileList'),
        onEdit:   id => editProspect(id),
        onDelete: id => deleteProspectById(id),
    });

    initCalc({
        form:        prospectForm,
        combineBody: combineLogTableBody,
    });

    initProspectForm({
        form:         prospectForm,
        championBody: championPoolTableBody,
        combineBody:  combineLogTableBody,
        onDirty:      () => { markDirty(); runLiveCalc(); },
    });
}

//#endregion


//#region Views

async function showList() {
    _clearDirty();
    hideStickyFooter();
    profileFormSection.classList.add('hidden');
    profileListSection.classList.remove('hidden');
    _setNavActive('listProfileBtn');

    document.getElementById('profileList').innerHTML =
        '<div class="list-loading">Loading prospects…</div>';

    try {
        const docs = await fetchAllProspects();
        docs.forEach(({ data }) => calculateProfileStats(data));
        docs.sort((a, b) => (Number(b.data.overallScore) || 0) - (Number(a.data.overallScore) || 0));
        setListData(docs);
    } catch (err) {
        console.error('Failed to load prospects:', err);
        document.getElementById('profileList').innerHTML =
            `<div class="list-empty" style="color:var(--no)">Could not load data — ${err.message}</div>`;
    }
}

function showForm(prospect = null, id = null) {
    _currentEditId = id;
    _clearDirty();
    setSaveStatus('idle');

    prospectForm.reset();
    championPoolTableBody.innerHTML = '';
    combineLogTableBody.innerHTML   = '';

    if (prospect) populateProspectForm(prospect);

    runLiveCalc();
    profileListSection.classList.add('hidden');
    profileFormSection.classList.remove('hidden');
    _setNavActive('createProfileBtn');
    showStickyFooter();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

//#endregion


//#region Save

async function saveProfile(e) {
    e.preventDefault();
    if (_isSaving) return;

    _isSaving = true;
    setSaveStatus('saving');
    setSaveBtnLoading(true);

    try {
        const profile = collectProspectData();
        calculateProfileStats(profile);

        if (_currentEditId) {
            await updateProspect(_currentEditId, profile);
        } else {
            _currentEditId = await createProspect(profile);
        }

        _clearDirty();
        setSaveStatus('saved');
        setTimeout(() => { if (!_isDirty) setSaveStatus('idle'); }, 2000);
        await showList();
    } catch (err) {
        console.error('Save failed:', err);
        setSaveStatus('error');
        alert('Save failed — ' + err.message);
        _isDirty = true;
    } finally {
        _isSaving = false;
        setSaveBtnLoading(false);
    }
}

async function _runAutoSave() {
    if (!_currentEditId || _isSaving) return;

    const hasName = prospectForm.querySelector('[name="candidateFullname"]')?.value?.trim()
                 || prospectForm.querySelector('[name="candidateUsername"]')?.value?.trim();
    if (!hasName) return;

    _isSaving = true;
    setSaveStatus('saving');

    try {
        const profile = collectProspectData();
        calculateProfileStats(profile);
        await updateProspect(_currentEditId, profile);
        _clearDirty();
        setSaveStatus('saved');
        setTimeout(() => { if (!_isDirty) setSaveStatus('idle'); }, 2000);
    } catch (err) {
        console.error('Auto-save failed:', err);
        setSaveStatus('error');
        _isDirty = true;
    } finally {
        _isSaving = false;
    }
}

//#endregion


//#region Edit & Delete

async function editProspect(id) {
    try {
        const prospect = await fetchProspect(id);
        if (prospect) showForm(prospect, id);
    } catch (err) {
        console.error('Failed to load prospect:', err);
    }
}

async function deleteProspectById(id) {
    if (!confirm('Delete this profile? This cannot be undone.')) return;
    try {
        await deleteProspect(id);
        await showList();
    } catch (err) {
        console.error('Failed to delete prospect:', err);
    }
}

//#endregion


//#region Dirty State

function markDirty() {
    _isDirty = true;
    setSaveStatus('dirty');
    if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
    if (_currentEditId) {
        _autoSaveTimer = setTimeout(_runAutoSave, AUTOSAVE_DELAY);
    }
}

function _clearDirty() {
    _isDirty = false;
    if (_autoSaveTimer) clearTimeout(_autoSaveTimer);
    _autoSaveTimer = null;
}

function safeNavigate(action) {
    if (_isDirty) {
        if (!confirm('You have unsaved changes. Discard them and leave?')) return;
    }
    _clearDirty();
    action();
}

//#endregion


//#region Events

function _wireEvents() {
    createProfileBtn?.addEventListener('click', () => safeNavigate(() => showForm()));
    listProfileBtn?.addEventListener('click',   () => safeNavigate(() => showList()));

    addChampionBtn?.addEventListener('click',   () => addChampionRow());
    addCombineRowBtn?.addEventListener('click', () => addCombineRow());

    prospectForm?.addEventListener('submit', saveProfile);
    prospectForm?.addEventListener('input',  () => { markDirty(); runLiveCalc(); });

    document.addEventListener('click', e => {
        if (e.target?.id === 'cancelFormBtn') safeNavigate(() => showList());
    });

    document.addEventListener('click', e => {
        const navLink = e.target.closest('a.nav-link');
        if (!navLink) return;
        if (!profileFormSection.classList.contains('hidden') && _isDirty) {
            e.preventDefault();
            if (confirm('You have unsaved changes. Discard them and leave?')) {
                _clearDirty();
                window.location.href = navLink.href;
            }
        }
    });

    window.addEventListener('beforeunload', e => {
        if (_isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
}

//#endregion


//#region Helpers

function _setNavActive(id) {
    document.querySelectorAll('.nav-link, .nav-link-btn').forEach(b => b.classList.remove('on'));
    document.getElementById(id)?.classList.add('on');
}

//#endregion