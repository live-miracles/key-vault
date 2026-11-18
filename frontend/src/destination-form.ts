// The "Add a destination" / "Edit destination" dialog. This file reads and fills the form's
// fields; what a valid destination is comes from the platform rules shared with the server
// (supabase/functions/_shared/platforms.ts), so the form and the server cannot disagree. It is
// written for someone who has never seen a stream key: each platform gets a few plain steps, the
// key box takes a pasted full address and keeps only the key, and an error says what to do.

import {
    DEFAULT_SRT_SETTINGS,
    PLATFORM_IDS,
    backupRule,
    buildSrtUrl,
    cleanStreamKeyInput,
    destinationNameProblem,
    detectKnownAddress,
    endpointProblem,
    findClash,
    isPlatform,
    joinRtmpAddress,
    normalizeBackup,
    parseSrtUrl,
    platformName,
    splitRtmpAddress,
    srtProblem,
} from '../../supabase/functions/_shared/platforms.ts';
import type { Problem, SrtSettings } from '../../supabase/functions/_shared/platforms.ts';
import { actions, app } from './app.ts';
import { $, $$, showErrorAlert } from './dom.ts';
import { escapeHtml } from './html.ts';
import { addInputBtn, shownInput } from './inputs.ts';
import { inputsOf } from './model.ts';
import { BACKUP_NOTES, PLATFORM_GUIDES } from './platform-guides.ts';
import { route } from './route.ts';

const input = (selector: string) => $<HTMLInputElement>(selector);
const select = (selector: string) => $<HTMLSelectElement>(selector);

let keyGuideExpanded = true;
// When editing, Save stays off until something differs from what the dialog opened with
// (changing a field back turns it off again). Adding has no baseline, so Save is always on.
let keyFormBaseline: string | null = null;

// ===== Setting the form up =====

export function initKeyForm() {
    select('#key-server-input').innerHTML =
        '<option value="" disabled selected>Server URL</option>' +
        PLATFORM_IDS.map((id) => `<option value="${id}">${platformName(id)}</option>`).join('');
    select('#key-server2-input').innerHTML =
        '<option value="">None</option>' +
        PLATFORM_IDS.map((id) => `<option value="${id}">${platformName(id)}</option>`).join('');

    select('#key-server-input').addEventListener('change', (event) => {
        renderServerInput((event.target as HTMLSelectElement).value);
        applyBackupLock();
    });
    select('#key-server2-input').addEventListener('change', (event) =>
        renderServerInput((event.target as HTMLSelectElement).value, '2'),
    );
    input('#key-custom-server-input').addEventListener('input', () => convertKnownAddress());
    input('#key-custom-server2-input').addEventListener('input', () => convertKnownAddress('2'));
    input('#stream-key-input').addEventListener('input', () => {
        handleStreamKeyInput();
        applyBackupLock();
    });
    input('#stream-key2-input').addEventListener('input', () => handleStreamKeyInput('2'));

    // Fixing a field clears its red border, and the message once nothing is left to fix.
    const onFieldEdited = (event: Event) => {
        const field = event.target;
        if (!(field instanceof Element)) return;
        field.classList.remove('input-error', 'select-error');
        const stillWrong = document.querySelector(
            '#key-modal .input-error, #key-modal .select-error, #key-modal .picker-error',
        );
        if (!stillWrong) $('#key-form-error').classList.add('hidden');
        updateSaveKeyBtn();
    };
    $('#key-modal').addEventListener('input', onFieldEdited);
    $('#key-modal').addEventListener('change', onFieldEdited);
}

// ===== Reading and filling the endpoint boxes (the main one, and with suffix "2" the backup) =====

function getSrtSettings(suffix = ''): SrtSettings {
    const value = (name: string) => input(`#key-srt-${name}${suffix}-input`).value.trim();
    return {
        host: value('host'),
        port: Number(value('port')),
        mode: select(`#key-srt-mode${suffix}-input`).value === 'listener' ? 'listener' : 'caller',
        latencyMs: Number(value('latency')),
        passphrase: value('passphrase'),
        pbKeyLen: (Number(select(`#key-srt-keylen${suffix}-input`).value) ||
            '') as SrtSettings['pbKeyLen'],
        streamId: value('streamid'),
    };
}

function setSrtInputs(settings: SrtSettings, suffix = '') {
    input(`#key-srt-host${suffix}-input`).value = settings.host;
    input(`#key-srt-port${suffix}-input`).value = String(settings.port);
    select(`#key-srt-mode${suffix}-input`).value = settings.mode;
    input(`#key-srt-latency${suffix}-input`).value = String(settings.latencyMs);
    input(`#key-srt-passphrase${suffix}-input`).value = settings.passphrase;
    select(`#key-srt-keylen${suffix}-input`).value = String(settings.pbKeyLen);
    input(`#key-srt-streamid${suffix}-input`).value = settings.streamId;
}

interface Endpoint {
    platform: string;
    // What is stored: the key, or for "something else" and SRT the whole address.
    streamKey: string;
    // The same, for checking: kept even when a half-typed address cannot be stored yet.
    check: string;
    settings?: SrtSettings;
}

function readEndpoint(suffix = ''): Endpoint {
    const platform = select(`#key-server${suffix}-input`).value;
    const typedKey = input(`#stream-key${suffix}-input`).value.trim();
    if (!platform) return { platform: '', streamKey: '', check: '' };

    if (platform === 'srt') {
        const settings = getSrtSettings(suffix);
        const streamKey = buildSrtUrl(settings);
        return { platform, streamKey, check: streamKey, settings };
    }
    if (platform === 'rtmp') {
        const serverUrl = input(`#key-custom-server${suffix}-input`).value.trim();
        // A half-typed address is still checked, so the message names the box that is missing.
        const check = serverUrl
            ? (serverUrl.endsWith('/') ? serverUrl : serverUrl + '/') + typedKey
            : typedKey;
        return { platform, streamKey: joinRtmpAddress(serverUrl, typedKey), check };
    }
    return { platform, streamKey: typedKey, check: typedKey };
}

// What is wrong with what is typed in one endpoint, or null. SRT is checked on the typed
// settings: a port like 70000 never makes a link that could be read back.
function endpointFault(endpoint: Endpoint, required: boolean): Problem | null {
    if (endpoint.settings) return srtProblem(endpoint.settings);
    return endpointProblem(endpoint.platform, endpoint.check, required);
}

function selectorFor(field: Problem['field'], suffix: string): string {
    switch (field) {
        case 'platform':
            return suffix ? '#key-server2-input' : '#platform-picker';
        case 'address':
            return `#key-custom-server${suffix}-input`;
        case 'srtHost':
            return `#key-srt-host${suffix}-input`;
        case 'srtPort':
            return `#key-srt-port${suffix}-input`;
        case 'srtLatency':
            return `#key-srt-latency${suffix}-input`;
        case 'srtPassphrase':
            return `#key-srt-passphrase${suffix}-input`;
        case 'srtKeyLen':
            return `#key-srt-keylen${suffix}-input`;
        default:
            return `#stream-key${suffix}-input`;
    }
}

// The boxes to mark when the destination as a whole is the problem (a link used twice).
function endpointSelectors(platform: string, suffix: string): string[] {
    if (platform === 'srt') {
        return [
            `#key-srt-host${suffix}-input`,
            `#key-srt-port${suffix}-input`,
            `#key-srt-streamid${suffix}-input`,
        ];
    }
    if (platform === 'rtmp')
        return [`#key-custom-server${suffix}-input`, `#stream-key${suffix}-input`];
    return [`#stream-key${suffix}-input`];
}

// Shows one endpoint of the form: the platform's own boxes, and the stored key put into them.
function renderServerInput(platform: string, suffix = '') {
    const isCustomRtmp = platform === 'rtmp';
    const isCustomSrt = platform === 'srt';
    const known = isPlatform(platform);
    const streamKeyInput = input(`#stream-key${suffix}-input`);

    select(`#key-server${suffix}-input`).value = known ? platform : '';
    $(`#custom-server${suffix}`).classList.toggle('hidden', !isCustomRtmp);
    $(`#stream-key${suffix}-field`).classList.toggle('hidden', isCustomSrt || !platform);
    $(`#srt-server${suffix}`).classList.toggle('hidden', !isCustomSrt);

    if (!platform) streamKeyInput.value = '';

    const customServerInput = input(`#key-custom-server${suffix}-input`);
    if (isCustomRtmp) {
        const parts = splitRtmpAddress(streamKeyInput.value);
        customServerInput.value = parts.serverUrl;
        streamKeyInput.value = parts.streamKey;
    } else {
        customServerInput.value = '';
    }

    setSrtInputs(isCustomSrt ? parseSrtUrl(streamKeyInput.value) : DEFAULT_SRT_SETTINGS, suffix);
    if (!suffix) syncPlatformPicker(known ? platform : '');
}

// A known platform's address typed into "server address": it becomes that platform.
function convertKnownAddress(suffix = '') {
    const known = detectKnownAddress(input(`#key-custom-server${suffix}-input`).value);
    if (!known) return;
    if (known.streamKey) input(`#stream-key${suffix}-input`).value = known.streamKey;
    renderServerInput(known.platform, suffix);
    if (!suffix) applyBackupLock();
}

// Shows or locks the backup section for the chosen platform: YouTube and Instagram need no
// backup box, Facebook's is Facebook.
function applyBackupLock() {
    const primary = select('#key-server-input').value;
    const rule = primary ? backupRule(primary) : 'none';
    const isLocked = rule === 'fixed';
    const isHidden = !primary || rule === 'none' || rule === 'derived';
    const note = BACKUP_NOTES[primary] || '';

    $('#backup-section').classList.toggle('hidden', !primary);
    $('#backup-details').classList.toggle('hidden', isHidden);
    $('#backup-note').textContent = note;
    $('#backup-note').classList.toggle('hidden', !note);

    if (isHidden) {
        renderServerInput('', '2');
        input('#stream-key2-input').value = '';
        $<HTMLDetailsElement>('#backup-details').open = false;
    }
    if (isLocked) renderServerInput(primary, '2');

    select('#key-server2-input').disabled = isLocked;
    input('#key-custom-server2-input').disabled = isLocked;
    const backupKey = input('#stream-key2-input');
    backupKey.disabled = false;
    backupKey.readOnly = false;
    backupKey.classList.remove('cursor-not-allowed');
}

// ===== The guide and the platform picker =====

function renderKeyGuide(platform: string) {
    const guide = PLATFORM_GUIDES[platform];
    const box = $('#key-guide');
    if (!guide) {
        box.innerHTML = '';
        return;
    }
    const open = guide.openUrl
        ? `<a class="btn btn-sm mt-3" href="${escapeHtml(guide.openUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(guide.openLabel)}<span class="sr-only"> (opens in a new tab)</span></a>`
        : '';
    box.innerHTML = `
        <details class="key-guide-box" ${keyGuideExpanded ? 'open' : ''}>
            <summary>${escapeHtml(guide.title)}</summary>
            <ol class="key-guide-steps">
                ${guide.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join('')}
            </ol>
            ${open}
            ${guide.note ? `<p class="key-guide-note">${escapeHtml(guide.note)}</p>` : ''}
            <p class="key-guide-foot">Screens change now and then, so the names may look a little different.</p>
        </details>`;

    $('#key-step-key-title').textContent = guide.stepTitle;
    $('#stream-key-legend').textContent = guide.keyLabel;
    $('#stream-key-help').textContent = guide.keyHelp;
    input('#stream-key-input').placeholder = guide.placeholder;
}

// Shows which platform tile is chosen, and the step that asks for its key.
function syncPlatformPicker(platform: string) {
    for (const tile of $$('#platform-picker .platform-tile')) {
        const active = tile.dataset.server === platform;
        tile.classList.toggle('platform-tile-active', active);
        tile.setAttribute('aria-checked', String(active));
    }
    $('#key-step-key').classList.toggle('hidden', !platform);
    renderKeyGuide(platform);
}

export function pickPlatform(platform: string | undefined) {
    if (!platform || !isPlatform(platform)) return;
    const previous = select('#key-server-input').value;
    if (previous === platform) return;

    // A key from another platform is of no use here, and would only confuse.
    if (previous) {
        input('#stream-key-input').value = '';
        input('#key-custom-server-input').value = '';
    }
    keyGuideExpanded = true;
    clearKeyErrors();
    renderServerInput(platform);
    applyBackupLock();
    updateSaveKeyBtn();

    const next =
        platform === 'srt'
            ? '#key-srt-host-input'
            : platform === 'rtmp'
              ? '#key-custom-server-input'
              : '#stream-key-input';
    $(next)?.focus({ preventScroll: true });
}

function showKeyNotice(suffix: string, text: string) {
    const notice = document.querySelector<HTMLElement>(`#stream-key${suffix}-notice`);
    if (!notice) return;
    notice.textContent = text;
    notice.classList.toggle('hidden', !text);
}

// Runs whenever the key box changes: a pasted full address is turned into just the key.
function handleStreamKeyInput(suffix = '') {
    const keyInput = input(`#stream-key${suffix}-input`);
    const platformSelect = select(`#key-server${suffix}-input`);
    if (!platformSelect.value || !/^\s*rtmps?:\/\//.test(keyInput.value)) return;

    const cleaned = cleanStreamKeyInput(platformSelect.value, keyInput.value);
    if (!cleaned.notice) return;

    // A main key that belongs to another known platform moves the choice there; a backup is
    // only cleaned, because its platform is fixed by the main one.
    if (!suffix && cleaned.platform !== platformSelect.value) {
        renderServerInput(cleaned.platform);
        applyBackupLock();
    }
    keyInput.value = cleaned.streamKey;
    if (cleaned.serverUrl) {
        const custom = input(`#key-custom-server${suffix}-input`);
        if (!custom.value.trim()) custom.value = cleaned.serverUrl;
    }
    showKeyNotice(suffix, cleaned.notice);
}

export async function pasteStreamKey(suffix = '') {
    const keyInput = input(`#stream-key${suffix}-input`);
    let text = '';
    try {
        text = (await navigator.clipboard.readText()).trim();
    } catch {
        // The browser may refuse to share the clipboard.
    }
    keyInput.focus();
    if (!text) {
        showErrorAlert(
            'We could not read what you copied. Click in the box and press Ctrl+V (or long-press and choose Paste).',
            false,
        );
        return;
    }
    keyInput.value = text;
    keyInput.dispatchEvent(new Event('input', { bubbles: true }));
}

// ===== Errors =====

function clearKeyErrors() {
    for (const elem of $$('#key-modal .label.text-error')) elem.innerText = '';
    $$('#key-modal .input-error').forEach((elem) => elem.classList.remove('input-error'));
    $$('#key-modal .select-error').forEach((elem) => elem.classList.remove('select-error'));
    $$('#key-modal .picker-error').forEach((elem) => elem.classList.remove('picker-error'));
    for (const elem of $$('#key-modal .field-notice')) {
        elem.textContent = '';
        elem.classList.add('hidden');
    }
    const errorElem = $('#key-form-error');
    errorElem.innerText = '';
    errorElem.classList.add('hidden');
}

function markKeyFieldError(selector: string) {
    const elem = document.querySelector(selector);
    if (!elem) return;
    if (elem.id === 'platform-picker') elem.classList.add('picker-error');
    else elem.classList.add(elem.tagName === 'SELECT' ? 'select-error' : 'input-error');
}

// Shows what is wrong in plain words, marks the field, and takes the person to it: the dialog is
// taller than a phone screen, so the message could otherwise be out of sight.
function setKeyFormError(message: string, selectors: string[] = []) {
    const errorElem = $('#key-form-error');
    errorElem.innerText = message;
    errorElem.classList.remove('hidden');
    selectors.filter(Boolean).forEach(markKeyFieldError);

    const first = selectors
        .filter(Boolean)
        .map((selector) => document.querySelector<HTMLElement>(selector))
        .find((elem) => elem && elem.getClientRects().length > 0);
    const target = first?.id === 'platform-picker' ? first.querySelector('button') : first;
    target?.focus?.({ preventScroll: true });
    (target || errorElem).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

// ===== Save is on only while something changed =====

function readKeyFormState(): string {
    return $$<HTMLInputElement>('#key-modal input, #key-modal select')
        .map((field) => `${field.id}=${String(field.value).trim()}`)
        .join('\n');
}

function updateSaveKeyBtn() {
    $<HTMLButtonElement>('#save-key-btn').disabled =
        keyFormBaseline !== null && readKeyFormState() === keyFormBaseline;
}

// ===== Opening the dialog =====

// The inputs of the event this person may add destinations to.
function renderKeyInputs(eventId: string) {
    const options = inputsOf(app.data, eventId).filter((i) => i.canAddKeys);
    select('#key-input-select').innerHTML =
        '<option value="" disabled>Input</option>' +
        options
            .map((i) => `<option value="${escapeHtml(i.id)}">${escapeHtml(i.name)}</option>`)
            .join('');
}

// `inputId` is the input to start on: the one whose list or heading the button is in.
export function addKeyBtn(inputId = route.input() || shownInput()) {
    const eventId = route.event() ?? '';
    const event = app.data.events.find((e) => e.id === eventId);
    if (!event) return;
    // A destination needs an input of this event, so with none the first thing to add is one.
    if (inputsOf(app.data, eventId).length === 0) {
        if (event.can.manageInputs) return addInputBtn();
        showErrorAlert(
            'An admin of this event needs to add its inputs before destinations can be added.',
        );
        return;
    }

    input('#key-id-input').value = '';
    input('#key-event-input').value = eventId;
    input('#key-name-input').value = '';
    keyGuideExpanded = true;
    $('#key-modal-title').innerText = 'Add a destination';
    $('#save-key-btn').innerText = 'Save destination';
    renderKeyInputs(eventId);
    // Adding while an input is selected starts on that input.
    const inputSelect = select('#key-input-select');
    inputSelect.value = [...inputSelect.options].some((o) => o.value === inputId) ? inputId : '';
    input('#stream-key-input').value = '';
    input('#stream-key2-input').value = '';
    renderServerInput('');
    renderServerInput('', '2');
    applyBackupLock();
    $<HTMLDetailsElement>('#backup-details').open = false;
    input('#key-link-input').value = '';
    input('#key-remarks-input').value = '';
    clearKeyErrors();
    keyFormBaseline = null;
    updateSaveKeyBtn();
    $<HTMLDialogElement>('#key-modal').showModal();
}

export function editKeyById(keyId: string | undefined) {
    const key = app.data.keys.find((k) => k.id === keyId);
    if (!key) return;

    input('#key-id-input').value = key.id;
    input('#key-event-input').value = key.event;
    input('#key-name-input').value = key.name;
    // Someone editing a destination already knows where it came from: keep the guide folded away.
    keyGuideExpanded = false;
    $('#key-modal-title').innerText = 'Edit destination';
    $('#save-key-btn').innerText = 'Save changes';
    renderKeyInputs(key.event);
    select('#key-input-select').value = key.input;
    input('#key-link-input').value = key.link;
    input('#key-remarks-input').value = key.remarks;

    input('#stream-key-input').value = key.streamKey;
    input('#stream-key2-input').value = key.backupStreamKey;
    renderServerInput(key.platform);
    renderServerInput(key.backupPlatform, '2');
    applyBackupLock();
    $<HTMLDetailsElement>('#backup-details').open = Boolean(key.backupStreamKey);

    clearKeyErrors();
    keyFormBaseline = readKeyFormState();
    updateSaveKeyBtn();
    $<HTMLDialogElement>('#key-modal').showModal();
}

// ===== Saving =====

export async function saveKeyForm(event: Event) {
    const id = input('#key-id-input').value.trim();
    const eventId = input('#key-event-input').value.trim();
    const name = input('#key-name-input').value.trim();
    const inputId = select('#key-input-select').value.trim();
    const main = readEndpoint();
    const backup = readEndpoint('2');

    // The platform decides what a backup can be: some have none, some are fixed.
    const rules = normalizeBackup({
        platform: main.platform,
        streamKey: main.streamKey,
        backupPlatform: backup.platform,
        backupStreamKey: backup.streamKey,
    });
    const fields = {
        event: eventId,
        name,
        input: inputId,
        platform: rules.platform,
        streamKey: rules.streamKey,
        backupPlatform: rules.backupPlatform,
        backupStreamKey: rules.backupStreamKey,
        link: input('#key-link-input').value.trim(),
        remarks: input('#key-remarks-input').value.trim(),
    };

    clearKeyErrors();
    const stop = (message: string, selectors: string[]) => {
        setKeyFormError(message, selectors);
        event.preventDefault();
    };

    const nameProblem = destinationNameProblem(name);
    if (nameProblem) return stop(nameProblem, ['#key-name-input']);
    if (inputId === '') return stop('Choose the input of this destination.', ['#key-input-select']);

    const mainProblem = endpointFault(main, true);
    if (mainProblem) return stop(mainProblem.message, [selectorFor(mainProblem.field, '')]);

    // A platform that sets its own backup up (or has none) has nothing to check there, and
    // Facebook's empty backup is simply no backup.
    const rule = backupRule(rules.platform);
    const checksBackup =
        rule === 'free'
            ? Boolean(backup.platform || backup.check)
            : rule === 'fixed' && Boolean(backup.check);
    const backupProblem = checksBackup ? endpointFault(backup, false) : null;
    if (backupProblem) return stop(backupProblem.message, [selectorFor(backupProblem.field, '2')]);

    const others = app.data.keys.filter((k) => k.event === eventId && k.id !== id);
    const clash = findClash(fields, others);
    if (clash) {
        const suffix = clash.part === 'backup' ? '2' : '';
        const platform = clash.part === 'backup' ? backup.platform : main.platform;
        return stop(clash.message, endpointSelectors(platform, suffix));
    }

    await actions.saveKey(fields, id);
}
