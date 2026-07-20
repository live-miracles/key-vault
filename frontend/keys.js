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
    const keys = config.keys
        .filter((k) => k.event === eventId)
        .sort((a, b) => {
            const orderDiff = getLanguageOrder(a.language) - getLanguageOrder(b.language);
            if (orderDiff !== 0) return orderDiff;
            return getLanguageName(a.language).localeCompare(getLanguageName(b.language));
        });

    document.querySelector('#key-rows').innerHTML = keys
        .map((k, i) => {
            const idIssue = getIdIssue(config.keys, k);
            const color = COLORS[k.color] || COLORS[''];
            const link = safeUrl(k.link);
            const canManageKey = hasKeyAccess(eventRoles, ACTIONS.UPDATE, k.event, k.language);
            const isPending = Boolean(k.pending);
            const actions = isPending
                ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
                : canManageKey
                  ? `
                    <div class="flex justify-center gap-1">
                        <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Edit" aria-label="Edit key" onclick="editKeyById(this.closest('tr').dataset.keyId)">
                            ${iconSvg('pen')}
                        </button>
                        <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="Delete" aria-label="Delete key" onclick="deleteKeyById(this.closest('tr').dataset.keyId)">
                            ${iconSvg('trash')}
                        </button>
                    </div>
                `
                  : '';
            const mainUrl = getKeyMainUrl(k);
            const backupEndpoint = getKeyBackupEndpoint(k);
            const backupUrl = getKeyBackupUrl(k);
            const allUrls = config.keys.flatMap((key) =>
                [getKeyMainUrl(key), getKeyBackupUrl(key)].filter(Boolean),
            );
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

            const languageIndex = keys.filter(
                (key, index) => index <= i && key.language === k.language,
            ).length;
            const platformNameCopyButton = isPending
                ? ''
                : `
                    <button type="button" class="btn btn-ghost btn-square btn-xs text-accent shrink-0" title="Copy platform name" aria-label="Copy platform name" onclick="copyTextValue(this.dataset.copyValue)" data-copy-value="${escapeHtml(k.name)}">
                        ${iconSvg('copy')}
                    </button>
                `;
            return `
                <tr class="hover:bg-base-300 ${color.bgCss} ${idIssueClass(idIssue)} text-center" data-key-id="${escapeHtml(k.id)}" title="${escapeHtml(idIssue)}">
                    <td style="padding: 2px">${i + 1} (${languageIndex})</td>
                    <td style="padding: 2px">${languageLabelHtml(k.language)}</td>
                    <td style="padding: 2px" title="${escapeHtml(k.name)}">
                        <div class="flex items-center justify-center gap-2">
                            <span>${escapeHtml(getPlatformNamePreview(k.name))}</span>
                            ${platformNameCopyButton}
                            ${idIssueBadgeHtml(idIssue)}
                        </div>
                    </td>
                    <td style="padding: 2px">${mainUrlCell}</td>
                    <td style="padding: 2px">${backupUrlCell}</td>
                    <td style="padding: 2px">${webLinkCell}</td>
                    <td style="padding: 2px" title="${escapeHtml(k.remarks)}">${escapeHtml(getMiddleEllipsisText(k.remarks, 40, 30, 5))}</td>
                    <td style="padding: 2px">${actions}</td>
                </tr>`;
        })
        .join('');

    document.querySelectorAll('#key-rows tr[data-key-id]').forEach((row) => {
        row.addEventListener('dblclick', (event) => {
            if (event.target.closest('button, a, input, select, textarea')) return;
            showKeyColorMenu(event, row.dataset.keyId);
        });
    });
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
            <button type="button" class="btn btn-ghost btn-square btn-xs text-accent shrink-0" title="Copy" aria-label="Copy" onclick="copyTextValue(this.dataset.copyValue)" data-copy-value="${escapeHtml(value)}">
                ${iconSvg('copy')}
            </button>
        `;

    return `<div class="flex items-center justify-center gap-1">${content}${copyButton}</div>`;
}

let selectedKeyId = null;

function canEditKeyColor(eventId) {
    return hasKeyColorAccess(eventRoles, eventId);
}

function setKeyColorInput(value, eventId) {
    const input = document.querySelector('#key-color-input');
    input.value = value;
    input.disabled = !canEditKeyColor(eventId);
}

function hideKeyColorMenu() {
    document.getElementById('key-color-menu')?.classList.add('hidden');
}

function showKeyColorMenu(event, keyId) {
    event.preventDefault();

    const key = config.keys.find((k) => k.id === keyId);
    if (!key || key.pending || !hasKeyColorAccess(eventRoles, key.event)) {
        hideKeyColorMenu();
        return;
    }

    selectedKeyId = keyId;
    document.getElementById('role-context-menu').classList.add('hidden');

    const menu = document.getElementById('key-color-menu');
    const options = document.getElementById('key-color-menu-options');
    const currentColor = key.color || KEY_COLORS.NONE;
    options.innerHTML = Object.keys(COLORS)
        .filter((colorId) => colorId !== currentColor)
        .map(
            (colorId) => `
                <li>
                    <button type="button" class="${COLORS[colorId].css}" onclick="changeSelectedKeyColor('${escapeHtml(colorId)}')">
                        ${escapeHtml(COLORS[colorId].name)}
                    </button>
                </li>
            `,
        )
        .join('');

    menu.classList.remove('hidden');

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    let x = event.clientX;
    let y = event.clientY;

    if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - margin;
    }
    if (y + rect.height > window.innerHeight) {
        y = y - rect.height - margin;
    }

    menu.style.left = `${Math.max(margin, x)}px`;
    menu.style.top = `${Math.max(margin, y)}px`;
}

function editKeyById(keyId) {
    selectedKeyId = keyId;
    editKeyRow();
}

function deleteKeyById(keyId) {
    selectedKeyId = keyId;
    deleteKeyRow();
}

async function addKeyBtn() {
    const eventId = getUrlParam('event');
    const event = config.events.find((e) => e.id === eventId);
    if (!event) {
        console.error('Event not found:', eventId);
        return;
    }

    document.querySelector('#key-id-input').value = '';
    document.querySelector('#key-event-input').value = eventId;
    setKeyColorInput('', eventId);
    document.querySelector('#key-name-input').value = '';
    renderKeyLanguages(eventId, ACTIONS.CREATE);
    document.querySelector('#key-language-input').value = '';
    renderServerInput('yt');
    document.querySelector('#stream-key-input').value = '';
    document.querySelector('#stream-key2-input').value = '';
    renderServerInput('', '2');
    applyBackupServerLock();
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
    setKeyColorInput(key.color, key.event);
    renderKeyLanguages(key.event, ACTIONS.UPDATE);
    document.querySelector('#key-language-input').value = key.language;
    document.querySelector('#key-link-input').value = key.link;
    document.querySelector('#key-remarks-input').value = key.remarks;

    document.querySelector('#stream-key-input').value = key.key;
    document.querySelector('#stream-key2-input').value = key.key2;
    renderServerInput(key.server);
    renderServerInput(key.server2, '2');
    applyBackupServerLock();

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
    const errorElem = document.querySelector('#key-form-error');
    errorElem.innerText = '';
    errorElem.classList.add('hidden');
}

function markKeyFieldError(selector) {
    const elem = document.querySelector(selector);
    if (!elem) return;
    elem.classList.add(elem.tagName === 'SELECT' ? 'select-error' : 'input-error');
}

function setKeyFormError(message, selectors = []) {
    const errorElem = document.querySelector('#key-form-error');
    errorElem.innerText = message;
    errorElem.classList.remove('hidden');
    selectors.filter(Boolean).forEach(markKeyFieldError);
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
            ? '#key-server' + suffix + '-input'
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
        setSrtError(suffix, 'host', 'Hostname is required');
        return false;
    }
    if (!portValid) {
        setSrtError(suffix, 'port', 'Port must be between 1 and 65535');
        return false;
    }
    if (!latencyValid) {
        setSrtError(suffix, 'latency', 'Latency must be greater than 0');
        return false;
    }
    if (!passphraseValid) {
        setSrtError(suffix, 'passphrase', 'Passphrase must be 10-79 characters');
        return false;
    }
    if (!keyLenValid) {
        setSrtError(suffix, 'keyLen', 'Key length is required when passphrase is set');
        return false;
    }
    return true;
}

function validateEndpoint(endpoint, suffix = '', required = false) {
    if (!endpoint.server && !endpoint.key && !required) return true;
    if (!endpoint.server) {
        setEndpointError(suffix, 'select', 'Server is required');
        return false;
    }

    if (endpoint.server === 'srt') {
        return validateSrtEndpoint(endpoint, suffix);
    }

    if (endpoint.server === 'rtmp') {
        const selectors = [];
        if (
            !endpoint.serverUrl ||
            (!endpoint.serverUrl.startsWith('rtmp://') &&
                !endpoint.serverUrl.startsWith('rtmps://')) ||
            endpoint.serverUrl.includes(' ')
        ) {
            selectors.push('#key-custom-server' + suffix + '-input');
        }
        if (
            !endpoint.streamKey ||
            endpoint.streamKey.startsWith('rtmp://') ||
            endpoint.streamKey.startsWith('rtmps://') ||
            endpoint.streamKey.startsWith('srt://') ||
            endpoint.streamKey.includes(' ')
        ) {
            selectors.push('#stream-key' + suffix + '-input');
        }
        if (
            !endpoint.key ||
            (!endpoint.key.startsWith('rtmp://') && !endpoint.key.startsWith('rtmps://')) ||
            endpoint.key.includes(' ')
        ) {
            setKeyFormError('Invalid RTMP URL', selectors);
            return false;
        }
        return true;
    }

    if (
        endpoint.key === '' ||
        endpoint.key.startsWith('rtmp://') ||
        endpoint.key.startsWith('rtmps://') ||
        endpoint.key.startsWith('srt://') ||
        endpoint.key.includes(' ')
    ) {
        setEndpointError(suffix, 'key', 'Invalid RTMP Key');
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
        color: document.getElementById('key-color-input').value.trim(),
        name: document.getElementById('key-name-input').value.trim(),
        language: document.getElementById('key-language-input').value.trim(),
        server: mainEndpoint.server,
        key: mainEndpoint.key,
        server2: backupEndpoint.server,
        key2: backupEndpoint.key,
        link: document.getElementById('key-link-input').value.trim(),
        remarks: document.getElementById('key-remarks-input').value.trim(),
    };
    enforceLockedBackup(key);

    const oldKey = key.id ? config.keys.find((k) => k.id === key.id) : null;
    if (oldKey && hasStreamingConfigChanged(oldKey, key)) {
        key.color = KEY_COLORS.NONE;
    } else if (!hasKeyColorAccess(eventRoles, key.event)) {
        key.color = oldKey ? oldKey.color : KEY_COLORS.NONE;
    }

    // Validation
    clearKeyErrors();
    if (key.name === '') {
        setKeyFormError("Name can't be empty", ['#key-name-input']);
        event.preventDefault();
        return;
    } else if (!/^[a-zA-Z0-9_\- ]*$/.test(key.name)) {
        setKeyFormError('Only letters, numbers, spaces, -, _', ['#key-name-input']);
        event.preventDefault();
        return;
    }
    if (key.language === '') {
        setKeyFormError('Language is required', ['#key-language-input']);
        event.preventDefault();
        return;
    }

    if (!validateEndpoint(mainEndpoint, '', true)) {
        event.preventDefault();
        return;
    }

    if (
        config.keys
            .filter((k) => k.id !== key.id)
            .some(
                (k) =>
                    getKeyMainUrl(k) === getKeyMainUrl(key) ||
                    getKeyBackupUrl(k) === getKeyMainUrl(key),
            )
    ) {
        setKeyFormError('This URL has already been added', getEndpointErrorSelectors(mainEndpoint));
        event.preventDefault();
        return;
    }

    if (!validateEndpoint(backupEndpoint, '2')) {
        event.preventDefault();
        return;
    }

    if (
        getKeyBackupUrl(key) &&
        !isLockedBackupServer(key.server) &&
        getKeyMainUrl(key) === getKeyBackupUrl(key)
    ) {
        setKeyFormError(
            "Backup URL can't be the same as the Main",
            getEndpointErrorSelectors(backupEndpoint, '2'),
        );
        event.preventDefault();
        return;
    } else if (
        getKeyBackupUrl(key) &&
        config.keys
            .filter((k) => k.id !== key.id)
            .some(
                (k) =>
                    getKeyMainUrl(k) === getKeyBackupUrl(key) ||
                    getKeyBackupUrl(k) === getKeyBackupUrl(key),
            )
    ) {
        setKeyFormError(
            'This URL has already been added',
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
        id: isAdd ? getNextSequentialId(config.keys, 'K') : key.id,
        pending: isAdd,
    };
    replaceConfigItem('keys', optimisticKey, key.id || optimisticKey.id);
    renderKeyTable(key.event);

    showLoading();
    if (key.id === '') {
        // Adding new row
        document.querySelector('#add-key-btn').disabled = true;
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
            document.querySelector('#add-key-btn').disabled = false;
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

async function changeSelectedKeyColor(color) {
    if (!selectedKeyId) return;
    hideKeyColorMenu();

    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
        return;
    }

    if (!hasKeyColorAccess(eventRoles, key.event)) {
        showErrorAlert('Only owners or admins can edit key colors.');
        return;
    }
    const currentColor = key.color || KEY_COLORS.NONE;
    if (!Object.prototype.hasOwnProperty.call(COLORS, color) || color === currentColor) return;

    const snapshot = cloneConfig();
    replaceConfigItem('keys', { ...key, color });
    renderKeyTable(key.event);

    showLoading();
    try {
        const newKey = processResponse(await api('editKey', { ...key, color }));
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

function renderKeyLanguages(eventId, action = ACTIONS.CREATE) {
    renderLanguageSelect('#key-language-input', { eventId, action, placeholder: 'Language' });
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
    const shouldHideStreamKey = isCustomSrt || (suffix === '2' && !server);

    select.value = isKnownServer ? server : '';
    customServer.classList.toggle('hidden', !isCustomRtmp);
    customServer.classList.toggle('inline-block', isCustomRtmp);
    streamKeyField.classList.toggle('hidden', shouldHideStreamKey);
    streamKeyField.classList.toggle('inline-block', !shouldHideStreamKey);
    srtServer.classList.toggle('hidden', !isCustomSrt);
    srtServer.classList.toggle('contents', isCustomSrt);

    if (suffix === '2' && !server) {
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
    const backupServerRow = document.querySelector('#backup-server-row');
    const backupServerInput = document.querySelector('#key-server2-input');
    const backupCustomServerInput = document.querySelector('#key-custom-server2-input');
    const backupKeyInput = document.querySelector('#stream-key2-input');
    const backupServer = LOCKED_BACKUP_BY_SERVER[primaryServer];
    const isLocked = Boolean(backupServer);
    const isHidden = Boolean(HIDDEN_BACKUP_BY_SERVER[primaryServer]);

    backupServerRow.classList.toggle('hidden', isHidden);
    backupServerRow.classList.toggle('flex', !isHidden);

    if (isHidden) {
        renderServerInput('', '2');
        backupKeyInput.value = '';
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
    [KEY_COLORS.ERROR]: { name: '🔴 Error', css: 'text-error', bgCss: 'bg-red-500/30' },
    [KEY_COLORS.WARNING]: { name: '🟡 Warning', css: 'text-warning', bgCss: 'bg-warning/10' },
    [KEY_COLORS.CONFIGURED]: { name: '🟣 Configured', css: 'text-accent', bgCss: 'bg-accent/10' },
};

const LOCKED_BACKUP_BY_SERVER = {
    fb: 'fb',
};

const HIDDEN_BACKUP_BY_SERVER = {
    ig: true,
    yt: true,
};

const YOUTUBE_BACKUP_SERVER_URL = 'rtmp://b.rtmp.youtube.com/live2?backup=1/';

const SERVERS = {
    '': { name: 'None', value: '' },
    rtmp: { name: 'Custom RTMP', value: 'rtmp' },
    srt: { name: 'Custom SRT', value: 'srt' },
    yt: { name: 'YouTube', value: 'rtmp://a.rtmp.youtube.com/live2/' },
    fb: { name: 'Facebook', value: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
    ig: { name: 'Instagram', value: 'rtmps://edgetee-upload-${s_prp}.xx.fbcdn.net:443/rtmp/' },
    vc: { name: 'VDO Cipher', value: 'rtmp://live-ingest-01.vd0.co:1935/livestream/' },
};
