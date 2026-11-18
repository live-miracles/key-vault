// Key Vault's page: starts the backend (the demo's, or the real one after sign-in), draws
// every screen from the loaded data, and sends clicks to the screen they belong to.

import '../output.css';

import { app } from './app.ts';
import type { Backend, BackendConfig } from './api-client.ts';
import {
    initBunryuModal,
    renderBunryuStatus,
    showBunryuModal,
    toggleBunryuSecrets,
    copyBunryuValue,
} from './bunryu.ts';
import { initControls, refreshDataBtn, toggleProfileMenu } from './controls.ts';
import {
    deleteKeyById,
    copySelectedKeyUrl,
    hideLinksMenu,
    renderDestinations,
    setDestinationSearch,
} from './destinations.ts';
import {
    addKeyBtn,
    editKeyById,
    initKeyForm,
    pasteStreamKey,
    pickPlatform,
    saveKeyForm,
} from './destination-form.ts';
import { $, $$, copyTextValue, hydrateIcons, setSaving, showErrorAlert } from './dom.ts';
import {
    addEventBtn,
    deleteEventBtn,
    editEventBtn,
    renderEventBar,
    saveEventForm,
} from './events.ts';
import {
    addInputBtn,
    deleteInputById,
    editInputById,
    saveInputForm,
    selectInput,
} from './inputs.ts';
import {
    addRoleBtn,
    cancelRoleInlineEdit,
    deleteRoleById,
    deleteSelectedRole,
    editRoleById,
    editSelectedRole,
    hideRoleContextMenu,
    renderRoleInputForRow,
    renderRoleTable,
    resetRoleInlineEdit,
    saveRoleInline,
    showShareModal,
} from './roles.ts';
import { registerServiceWorker } from './pwa.ts';
import { onRouteChange, route } from './route.ts';
import { initTheme, toggleTheme } from './theme.ts';

// Set at build time: the demo runs the server's operations in the page; the real site calls the
// Edge Function after Google sign-in.
declare const __KEY_VAULT_MODE__: 'demo' | 'real';
declare const __KEY_VAULT_CONFIG__: BackendConfig | null;

const DATA_REFRESH_MS = 5 * 60 * 1000;
const STATUS_REFRESH_MS = 30 * 1000;

// The event the page is on: the one in the address, else the first the person can see.
function currentEventId(): string {
    const { events } = app.data;
    const wanted = route.event();
    const id = events.some((e) => e.id === wanted) ? (wanted as string) : (events[0]?.id ?? '');
    if (id !== (wanted ?? '')) route.fix({ event: id || null, view: null });
    return id;
}

function renderAll() {
    const eventId = currentEventId();
    renderEventBar(eventId);
    renderRoleTable();
    renderDestinations(eventId);
    renderBunryuStatus();
    $('#user-email').innerText = app.data.userEmail;
}

// The status report arrives on its own, every 30 seconds: only what shows it is drawn again, so
// a dialog being filled in is left alone.
function renderStatus() {
    renderBunryuStatus();
    renderDestinations(currentEventId());
}

let signOutHandler: () => void = () => {};
let signInHandler: () => void = () => {};

// Each data-action in index.html names what a click does.
function handleClick(event: MouseEvent) {
    const target =
        event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
    if (!target) return;
    const row = target.closest<HTMLElement>('tr');
    const keyId = target.closest<HTMLElement>('[data-key-id]')?.dataset.keyId;
    const inputId = target.closest<HTMLElement>('[data-input-id]')?.dataset.inputId;
    const roleId = row?.dataset.roleId;
    const clearSearch = () => {
        setDestinationSearch('', renderAll);
        $('#destination-search')?.focus();
    };

    const actions: Record<string, () => unknown> = {
        'add-event': () => addEventBtn(),
        'edit-event': () => editEventBtn(),
        'delete-event': () => deleteEventBtn(),
        'save-event': () => saveEventForm(event),
        'add-input': () => addInputBtn(),
        'edit-input-by-id': () => editInputById(inputId),
        'delete-input-by-id': () => deleteInputById(inputId),
        'save-input': () => saveInputForm(event),
        'select-input': () => selectInput(target.dataset.input),
        'add-key': () => addKeyBtn(),
        'edit-key-by-id': () => editKeyById(keyId),
        'delete-key-by-id': () => deleteKeyById(keyId),
        'save-key': () => saveKeyForm(event),
        'pick-platform': () => pickPlatform(target.dataset.server),
        'paste-stream-key': () => pasteStreamKey(target.dataset.suffix || ''),
        'copy-text': () => copyTextValue(target.dataset.copyValue),
        'copy-selected-key-url': () => copySelectedKeyUrl(target.dataset.actionType),
        'clear-destination-search': clearSearch,
        'show-share': () => showShareModal(),
        'add-role': () => addRoleBtn(),
        'edit-role': () => editSelectedRole(),
        'delete-role': () => deleteSelectedRole(),
        'edit-role-by-id': () => editRoleById(roleId),
        'delete-role-by-id': () => deleteRoleById(roleId),
        'save-role-inline': () => saveRoleInline(target),
        'cancel-role-inline': () => cancelRoleInlineEdit(),
        'show-bunryu': () => showBunryuModal(),
        'toggle-bunryu-secrets': () => toggleBunryuSecrets(),
        'copy-bunryu-value': () => copyBunryuValue(target.dataset.field),
        'refresh-data': () => refreshDataBtn(),
        'toggle-theme': () => toggleTheme(),
        'toggle-profile-menu': () => toggleProfileMenu(),
        'sign-in': () => signInHandler(),
        'sign-out': () => signOutHandler(),
    };
    void actions[target.dataset.action ?? '']?.();
}

async function startDemo(): Promise<Backend | null> {
    const { createDemoBackend } = await import('./demo/demo-backend.ts');
    return createDemoBackend();
}

async function startReal(): Promise<Backend | null> {
    const { startAuth } = await import('./auth.ts');
    const auth = await startAuth(__KEY_VAULT_CONFIG__ as BackendConfig);
    signInHandler = () => void auth.signIn();
    signOutHandler = () => void auth.signOut();
    return auth.signedIn ? auth.backend : null;
}

// The mode is fixed when the site is built, so the other one's code is not in the bundle.
const startBackend = () => (__KEY_VAULT_MODE__ === 'demo' ? startDemo() : startReal());

async function start() {
    hydrateIcons();
    initTheme();
    initControls();
    initKeyForm();
    initBunryuModal();

    document.addEventListener('click', handleClick);
    document.addEventListener('click', () => {
        hideRoleContextMenu();
        hideLinksMenu();
    });
    document.addEventListener('change', (event) => {
        const target =
            event.target instanceof Element
                ? event.target.closest('[data-action="render-role-input"]')
                : null;
        if (target) renderRoleInputForRow(target as HTMLSelectElement);
    });
    $('#share-modal').addEventListener('close', resetRoleInlineEdit);

    const searchBox = $<HTMLInputElement>('#destination-search');
    searchBox.addEventListener('input', () => setDestinationSearch(searchBox.value, renderAll));
    searchBox.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && searchBox.value) {
            event.preventDefault();
            setDestinationSearch('', renderAll);
        }
    });

    onRouteChange(renderAll);
    window.addEventListener('popstate', renderAll);
    app.subscribe((kind) => (kind === 'status' ? renderStatus() : renderAll()));

    // Nobody signed in yet: the sign-in panel is showing, and there is nothing to load.
    const backend = await startBackend();
    if (!backend) return;
    app.start(backend, { onError: (message) => showErrorAlert(message), onBusy: setSaving });

    void app.refresh();
    void app.refreshStatus();
    setInterval(() => void app.refresh(), DATA_REFRESH_MS);
    setInterval(() => void app.refreshStatus(), STATUS_REFRESH_MS);
}

registerServiceWorker();
void start();
