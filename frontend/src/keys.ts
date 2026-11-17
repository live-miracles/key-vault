// @ts-nocheck

function getRtmpValue(server, key) {
    if (!server || !key) {
        return '';
    }

    if (isFullUrlKeyServer(server)) {
        return key;
    }

    let serverUrl = SERVERS[server]?.value || server;
    if (serverUrl.includes('${s_prp}')) {
        const params = new URLSearchParams(key.split('?')[1]);
        serverUrl = serverUrl.replaceAll('${s_prp}', params.get('s_prp'));
    }

    return serverUrl + key;
}

function getRtmpPreview(server, key) {
    const fullValue = getRtmpValue(server, key);
    if (!fullValue) {
        return '';
    }

    if (fullValue.length <= 28) {
        return fullValue;
    }

    return fullValue.substring(0, 25) + ' … ' + key.slice(-3);
}

function getPlatformNamePreview(name) {
    return name.length > 30 ? name.slice(0, 25) + ' ...' : name;
}

function getKeyMainUrl(key) {
    return getRtmpValue(key.server, key.key);
}

function getKeyBackupEndpoint(key) {
    if (key.server === 'yt' && key.key) {
        return { server: YOUTUBE_BACKUP_SERVER_URL, key: key.key };
    }
    return { server: key.server2, key: key.key2 };
}

function getKeyBackupUrl(key) {
    const backup = getKeyBackupEndpoint(key);
    return getRtmpValue(backup.server, backup.key);
}

function getKeyUrlCopyPayload(key, url) {
    return JSON.stringify({ name: key.name, url });
}

function hasStreamingConfigChanged(oldKey, key) {
    if (!oldKey) return false;
    return ['server', 'key', 'server2', 'key2'].some(
        (field) => String(oldKey[field] ?? '') !== String(key[field] ?? ''),
    );
}

function isFullUrlKeyServer(server) {
    return server === 'rtmp' || server === 'srt';
}

const DEFAULT_SRT_SETTINGS = {
    mode: 'caller',
    host: '',
    port: '',
    latencyMs: 240,
    passphrase: '',
    pbKeyLen: '',
    streamId: '',
};

function splitRtmpUrl(url) {
    if (!url) return { serverUrl: '', streamKey: '' };
    if (!url.startsWith('rtmp://') && !url.startsWith('rtmps://')) {
        return { serverUrl: '', streamKey: url };
    }
    const lastSlash = url.lastIndexOf('/');
    if (lastSlash < 0) return { serverUrl: url, streamKey: '' };
    return {
        serverUrl: url.slice(0, lastSlash + 1),
        streamKey: url.slice(lastSlash + 1),
    };
}

function joinRtmpUrl(serverUrl, streamKey) {
    if (!serverUrl || !streamKey) return '';
    const normalizedServerUrl = serverUrl.endsWith('/') ? serverUrl : serverUrl + '/';
    return normalizedServerUrl + streamKey;
}

function detectKnownRtmpServerUrl(url) {
    const value = String(url ?? '').trim();
    if (!value) return null;

    for (const serverId of KNOWN_RTMP_URL_SERVER_IDS) {
        const serverUrl = SERVERS[serverId].value;
        if (value === serverUrl) return { server: serverId, streamKey: '' };
        if (value.startsWith(serverUrl)) {
            return {
                server: serverId,
                streamKey: value.slice(serverUrl.length),
            };
        }
    }

    return null;
}

function parseSrtUrl(url) {
    if (!String(url ?? '').startsWith('srt://')) return { ...DEFAULT_SRT_SETTINGS };

    try {
        const parsed = new URL(url);
        const latency = Number(parsed.searchParams.get('latency') ?? '');
        const port = Number(parsed.port || '');
        const pbKeyLen = Number(parsed.searchParams.get('pbkeylen') ?? '');
        return {
            mode: parsed.searchParams.get('mode') === 'listener' ? 'listener' : 'caller',
            host: parsed.hostname,
            port: Number.isInteger(port) && port > 0 ? String(port) : '',
            latencyMs:
                Number.isInteger(latency) && latency > 0 ? String(Math.round(latency / 1000)) : '',
            passphrase: parsed.searchParams.get('passphrase') ?? '',
            pbKeyLen: [16, 24, 32].includes(pbKeyLen) ? String(pbKeyLen) : '',
            streamId: parsed.searchParams.get('streamid') ?? '',
        };
    } catch (_) {
        return { ...DEFAULT_SRT_SETTINGS };
    }
}

function buildSrtUrl(settings) {
    const params = new URLSearchParams();
    params.set('mode', settings.mode);
    params.set('latency', String(settings.latencyMs * 1000));
    if (settings.passphrase) {
        params.set('passphrase', settings.passphrase);
        params.set('pbkeylen', String(settings.pbKeyLen || 32));
    }
    if (settings.streamId) params.set('streamid', settings.streamId);
    return `srt://${settings.host}:${settings.port}?${params.toString()}`;
}

function setSrtInputs(settings, suffix = '') {
    document.querySelector('#key-srt-host' + suffix + '-input').value = settings.host;
    document.querySelector('#key-srt-port' + suffix + '-input').value = settings.port;
    document.querySelector('#key-srt-mode' + suffix + '-input').value = settings.mode;
    document.querySelector('#key-srt-latency' + suffix + '-input').value = settings.latencyMs;
    document.querySelector('#key-srt-passphrase' + suffix + '-input').value = settings.passphrase;
    document.querySelector('#key-srt-keylen' + suffix + '-input').value = settings.pbKeyLen;
    document.querySelector('#key-srt-streamid' + suffix + '-input').value = settings.streamId;
}

function getSrtSettings(suffix = '') {
    return {
        host: document.querySelector('#key-srt-host' + suffix + '-input').value.trim(),
        port: Number(document.querySelector('#key-srt-port' + suffix + '-input').value.trim()),
        mode:
            document.querySelector('#key-srt-mode' + suffix + '-input').value === 'listener'
                ? 'listener'
                : 'caller',
        latencyMs: Number(
            document.querySelector('#key-srt-latency' + suffix + '-input').value.trim(),
        ),
        passphrase: document.querySelector('#key-srt-passphrase' + suffix + '-input').value.trim(),
        pbKeyLen: Number(document.querySelector('#key-srt-keylen' + suffix + '-input').value) || '',
        streamId: document.querySelector('#key-srt-streamid' + suffix + '-input').value.trim(),
    };
}

function renderKeyTable(eventId = null) {
    if (!eventId && isOverviewView()) return renderOverview();

    const eventKeys = config.keys
        .filter((k) => k.event === eventId)
        .sort((a, b) => {
            const orderDiff = getInputOrder(a.input) - getInputOrder(b.input);
            if (orderDiff !== 0) return orderDiff;
            return getInputName(a.input).localeCompare(getInputName(b.input));
        });
    // The left panel picks an input; the table shows only that input's keys. Duplicate
    // URLs are still checked against the whole event, so a clash is never hidden by a filter.
    const input = renderInputPanel(eventId, eventKeys);
    renderInputBanner(input);
    const keys = input ? eventKeys.filter((k) => k.input === input) : eventKeys;
    const allUrls = eventKeys.flatMap((key) =>
        [getKeyMainUrl(key), getKeyBackupUrl(key)].filter(Boolean),
    );

    const renderedKeys = keys.map((k, i) => {
        const { color, title: detailTitle } = getKeyDisplay(k, keyStatus);
        const note = k.pending
            ? null
            : describeKeyNote(k, keyStatus, Date.now(), getInputName(k.input));
        const pillHtml = keyStatusPillHtml(note, k.pending);
        const noteTextHtml = keyNoteTextHtml(note);
        // Hovering gives owners and admins bunryu's own report; everyone else the note.
        const statusTitle = hasRoleAccess(eventRoles, ACTIONS.UPDATE, k.event)
            ? detailTitle
            : note
              ? [note.label, note.text].filter(Boolean).join(': ')
              : '';
        const link = safeUrl(k.link);
        const canManageKey = hasKeyAccess(eventRoles, ACTIONS.UPDATE, k.event, k.input);
        const isPending = Boolean(k.pending);
        const keyIdAttr = escapeHtml(k.id);
        const actions = isPending
            ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
            : canManageKey
              ? `
                    <div class="flex justify-center gap-1">
                        <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Edit" aria-label="Edit key" data-action="edit-key-by-id">
                            ${iconSvg('pen')}
                        </button>
                        <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="Delete" aria-label="Delete key" data-action="delete-key-by-id">
                            ${iconSvg('trash')}
                        </button>
                    </div>
                `
              : '';
        const mainUrl = getKeyMainUrl(k);
        const backupEndpoint = getKeyBackupEndpoint(k);
        const backupUrl = getKeyBackupUrl(k);
        const cnt = allUrls.filter((url) => url === mainUrl).length;
        const cnt2 = backupUrl ? allUrls.filter((url) => url === backupUrl).length : 0;
        const mainUrlCell = renderCopyableTextCell({
            text: getRtmpPreview(k.server, k.key),
            value: mainUrl,
            title: mainUrl,
            className: cnt > 1 ? 'text-error' : '',
            disabled: isPending || !mainUrl,
        });
        const backupUrlCell = renderCopyableTextCell({
            text: getRtmpPreview(backupEndpoint.server, backupEndpoint.key),
            value: backupUrl,
            title: backupUrl,
            className: cnt2 > 1 ? 'text-error' : '',
            disabled: isPending || !backupUrl,
        });
        const webLinkCell = link
            ? renderCopyableTextCell({
                  text: getMiddleEllipsisText(k.link, 20, 15, 3),
                  value: k.link,
                  title: k.link,
                  href: link,
                  disabled: isPending,
              })
            : '';

        // In the All view each input's destinations sit under one heading across the grid.
        const startsGroup = !input && (i === 0 || keys[i - 1].input !== k.input);
        const groupKeys = startsGroup ? keys.filter((key) => key.input === k.input) : [];
        const groupHeading = startsGroup
            ? `<div class="input-group-heading">
                   <span class="input-group-name">${inputDotHtml(k.input)}${inputLabelHtml(k.input)}</span>
                   <span class="lang-item-pills">${statusPillsHtml(summarizeKeyStatuses(groupKeys, keyStatus))}</span>
                   <span class="lang-item-count">${groupKeys.length}</span>
               </div>`
            : '';
        const nameCopyButton = isPending
            ? ''
            : `<button type="button" class="btn btn-ghost btn-square btn-xs text-accent shrink-0" title="Copy the name" aria-label="Copy the name" data-action="copy-text" data-copy-value="${escapeHtml(k.name)}">${iconSvg('copy')}</button>`;
        // A card: its status first, so what matters is read before anything else, then the
        // name, what the status means, and the links.
        const card = `
                <article class="dest-card ${color.bgCss}" data-key-id="${keyIdAttr}" title="${escapeHtml(statusTitle)}">
                    <div class="dest-card-head">
                        ${pillHtml}
                        <h4 class="dest-card-name" title="${escapeHtml(k.name)}">${escapeHtml(k.name || '(unnamed)')}</h4>
                        ${nameCopyButton}
                        ${actions ? `<div class="dest-card-actions">${actions}</div>` : ''}
                    </div>
                    ${noteTextHtml}
                    <div class="dest-card-fields">
                        ${renderKeyField('Main stream', mainUrlCell)}
                        ${renderKeyField('Backup stream', backupUrlCell)}
                        ${renderKeyField('Watch link', webLinkCell)}
                        ${renderKeyField('Notes', escapeHtml(k.remarks || ''))}
                    </div>
                </article>`;
        return groupHeading + card;
    });

    renderKeysEmptyState(
        keys.length === 0,
        hasKeyAccess(eventRoles, ACTIONS.CREATE, eventId),
        eventId,
    );

    document.querySelector('#key-cards').innerHTML = renderedKeys.join('');

    document.querySelectorAll('#key-cards [data-key-id]').forEach((card) => {
        card.addEventListener('dblclick', (event) => {
            if (event.target.closest('button, a, input, select, textarea')) return;
            showKeyColorMenu(event, card.dataset.keyId);
        });
    });
}

// When the chosen input is in trouble, say so above its streams.
function renderInputBanner(inputId) {
    const banner = document.querySelector('#input-banner');
    const info = inputId ? describeInputBanner(inputId, getInputName(inputId), keyStatus) : null;
    banner.classList.toggle('hidden', !info);
    banner.className = banner.className.replace(/input-banner-w+/g, '').trim();
    if (!info) {
        banner.textContent = '';
        return;
    }
    banner.classList.add(`input-banner-${info.state}`);
    banner.innerHTML = `<span class="status-pill status-${info.state}">${escapeHtml(info.label)}</span><span>${escapeHtml(info.text)}</span>`;
}

// With nothing to show, say what to do next instead of leaving a blank table.
function renderKeysEmptyState(isEmpty, canAdd, eventId) {
    document.querySelector('#keys-empty').classList.toggle('hidden', !isEmpty);
    document.querySelector('#key-cards').classList.toggle('hidden', isEmpty);
    // A stream needs an input, so an event with none starts by adding one.
    const noInputs = getInputs(eventId).length === 0;
    const canAddInput = hasInputAccess(eventRoles, eventId);
    const button = document.querySelector('#keys-empty-add');
    const addsInput = noInputs && canAddInput;
    button.classList.toggle('hidden', noInputs ? !canAddInput : !canAdd);
    button.dataset.action = addsInput ? 'add-input' : 'add-key';
    document.querySelector('#keys-empty-add-label').textContent = addsInput
        ? 'Add your first input'
        : 'Add your first destination';
    document.querySelector('#keys-empty-title').textContent = noInputs
        ? 'No inputs here yet'
        : 'No destinations here yet';
    document.querySelector('#keys-empty-text').textContent = noInputs
        ? canAddInput
            ? 'An input is one feed of this event, for example “Hindi”. Add one for each feed, then add its destinations.'
            : 'An admin of this event needs to add its inputs before destinations can be added.'
        : canAdd
          ? 'Add a destination for each place you will go live, such as YouTube or Facebook. We will show you where to find the stream key.'
          : 'Nothing has been added for you to see yet.';
}

function renderKeyField(label, content) {
    if (!content) return '';

    return `
        <div class="dest-card-field">
            <div class="dest-card-label">${escapeHtml(label)}</div>
            <div class="dest-card-value">${content}</div>
        </div>
    `;
}

function renderCopyableTextCell({
    text,
    value,
    title,
    href = '',
    className = '',
    disabled = false,
}) {
    if (!value) return '';

    const content = href
        ? `<a href="${escapeHtml(href)}" class="link ${escapeHtml(className)}" target="_blank" rel="noopener noreferrer" title="${escapeHtml(title)}">${escapeHtml(text)}</a>`
        : `<span class="${escapeHtml(className)}" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`;
    const copyButton = disabled
        ? ''
        : `
            <button type="button" class="btn btn-ghost btn-square btn-xs text-accent shrink-0" title="Copy" aria-label="Copy" data-action="copy-text" data-copy-value="${escapeHtml(value)}">
                ${iconSvg('copy')}
            </button>
        `;

    return `<div class="flex items-center justify-center gap-1">${content}${copyButton}</div>`;
}

let selectedKeyId = null;

function hideKeyColorMenu() {
    document.getElementById('key-color-menu')?.classList.add('hidden');
}

function showKeyColorMenu(event, keyId) {
    event.preventDefault();

    const key = config.keys.find((k) => k.id === keyId);
    if (!key || key.pending) {
        hideKeyColorMenu();
        return;
    }

    selectedKeyId = keyId;
    document.getElementById('role-context-menu').classList.add('hidden');

    const menu = document.getElementById('key-color-menu');
    const options = document.getElementById('key-color-menu-options');
    const copyActions = [
        { type: 'main', label: 'Main', url: getKeyMainUrl(key) },
        { type: 'backup', label: 'Backup', url: getKeyBackupUrl(key) },
    ]
        .filter((action) => action.url)
        .map(
            (action) => `
                <li>
                    <button type="button" data-action="copy-selected-key-url" data-action-type="${escapeHtml(action.type)}">
                        ${iconSvg('copy')}
                        <span>${escapeHtml(action.label)}</span>
                    </button>
                </li>
            `,
        );
    if (!copyActions.length) {
        hideKeyColorMenu();
        return;
    }
    options.innerHTML = copyActions.join('');

    menu.classList.remove('hidden');

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    let x = event.clientX;
    let y = event.clientY - rect.height / 2;

    if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - margin;
    }
    if (y < margin || y + rect.height > window.innerHeight - margin) {
        if (event.clientY + rect.height + margin <= window.innerHeight) {
            y = event.clientY;
        } else if (event.clientY - rect.height - margin >= 0) {
            y = event.clientY - rect.height;
        } else {
            y = Math.min(window.innerHeight - rect.height - margin, Math.max(margin, y));
        }
    }

    menu.style.left = `${Math.max(margin, x)}px`;
    menu.style.top = `${Math.max(margin, y)}px`;
}

async function copySelectedKeyUrl(type) {
    if (!selectedKeyId) return;
    hideKeyColorMenu();

    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
        return;
    }

    const url = type === 'backup' ? getKeyBackupUrl(key) : getKeyMainUrl(key);
    if (!url) return;

    await copyTextValue(getKeyUrlCopyPayload(key, url));
}

function editKeyById(keyId) {
    selectedKeyId = keyId;
    editKeyRow();
}

function deleteKeyById(keyId) {
    selectedKeyId = keyId;
    deleteKeyRow();
}

// `inputId` is the input to start on: the one whose list or heading the button is in.
async function addKeyBtn(inputId = getUrlParam('input')) {
    const eventId = getUrlParam('event');
    const event = config.events.find((e) => e.id === eventId);
    if (!event) {
        console.error('Event not found:', eventId);
        return;
    }
    // A stream needs an input of this event, so with none the first thing to add is one.
    if (getInputs(eventId).length === 0) {
        if (hasInputAccess(eventRoles, eventId)) return addInputBtn();
        showErrorAlert(
            'An admin of this event needs to add its inputs before streams can be added.',
        );
        return;
    }

    document.querySelector('#key-id-input').value = '';
    document.querySelector('#key-event-input').value = eventId;
    document.querySelector('#key-name-input').value = '';
    suggestedStreamName = '';
    keyGuideExpanded = true;
    document.querySelector('#key-modal-title').innerText = 'Add a destination';
    document.querySelector('#save-key-btn').innerText = 'Save destination';
    renderKeyInputs(eventId, ACTIONS.CREATE);
    // Adding while a input is selected starts on that input.
    const inputSelect = document.querySelector('#key-input-select');
    const selectedInput = inputId;
    inputSelect.value = [...inputSelect.options].some((o) => o.value === selectedInput)
        ? selectedInput
        : '';
    document.querySelector('#stream-key-input').value = '';
    document.querySelector('#stream-key2-input').value = '';
    renderServerInput('');
    renderServerInput('', '2');
    applyBackupServerLock();
    document.querySelector('#backup-details').open = false;
    document.querySelector('#key-link-input').value = '';
    document.querySelector('#key-remarks-input').value = '';
    clearKeyErrors();

    document.querySelector('#key-modal').showModal();
}

function editKeyRow() {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
        return;
    }

    document.querySelector('#key-id-input').value = key.id;
    document.querySelector('#key-event-input').value = key.event;
    document.querySelector('#key-name-input').value = key.name;
    suggestedStreamName = '';
    // Someone editing a key already knows where it came from: keep the guide folded away.
    keyGuideExpanded = false;
    document.querySelector('#key-modal-title').innerText = 'Edit destination';
    document.querySelector('#save-key-btn').innerText = 'Save changes';
    renderKeyInputs(key.event, ACTIONS.UPDATE);
    document.querySelector('#key-input-select').value = key.input;
    document.querySelector('#key-link-input').value = key.link;
    document.querySelector('#key-remarks-input').value = key.remarks;

    document.querySelector('#stream-key-input').value = key.key;
    document.querySelector('#stream-key2-input').value = key.key2;
    renderServerInput(key.server);
    renderServerInput(key.server2, '2');
    applyBackupServerLock();
    document.querySelector('#backup-details').open = Boolean(key.key2);

    clearKeyErrors();

    document.getElementById('key-modal').showModal();
}

function clearKeyErrors() {
    document.querySelectorAll('#key-modal .label.text-error').forEach((elem) => {
        elem.innerText = '';
    });
    document.querySelectorAll('#key-modal .input-error').forEach((elem) => {
        elem.classList.remove('input-error');
    });
    document.querySelectorAll('#key-modal .select-error').forEach((elem) => {
        elem.classList.remove('select-error');
    });
    document.querySelectorAll('#key-modal .picker-error').forEach((elem) => {
        elem.classList.remove('picker-error');
    });
    document.querySelectorAll('#key-modal .field-notice').forEach((elem) => {
        elem.textContent = '';
        elem.classList.add('hidden');
    });
    const errorElem = document.querySelector('#key-form-error');
    errorElem.innerText = '';
    errorElem.classList.add('hidden');
}

function markKeyFieldError(selector) {
    const elem = document.querySelector(selector);
    if (!elem) return;
    if (elem.id === 'platform-picker') elem.classList.add('picker-error');
    else elem.classList.add(elem.tagName === 'SELECT' ? 'select-error' : 'input-error');
}

// Shows what is wrong in plain words, marks the field, and takes the person to it: the
// dialog is taller than a phone screen, so the message could otherwise be out of sight.
function setKeyFormError(message, selectors = []) {
    const errorElem = document.querySelector('#key-form-error');
    errorElem.innerText = message;
    errorElem.classList.remove('hidden');
    selectors.filter(Boolean).forEach(markKeyFieldError);

    const first = selectors
        .filter(Boolean)
        .map((selector) => document.querySelector(selector))
        .find((elem) => elem && elem.getClientRects().length > 0);
    const target = first?.id === 'platform-picker' ? first.querySelector('button') : first;
    target?.focus?.({ preventScroll: true });
    (target || errorElem).scrollIntoView?.({ block: 'center', behavior: 'smooth' });
}

function readEndpoint(suffix = '') {
    const selectedServer = document.getElementById('key-server' + suffix + '-input').value;
    if (!selectedServer) return { server: '', key: '', label: 'URL' };

    if (selectedServer === 'srt') {
        const settings = getSrtSettings(suffix);
        return {
            server: 'srt',
            key: buildSrtUrl(settings),
            settings,
            label: 'SRT',
        };
    }

    if (selectedServer === 'rtmp') {
        const serverUrl = document
            .getElementById('key-custom-server' + suffix + '-input')
            .value.trim();
        const streamKey = document.getElementById('stream-key' + suffix + '-input').value.trim();
        return {
            server: 'rtmp',
            key: joinRtmpUrl(serverUrl, streamKey),
            serverUrl,
            streamKey,
            label: 'RTMP',
        };
    }

    return {
        server: selectedServer,
        key: document.getElementById('stream-key' + suffix + '-input').value.trim(),
        label: 'RTMP',
    };
}

function setEndpointError(suffix, field, message) {
    const errorSelector =
        field === 'select'
            ? suffix
                ? '#key-server2-input'
                : '#platform-picker'
            : field === 'server'
              ? '#key-custom-server' + suffix + '-input'
              : '#stream-key' + suffix + '-input';
    setKeyFormError(message, [errorSelector]);
}

function setSrtError(suffix, field, message) {
    const fields = {
        host: '#key-srt-host' + suffix + '-input',
        port: '#key-srt-port' + suffix + '-input',
        latency: '#key-srt-latency' + suffix + '-input',
        passphrase: '#key-srt-passphrase' + suffix + '-input',
        keyLen: '#key-srt-keylen' + suffix + '-input',
    };
    setKeyFormError(message, [fields[field]]);
}

function getEndpointErrorSelectors(endpoint, suffix = '') {
    if (endpoint.server === 'srt') {
        return [
            '#key-srt-host' + suffix + '-input',
            '#key-srt-port' + suffix + '-input',
            '#key-srt-streamid' + suffix + '-input',
        ];
    }
    if (endpoint.server === 'rtmp') {
        return ['#key-custom-server' + suffix + '-input', '#stream-key' + suffix + '-input'];
    }
    return ['#stream-key' + suffix + '-input'];
}

function validateSrtEndpoint(endpoint, suffix) {
    const { settings } = endpoint;
    const portValid =
        Number.isInteger(settings.port) && settings.port >= 1 && settings.port <= 65535;
    const latencyValid = Number.isInteger(settings.latencyMs) && settings.latencyMs > 0;
    const passphraseValid =
        !settings.passphrase ||
        (settings.passphrase.length >= 10 && settings.passphrase.length <= 79);
    const keyLenValid = !settings.passphrase || [16, 24, 32].includes(settings.pbKeyLen);

    if (!settings.host) {
        setSrtError(suffix, 'host', 'Enter the server address (hostname) your provider gave you.');
        return false;
    }
    if (!portValid) {
        setSrtError(suffix, 'port', 'The port is a number between 1 and 65535.');
        return false;
    }
    if (!latencyValid) {
        setSrtError(
            suffix,
            'latency',
            'The delay buffer must be a number above 0 (240 is a safe start).',
        );
        return false;
    }
    if (!passphraseValid) {
        setSrtError(suffix, 'passphrase', 'The password must be 10 to 79 characters long.');
        return false;
    }
    if (!keyLenValid) {
        setSrtError(suffix, 'keyLen', 'Choose an encryption strength when you set a password.');
        return false;
    }
    return true;
}

function validateEndpoint(endpoint, suffix = '', required = false) {
    if (!endpoint.server && !endpoint.key && !required) return true;
    if (!endpoint.server) {
        setEndpointError(suffix, 'select', "Please choose where you're streaming to.");
        return false;
    }

    if (endpoint.server === 'srt') {
        return validateSrtEndpoint(endpoint, suffix);
    }

    if (endpoint.server === 'rtmp') {
        const address = endpoint.serverUrl;
        if (!address) {
            setEndpointError(
                suffix,
                'server',
                'Enter the server address your provider gave you. It starts with rtmp:// or rtmps://',
            );
            return false;
        }
        if (!/^rtmps?:\/\//.test(address) || /\s/.test(address)) {
            setEndpointError(
                suffix,
                'server',
                'The server address must start with rtmp:// or rtmps:// and have no spaces.',
            );
            return false;
        }
    }

    const problem = getStreamKeyProblem(endpoint.server, endpoint.streamKey ?? endpoint.key);
    if (problem) {
        setEndpointError(suffix, 'key', problem);
        return false;
    }

    return true;
}

async function saveKeyFormBtn(event) {
    const mainEndpoint = readEndpoint();
    let backupEndpoint = readEndpoint('2');
    if (isLockedBackupServer(mainEndpoint.server) && !backupEndpoint.key) {
        backupEndpoint = { server: '', key: '', label: backupEndpoint.label };
    }
    const key = {
        id: document.getElementById('key-id-input').value.trim(),
        event: document.getElementById('key-event-input').value.trim(),
        name: document.getElementById('key-name-input').value.trim(),
        input: document.getElementById('key-input-select').value.trim(),
        server: mainEndpoint.server,
        key: mainEndpoint.key,
        server2: backupEndpoint.server,
        key2: backupEndpoint.key,
        link: document.getElementById('key-link-input').value.trim(),
        remarks: document.getElementById('key-remarks-input').value.trim(),
    };
    enforceLockedBackup(key);

    // The form has no color: bunryu colors the row. A color set by hand from the row's menu
    // is kept, unless the destination changed (then it was set for a different stream).
    const oldKey = key.id ? config.keys.find((k) => k.id === key.id) : null;
    key.color = oldKey && !hasStreamingConfigChanged(oldKey, key) ? oldKey.color : KEY_COLORS.NONE;

    // Validation
    clearKeyErrors();
    if (key.name === '') {
        setKeyFormError(
            'Give this destination a name your team will recognise, for example "YouTube English".',
            ['#key-name-input'],
        );
        event.preventDefault();
        return;
    } else if (!/^[a-zA-Z0-9_\- ]*$/.test(key.name)) {
        setKeyFormError('Please use only letters, numbers, spaces, - and _ in the name.', [
            '#key-name-input',
        ]);
        event.preventDefault();
        return;
    }
    if (key.input === '') {
        setKeyFormError('Choose the input of this destination.', ['#key-input-select']);
        event.preventDefault();
        return;
    }

    if (!validateEndpoint(mainEndpoint, '', true)) {
        event.preventDefault();
        return;
    }

    if (
        config.keys
            .filter((k) => k.id !== key.id && k.event === key.event)
            .some(
                (k) =>
                    getKeyMainUrl(k) === getKeyMainUrl(key) ||
                    getKeyBackupUrl(k) === getKeyMainUrl(key),
            )
    ) {
        setKeyFormError(
            'This destination is already added in this event (same address and key).',
            getEndpointErrorSelectors(mainEndpoint),
        );
        event.preventDefault();
        return;
    }

    if (!validateEndpoint(backupEndpoint, '2')) {
        event.preventDefault();
        return;
    }

    if (
        getKeyBackupUrl(key) &&
        config.keys
            .filter((k) => k.id !== key.id && k.event === key.event)
            .some(
                (k) =>
                    getKeyMainUrl(k) === getKeyBackupUrl(key) ||
                    getKeyBackupUrl(k) === getKeyBackupUrl(key),
            )
    ) {
        setKeyFormError(
            'This backup is already used by another destination in this event.',
            getEndpointErrorSelectors(backupEndpoint, '2'),
        );
        event.preventDefault();
        return;
    }

    if (
        getKeyBackupUrl(key) &&
        !isLockedBackupServer(key.server) &&
        getKeyMainUrl(key) === getKeyBackupUrl(key)
    ) {
        setKeyFormError(
            'The backup must be different from the main stream.',
            getEndpointErrorSelectors(backupEndpoint, '2'),
        );
        event.preventDefault();
        return;
    }

    // Sending request
    const snapshot = cloneConfig();
    const isAdd = key.id === '';
    const optimisticKey = {
        ...key,
        id: isAdd ? newTempId() : key.id,
        pending: isAdd,
    };
    replaceConfigItem('keys', optimisticKey, key.id || optimisticKey.id);
    renderKeyTable(key.event);

    showLoading();
    if (key.id === '') {
        // Adding new row
        console.assert(key.event);

        try {
            const newKey = processResponse(await api('addKey', key));
            if (newKey === null) {
                restoreConfig(snapshot, key.event);
                return;
            }
            replaceConfigItem('keys', newKey, optimisticKey.id);
            renderKeyTable(newKey.event);
        } finally {
            hideLoading();
        }
    } else {
        // Updating existing row
        try {
            const newKey = processResponse(await api('editKey', key));
            if (newKey === null) {
                restoreConfig(snapshot, key.event);
                return;
            }
            replaceConfigItem('keys', newKey);
            renderKeyTable(newKey.event);
        } finally {
            hideLoading();
        }
    }
}

async function deleteKeyRow() {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
        return;
    }

    if (!confirm(`Are you sure you want to delete key "${key.name}"?`)) {
        return;
    }

    const snapshot = cloneConfig();
    config.keys = config.keys.filter((k) => k.id !== key.id);
    renderKeyTable(key.event);

    showLoading();
    try {
        const res = processResponse(await api('deleteKey', key.id));
        if (res === null) {
            restoreConfig(snapshot, key.event);
        }
    } finally {
        hideLoading();
    }
}

function showCopiedNotification() {
    const notification = document.getElementById('copied-notification');
    if (!notification) return;

    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 2000);
}

async function copyTextValue(text) {
    if (text && (await copyText(text))) {
        showCopiedNotification();
    }
}

function renderKeyInputs(eventId, action = ACTIONS.CREATE) {
    renderInputSelect('#key-input-select', { eventId, action, placeholder: 'Input' });
}

function renderServerInput(server, suffix = '') {
    const select = document.querySelector('#key-server' + suffix + '-input');
    const customServer = document.querySelector('#custom-server' + suffix);
    const customServerInput = document.querySelector('#key-custom-server' + suffix + '-input');
    const streamKeyField = document.querySelector('#stream-key' + suffix + '-field');
    const streamKeyInput = document.querySelector('#stream-key' + suffix + '-input');
    const srtServer = document.querySelector('#srt-server' + suffix);
    const isCustomRtmp = server === 'rtmp';
    const isCustomSrt = server === 'srt';
    const isKnownServer = Object.prototype.hasOwnProperty.call(SERVERS, server);
    const shouldHideStreamKey = isCustomSrt || !server;

    select.value = isKnownServer ? server : '';
    customServer.classList.toggle('hidden', !isCustomRtmp);
    streamKeyField.classList.toggle('hidden', shouldHideStreamKey);
    srtServer.classList.toggle('hidden', !isCustomSrt);

    if (!server) {
        streamKeyInput.value = '';
    }

    if (isCustomRtmp) {
        const rtmpParts = splitRtmpUrl(streamKeyInput.value);
        customServerInput.value = rtmpParts.serverUrl;
        streamKeyInput.value = rtmpParts.streamKey;
    } else {
        customServerInput.value = '';
    }

    if (isCustomSrt) {
        setSrtInputs(parseSrtUrl(streamKeyInput.value), suffix);
    } else {
        setSrtInputs(DEFAULT_SRT_SETTINGS, suffix);
    }

    if (!suffix) syncPlatformPicker(isKnownServer ? server : '');
}

function convertKnownCustomServerUrl(suffix = '') {
    const customServerInput = document.querySelector('#key-custom-server' + suffix + '-input');
    const streamKeyInput = document.querySelector('#stream-key' + suffix + '-input');
    const knownServer = detectKnownRtmpServerUrl(customServerInput.value);
    if (!knownServer) return false;

    if (knownServer.streamKey) {
        streamKeyInput.value = knownServer.streamKey;
    }
    renderServerInput(knownServer.server, suffix);
    if (!suffix) applyBackupServerLock();
    return true;
}

function isLockedBackupServer(server) {
    return Object.prototype.hasOwnProperty.call(LOCKED_BACKUP_BY_SERVER, server);
}

function enforceLockedBackup(key) {
    if (HIDDEN_BACKUP_BY_SERVER[key.server]) {
        key.server2 = '';
        key.key2 = '';
        return;
    }

    const backupServer = LOCKED_BACKUP_BY_SERVER[key.server];
    if (!backupServer) return;

    if (!key.key2) {
        key.server2 = '';
        return;
    }

    key.server2 = backupServer;
}

function applyBackupServerLock() {
    const primaryServer = document.querySelector('#key-server-input').value;
    const backupSection = document.querySelector('#backup-section');
    const backupDetails = document.querySelector('#backup-details');
    const backupNote = document.querySelector('#backup-note');
    const backupServerInput = document.querySelector('#key-server2-input');
    const backupCustomServerInput = document.querySelector('#key-custom-server2-input');
    const backupKeyInput = document.querySelector('#stream-key2-input');
    const backupServer = LOCKED_BACKUP_BY_SERVER[primaryServer];
    const isLocked = Boolean(backupServer);
    const isHidden = !primaryServer || Boolean(HIDDEN_BACKUP_BY_SERVER[primaryServer]);
    const note = BACKUP_NOTES[primaryServer] || '';

    backupSection.classList.toggle('hidden', !primaryServer);
    backupDetails.classList.toggle('hidden', isHidden);
    backupNote.textContent = note;
    backupNote.classList.toggle('hidden', !note);

    if (isHidden) {
        renderServerInput('', '2');
        backupKeyInput.value = '';
        backupDetails.open = false;
    }

    if (isLocked) {
        renderServerInput(backupServer, '2');
    }

    backupServerInput.disabled = isLocked;
    backupCustomServerInput.disabled = isLocked;
    backupKeyInput.disabled = false;
    backupKeyInput.readOnly = false;
    backupKeyInput.classList.remove('cursor-not-allowed');
}

const KEY_COLORS = {
    NONE: '',
    ERROR: '1',
    WARNING: '3',
    CONFIGURED: '6',
};

const COLORS = {
    [KEY_COLORS.NONE]: { name: 'None', css: '', bgCss: '' },
    [KEY_COLORS.ERROR]: { name: '🔴 Error', css: 'text-error', bgCss: 'tint-error' },
    [KEY_COLORS.WARNING]: { name: '🟡 Warning', css: 'text-warning', bgCss: 'tint-warning' },
    [KEY_COLORS.CONFIGURED]: {
        name: '🟣 Configured',
        css: 'text-accent',
        bgCss: 'tint-configured',
    },
};

// What bunryu reports shows as a color of its own unless an owner or admin set one by hand.
const STATUS_COLORS = {
    running: { name: '🟢 Running', css: 'text-success', bgCss: 'tint-running' },
    warning: COLORS[KEY_COLORS.WARNING],
    error: COLORS[KEY_COLORS.ERROR],
    stopped: COLORS[KEY_COLORS.CONFIGURED],
};

const STATUS_LABELS = {
    running: 'Running',
    warning: 'Warning',
    error: 'Error',
    stopped: 'Configured, not running',
};

// A problem outranks a healthy stream, which outranks one that was stopped on purpose.
const STATUS_RANK = { stopped: 0, running: 1, warning: 2, error: 3 };

// The worse of a key's main and backup status, or null when neither is configured in bunryu.
function getKeyStatus(key, report) {
    const entry = report?.keys?.[key.id];
    if (!entry) return null;
    return [entry.main, entry.backup]
        .filter(Boolean)
        .reduce(
            (worst, status) =>
                !worst || STATUS_RANK[status.status] > STATUS_RANK[worst.status] ? status : worst,
            null,
        );
}

function describeKeyStatus(status) {
    const parts = [STATUS_LABELS[status.status] || status.status];
    if (status.pipeline || status.output) {
        parts.push([status.pipeline, status.output].filter(Boolean).join(' → '));
    }
    if (status.stoppedAfterFailures) {
        parts.push(`stopped after ${status.failures} failed attempts`);
    }
    if (status.message) parts.push(status.message);
    return parts.join(' • ');
}

// The color of a key's row and the hover text that explains it. Only bunryu's report colors a
// row: a color stored on the key (set by hand in an earlier version) is ignored.
function getKeyDisplay(key, report) {
    const status = getKeyStatus(key, report);
    if (status) {
        return {
            color: STATUS_COLORS[status.status] || COLORS[''],
            title: describeKeyStatus(status),
        };
    }
    return { color: COLORS[''], title: '' };
}

// ===== The status note under a stream's name =====
//
// The row color says how a stream is doing; the note says it in words and, when something is
// wrong, what to do. bunryu's own hints are written for the streaming team (hosts, ports,
// FFmpeg), so the advice here is written for the media team: short, in terms of the key, the
// platform and who to tell. It is a lookup on bunryu's redacted message, so an unknown
// message gets the generic line and the raw text is never shown, only copyable.

const NOTE_LABELS = {
    running: 'Live',
    warning: 'Unstable',
    error: 'Problem',
    stopped: 'Not sending',
};

const GENERIC_ADVICE = {
    error: 'Nothing is being sent. Check the stream key and that the stream is started on the platform, then tell the streaming team.',
    warning: 'It is sending, but not smoothly. Tell the streaming team if it keeps happening.',
};

// First match wins, so the more specific patterns come first.
const ADVICE_PATTERNS = [
    [
        /error closing file/i,
        'The platform stopped accepting the stream. This often fixes itself. If it does not, check the platform’s live page.',
    ],
    [
        /server returned 40[13]|unauthorized|forbidden/i,
        'The platform did not accept the stream key. It may be wrong or have expired. Get a fresh key from the platform and update it here.',
    ],
    [
        /connection setup failure|connection rejected|econnreject|passphrase/i,
        'The SRT link was rejected. Check the link, with its passphrase and stream id, with whoever gave it to you.',
    ],
    [
        /connection refused|timed out|etimedout|name or service not known|could not resolve|failed to resolve|getaddrinfo/i,
        'Could not reach the platform. Check the address and stream key you entered, and that the stream is started on the platform.',
    ],
    [
        /input\/output error|broken pipe|connection reset by peer|end of file/i,
        'The platform closed the connection. The stream key is often wrong, expired, or already in use by another stream. Check it on the platform.',
    ],
    [
        /not (?:currently )?supported in container|incompatible with (?:output )?codec|not compatible with flv/i,
        'The platform cannot accept this video format. Tell the streaming team.',
    ],
    [
        /falling behind/i,
        'The stream is reaching the platform slowly, usually because of the network. Tell the streaming team if it keeps happening.',
    ],
];

function getStatusAdvice(status) {
    const message = status.message || '';
    for (const [pattern, advice] of ADVICE_PATTERNS) {
        if (pattern.test(message)) return advice;
    }
    return GENERIC_ADVICE[status.status] || '';
}

// A short sentence for how long a stream has been live, from its start time in ms.
function describeLiveFor(sinceMs, nowMs) {
    if (!sinceMs) return '';
    const ago = formatAgo(nowMs - sinceMs);
    return ago === 'just now' ? '' : `for ${ago.replace(/ ago$/, '')}`;
}

// What to say under a stream's name, or null when nothing can be said. Without a fresh report
// from bunryu nothing is claimed: bunryu only runs during events, so silence is normal.
// `copy` is the technical detail for a Copy button, to paste to the streaming team.
function describeKeyNote(key, report, nowMs = Date.now(), inputName = '') {
    if (!report?.online) return null;
    const input = getInputStatus(key.input, report);
    const inputLabel = inputName ? `“${inputName}”` : 'this input';
    const status = getKeyStatus(key, report);
    if (!status) {
        if (!getKeyMainUrl(key)) return null;
        return {
            state: 'none',
            label: 'Not set up yet',
            text: 'The streaming team has not set up this link yet, or still has the old one.',
            copy: '',
        };
    }

    const label = NOTE_LABELS[status.status] || status.status;
    // The link runs in a pipeline of another name than this stream's input, so it was
    // probably put in the wrong place. Said first: a healthy stream in the wrong place is
    // still wrong.
    const wrongInput = status.inputMismatch
        ? `The streaming team has this link under “${status.pipeline}”, but this destination is for ${inputLabel}. One of them is wrong.`
        : '';
    if (status.status === 'running' || status.status === 'stopped') {
        if (wrongInput)
            return { state: 'warning', label: 'Check input', text: wrongInput, copy: '' };
        return status.status === 'running'
            ? { state: 'running', label, text: describeLiveFor(status.sinceMs, nowMs), copy: '' }
            : { state: 'stopped', label, text: 'Set up, but not sending right now.', copy: '' };
    }

    const side = report.keys[key.id].main === status ? 'main' : 'backup';
    const parts = [];
    if (side === 'backup') parts.push('Backup stream:');
    if (status.stoppedAfterFailures) {
        parts.push(`Gave up after ${status.failures} failed attempts.`);
    }
    if (wrongInput) parts.push(wrongInput);
    // When the input itself is not arriving, the destination is not the problem.
    parts.push(
        input?.status === 'error'
            ? `The input ${inputLabel} is not arriving, so this is probably not a problem with the platform. Tell the streaming team.`
            : getStatusAdvice(status),
    );
    const copy = status.message
        ? [
              `${key.name || 'Destination'} (${side} stream)`,
              [status.pipeline, status.output].filter(Boolean).join(' → '),
              status.message,
          ]
              .filter(Boolean)
              .join(' | ')
        : '';
    return { state: status.status, label, text: parts.join(' ').trim(), copy };
}

const INPUT_LABELS = {
    running: 'Receiving',
    warning: 'Unstable',
    error: 'Not arriving',
    stopped: 'Idle',
};

// What bunryu reports about an input, found by the input's name, or null: nothing is claimed
// without a fresh report, or for an input bunryu has no pipeline of that name for.
function getInputStatus(inputId, report) {
    if (!report?.online) return null;
    return report.inputs?.[inputId] || null;
}

// The words above a list of streams when their input is in trouble, or null.
function describeInputBanner(inputId, name, report) {
    const input = getInputStatus(inputId, report);
    if (!input || (input.status !== 'error' && input.status !== 'warning')) return null;
    const text =
        input.status === 'error'
            ? `Nothing is arriving on input “${name}”. Its destinations cannot be live until the signal is back, so there is no need to contact the platforms. Tell the streaming team.`
            : `The signal on input “${name}” is unstable, so its destinations may stutter. Tell the streaming team if it keeps happening.`;
    return { state: input.status, label: INPUT_LABELS[input.status], text };
}

// The coloured label that starts a card: Live, Unstable, Problem, Not set up yet...
function keyStatusPillHtml(note, isPending = false) {
    if (isPending) return '<span class="status-pill status-none">Saving</span>';
    if (!note) return '';
    return `<span class="status-pill status-${note.state}">${escapeHtml(note.label)}</span>`;
}

// What the status means and what to try, in a sentence under the name.
function keyNoteTextHtml(note) {
    if (!note || (!note.text && !note.copy)) return '';
    const copy = note.copy
        ? `<button type="button" class="btn btn-ghost btn-square btn-xs text-accent shrink-0" title="Copy the error details to send to the streaming team" aria-label="Copy error details" data-action="copy-text" data-copy-value="${escapeHtml(note.copy)}">${iconSvg('copy')}</button>`
        : '';
    return `<p class="dest-card-note"><span class="dest-card-note-text">${escapeHtml(note.text)}</span>${copy}</p>`;
}

const LOCKED_BACKUP_BY_SERVER = {
    fb: 'fb',
};

const HIDDEN_BACKUP_BY_SERVER = {
    ig: true,
    yt: true,
};

const YOUTUBE_BACKUP_SERVER_URL = 'rtmp://b.rtmp.youtube.com/live2?backup=1/';

const KNOWN_RTMP_URL_SERVER_IDS = ['yt', 'fb', 'vc'];

const SERVERS = {
    '': { name: 'None', value: '' },
    rtmp: { name: 'Something else (rtmp://)', value: 'rtmp' },
    srt: { name: 'SRT link', value: 'srt' },
    yt: { name: 'YouTube', value: 'rtmp://a.rtmp.youtube.com/live2/' },
    fb: { name: 'Facebook', value: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
    ig: { name: 'Instagram', value: 'rtmps://edgetee-upload-${s_prp}.xx.fbcdn.net:443/rtmp/' },
    vc: { name: 'VdoCipher', value: 'rtmp://live-ingest-01.vd0.co:1935/livestream/' },
};

// ===== The guided "Add a stream" dialog =====
//
// Everything below is written for someone who has never seen a stream key: each platform gets
// a few plain steps for finding its key, the key box takes a pasted full address and keeps
// only the key, and an error says what to do rather than what failed.

const PLATFORM_GUIDES = {
    yt: {
        stepTitle: 'Get your YouTube stream key',
        title: 'How to find your key on YouTube',
        steps: [
            'Open YouTube Studio and sign in to the channel that will go live.',
            'Click “Create” at the top right, then “Go live”.',
            'Under “Stream settings”, find the “Stream key” and click “Copy”.',
            'Come back here and paste it into the box below.',
        ],
        openUrl: 'https://studio.youtube.com',
        openLabel: 'Open YouTube Studio',
        note: 'You only need the key. The server address is filled in for you, and YouTube’s backup connection is set up automatically.',
        keyLabel: 'YouTube stream key',
        keyHelp: 'It is a few groups of letters and numbers, like abcd-1234-efgh-5678-ijkl.',
        placeholder: 'abcd-1234-efgh-5678-ijkl',
    },
    fb: {
        stepTitle: 'Get your Facebook stream key',
        title: 'How to find your key on Facebook',
        steps: [
            'Open Facebook and go to the Page or profile that will go live.',
            'Choose “Live video”, then “Streaming software”. The Live Producer opens.',
            'Find the “Stream key” and click “Copy”.',
            'Come back here and paste it into the box below.',
        ],
        openUrl: 'https://www.facebook.com/live/producer',
        openLabel: 'Open Facebook Live',
        note: 'Facebook keys can stop working after a while, or after one use. If the stream will not start, get a fresh key and update it here.',
        keyLabel: 'Facebook stream key',
        keyHelp:
            'It starts with “FB-” followed by numbers and letters, like FB-1234567890-0-AbCdEfGh.',
        placeholder: 'FB-1234567890-0-AbCdEfGh',
    },
    ig: {
        stepTitle: 'Get your Instagram stream key',
        title: 'How to find your key on Instagram',
        steps: [
            'On a computer, open Instagram and start a live video (Create, then Live).',
            'Give the live a title, choose who can watch, and continue.',
            'Copy the “Stream key”.',
            'Come back here and paste the whole key into the box below.',
        ],
        openUrl: 'https://www.instagram.com/',
        openLabel: 'Open Instagram',
        note: 'Paste the whole key, including everything after “?s_prp=”. Instagram keys often work for one live only, so you may need a new one each time.',
        keyLabel: 'Instagram stream key',
        keyHelp: 'It is a long code that contains “?s_prp=”. Paste all of it.',
        placeholder: 'Paste the whole key, including ?s_prp=…',
    },
    vc: {
        stepTitle: 'Get your VdoCipher stream key',
        title: 'How to find your key on VdoCipher',
        steps: [
            'Sign in to your VdoCipher dashboard.',
            'Open your live stream, or create a new one.',
            'Copy its “Stream key”.',
            'Come back here and paste it into the box below.',
        ],
        openUrl: 'https://dashboard.vdocipher.com',
        openLabel: 'Open VdoCipher',
        note: 'You only need the key. The server address is filled in for you.',
        keyLabel: 'VdoCipher stream key',
        keyHelp: 'Paste the key exactly as VdoCipher shows it.',
        placeholder: 'Paste your stream key here',
    },
    rtmp: {
        stepTitle: 'Enter your stream details',
        title: 'What to ask your streaming provider for',
        steps: [
            'A server address. It starts with rtmp:// or rtmps://.',
            'A stream key. This is the secret code for your stream.',
            'Type or paste each one below. If you only have one long address, paste it into the stream key box and we will split it for you.',
        ],
        note: 'Not sure what to enter? Ask the person who set up the streaming service.',
        keyLabel: 'Stream key',
        keyHelp: 'The secret code from your provider.',
        placeholder: 'Paste your stream key here',
    },
    srt: {
        stepTitle: 'Enter your SRT details',
        title: 'What to ask your streaming provider for',
        steps: [
            'The server address and the port number of the SRT link.',
            'Whether you connect to them (Caller) or they connect to you (Listener).',
            'A password and a stream ID, only if they gave you these.',
        ],
        note: 'SRT is mostly used by technical teams. If you are not sure, ask the person who set up the stream.',
        keyLabel: 'Stream key',
        keyHelp: '',
        placeholder: '',
    },
};

// Shown above the backup section so nobody fills in what the platform does not need. Where
// the form hides the backup box (YouTube, Instagram) the note is all there is; for Facebook
// it explains the box that is left.
const BACKUP_NOTES = {
    yt: 'YouTube’s backup uses the same stream key as your main stream. Only the server address is different, and we add it for you. Nothing to fill in here.',
    fb: 'Facebook’s backup uses the same server address as your main stream, but a different stream key. Paste the backup key from Facebook below.',
    ig: 'Instagram has no backup stream. Leave this empty: there is nothing to fill in.',
};

// What the Name box is filled with when someone picks a platform and has typed nothing yet.
const SUGGESTED_NAMES = { yt: 'YouTube', fb: 'Facebook', ig: 'Instagram', vc: 'VdoCipher' };

let suggestedStreamName = '';
let keyGuideExpanded = true;

// Takes a pasted stream key and makes it what the form stores. People often copy the whole
// address (rtmp://a.rtmp.youtube.com/live2/abcd-1234) instead of the key: when we recognise
// the platform we keep just the key and say so. For "something else" we split the address
// from the key at the last "/".
function cleanStreamKeyInput(server, raw) {
    const value = String(raw ?? '').trim();
    const result = { server, key: value, serverUrl: '', notice: '' };
    if (!/^rtmps?:\/\//.test(value)) return result;

    const youtubeBackup = value.startsWith(YOUTUBE_BACKUP_SERVER_URL)
        ? { server: 'yt', streamKey: value.slice(YOUTUBE_BACKUP_SERVER_URL.length) }
        : null;
    const instagram = /^rtmps:\/\/edgetee-upload-[^./]+\.xx\.fbcdn\.net:443\/rtmp\//.exec(value);
    const known =
        detectKnownRtmpServerUrl(value) ||
        youtubeBackup ||
        (instagram ? { server: 'ig', streamKey: value.slice(instagram[0].length) } : null);

    if (known?.streamKey) {
        return {
            ...result,
            server: known.server,
            key: known.streamKey,
            notice: `That was a full ${SERVERS[known.server].name} address. We kept just the stream key.`,
        };
    }
    if (server === 'rtmp') {
        const parts = splitRtmpUrl(value);
        if (parts.serverUrl && parts.streamKey) {
            return {
                ...result,
                key: parts.streamKey,
                serverUrl: parts.serverUrl,
                notice: 'We split the full address into the server address and the stream key.',
            };
        }
    }
    return result;
}

// What is wrong with a stream key, in words anyone can act on; '' when it looks fine.
function getStreamKeyProblem(server, key) {
    const value = String(key ?? '');
    const platform = SERVERS[server]?.name || 'your provider';
    if (!value) {
        return server === 'rtmp'
            ? 'Paste the stream key your provider gave you.'
            : `Paste your ${platform} stream key. It is the secret code from ${platform}.`;
    }
    if (/\s/.test(value)) return 'A stream key has no spaces. Please copy it again.';
    if (/^(rtmps?|srt):\/\//.test(value)) {
        return 'That looks like a full address. Paste only the stream key, the part after the last “/”.';
    }
    if (server === 'ig' && !/[?&]s_prp=[^&]+/.test(value)) {
        return 'An Instagram key contains “?s_prp=”. Please copy the whole key.';
    }
    return '';
}

function renderKeyGuide(server) {
    const guide = PLATFORM_GUIDES[server];
    const box = document.querySelector('#key-guide');
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

    document.querySelector('#key-step-key-title').textContent = guide.stepTitle;
    document.querySelector('#stream-key-legend').textContent = guide.keyLabel;
    document.querySelector('#stream-key-help').textContent = guide.keyHelp;
    document.querySelector('#stream-key-input').placeholder = guide.placeholder;
}

// Shows which platform tile is chosen, and the step that asks for its key.
function syncPlatformPicker(server) {
    document.querySelectorAll('#platform-picker .platform-tile').forEach((tile) => {
        const active = tile.dataset.server === server;
        tile.classList.toggle('platform-tile-active', active);
        tile.setAttribute('aria-checked', String(active));
    });
    document.querySelector('#key-step-key').classList.toggle('hidden', !server);
    renderKeyGuide(server);
}

function suggestStreamName(server) {
    if (document.querySelector('#key-id-input').value) return;
    const nameInput = document.querySelector('#key-name-input');
    if (nameInput.value.trim() !== '' && nameInput.value !== suggestedStreamName) return;
    suggestedStreamName = SUGGESTED_NAMES[server] || '';
    nameInput.value = suggestedStreamName;
}

function pickPlatform(server) {
    if (!Object.prototype.hasOwnProperty.call(SERVERS, server) || !server) return;
    const select = document.querySelector('#key-server-input');
    const previous = select.value;
    if (previous === server) return;

    // A key from another platform is of no use here, and would only confuse.
    if (previous) {
        document.querySelector('#stream-key-input').value = '';
        document.querySelector('#key-custom-server-input').value = '';
    }
    keyGuideExpanded = true;
    clearKeyErrors();
    renderServerInput(server);
    applyBackupServerLock();
    suggestStreamName(server);

    const next = document.querySelector(
        server === 'srt'
            ? '#key-srt-host-input'
            : server === 'rtmp'
              ? '#key-custom-server-input'
              : '#stream-key-input',
    );
    next?.focus({ preventScroll: true });
}

function showKeyNotice(suffix, text) {
    const notice = document.querySelector('#stream-key' + suffix + '-notice');
    if (!notice) return;
    notice.textContent = text;
    notice.classList.toggle('hidden', !text);
}

// Runs whenever the key box changes: a pasted full address is turned into just the key.
function handleStreamKeyInput(suffix = '') {
    const input = document.querySelector('#stream-key' + suffix + '-input');
    const select = document.querySelector('#key-server' + suffix + '-input');
    if (!select.value || !/^\s*rtmps?:\/\//.test(input.value)) return;

    const cleaned = cleanStreamKeyInput(select.value, input.value);
    if (!cleaned.notice) return;

    // A main key that belongs to another known platform moves the choice there; a backup
    // is only cleaned, because its platform is fixed by the main one.
    if (!suffix && cleaned.server !== select.value) {
        renderServerInput(cleaned.server);
        applyBackupServerLock();
        suggestStreamName(cleaned.server);
    }
    input.value = cleaned.key;
    if (cleaned.serverUrl) {
        const custom = document.querySelector('#key-custom-server' + suffix + '-input');
        if (!custom.value.trim()) custom.value = cleaned.serverUrl;
    }
    showKeyNotice(suffix, cleaned.notice);
}

async function pasteStreamKey(suffix = '') {
    const input = document.querySelector('#stream-key' + suffix + '-input');
    let text = '';
    try {
        text = (await navigator.clipboard.readText()).trim();
    } catch (_) {
        // The browser may refuse to share the clipboard.
    }
    input.focus();
    if (!text) {
        showErrorAlert(
            'We could not read what you copied. Click in the box and press Ctrl+V (or long-press and choose Paste).',
            false,
        );
        return;
    }
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
}
