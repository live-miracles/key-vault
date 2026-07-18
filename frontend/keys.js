function getRtmpValue(server, key) {
    if (!server || !key) {
        return '';
    }

    return (SERVERS[server]?.value || server) + key;
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

function renderKeyTable(eventId = null) {
    const keys = config.keys
        .filter((k) => k.event === eventId)
        .sort((a, b) =>
            (LANGUAGE_MAP[a.language] || a.language).localeCompare(
                LANGUAGE_MAP[b.language] || b.language,
            ),
        );

    document.querySelector('#key-rows').innerHTML = keys
        .map((k, i) => {
            const color = COLORS[k.color] || COLORS[''];
            const link = safeUrl(k.link);
            const event = config.events.find((e) => e.id === k.event);
            const isLocked = event?.status === EVENT_STATUS.LOCKED;
            const canManageKey =
                hasKeyAccess(eventRoles, ACTIONS.UPDATE, k.event, k.language) && !isLocked;
            const actions = canManageKey
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
            const cnt =
                config.keys.filter((key) => k.server + k.key === key.server + key.key).length +
                config.keys.filter((key) => k.server + k.key === key.server2 + key.key2).length;
            const cnt2 =
                config.keys.filter((key) => k.server2 + k.key2 === key.server + key.key).length +
                config.keys.filter((key) => k.server2 + k.key2 === key.server2 + key.key2).length;

            const languageIndex = keys.filter(
                (key, index) => index <= i && key.language === k.language,
            ).length;
            return `
                <tr class="hover:bg-base-300 ${color.bgCss} text-center" data-key-id="${escapeHtml(k.id)}">
                    <td style="padding: 2px">${i + 1} (${languageIndex})</td>
                    <td style="padding: 2px">${escapeHtml(LANGUAGE_MAP[k.language] || k.language)}</td>
                    <td style="padding: 2px">${escapeHtml(k.name)}</td>
                    <td style="padding: 2px" class="${cnt > 1 ? 'text-error' : ''}" title="${escapeHtml(getRtmpValue(k.server, k.key))}">${escapeHtml(getRtmpPreview(k.server, k.key))}</td>
                    <td style="padding: 2px" class="${cnt2 > 1 ? 'text-error' : ''}" title="${escapeHtml(getRtmpValue(k.server2, k.key2))}">${escapeHtml(getRtmpPreview(k.server2, k.key2))}</td>
                    <td style="padding: 2px">${
                        link
                            ? `<a href="${escapeHtml(link)}" class="link" target="_blank" rel="noopener noreferrer" title="${escapeHtml(k.link)}">${escapeHtml(getShortText(k.link, 25))}</a>`
                            : ''
                    }</td>
                    <td style="padding: 2px">${escapeHtml(k.remarks)}</td>
                    <td style="padding: 2px">${actions}</td>
                </tr>`;
        })
        .join('');

    // Add right-click event listeners to rows
    document.querySelectorAll('#key-rows tr').forEach((row) => {
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const keyId = row.dataset.keyId;
            const key = config.keys.find((k) => k.id === keyId);
            if (!key) {
                console.error('Key not found');
                return;
            }
            if (key.link) {
                document.querySelector('#copy-link-btn').classList.remove('hidden');
            } else {
                document.querySelector('#copy-link-btn').classList.add('hidden');
            }
            showKeyContextMenu(e, keyId);
        });
    });
}

let selectedKeyId = null;

function editKeyById(keyId) {
    selectedKeyId = keyId;
    editKeyRow();
}

function deleteKeyById(keyId) {
    selectedKeyId = keyId;
    deleteKeyRow();
}

function showKeyContextMenu(event, keyId) {
    event.preventDefault();

    selectedKeyId = keyId;
    const menu = document.getElementById('key-context-menu');

    // Make visible so we can measure it
    menu.classList.remove('hidden');

    const rect = menu.getBoundingClientRect();
    const margin = 8;

    let x = event.clientX;
    let y = event.clientY;

    // Horizontal clamp
    if (x + rect.width > window.innerWidth) {
        x = window.innerWidth - rect.width - margin;
    }

    // Vertical: flip above cursor if needed
    if (y + rect.height > window.innerHeight) {
        y = y - rect.height - margin;
    }

    // Final safety clamp
    x = Math.max(margin, x);
    y = Math.max(margin, y);

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
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
    document.querySelector('#key-color-input').value = '';
    document.querySelector('#key-name-input').value = '';
    document.querySelector('#key-language-input').value = 'en';
    renderServerInput('yt');
    renderServerInput('', '2');
    document.querySelector('#stream-key-input').value = '';
    document.querySelector('#stream-key2-input').value = '';
    document.querySelector('#key-link-input').value = '';
    document.querySelector('#key-remarks-input').value = '';

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
    document.querySelector('#key-color-input').value = key.color;
    document.querySelector('#key-language-input').value = key.language;
    document.querySelector('#key-link-input').value = key.link;
    document.querySelector('#key-remarks-input').value = key.remarks;

    renderServerInput(key.server);
    renderServerInput(key.server2, '2');

    document.querySelector('#stream-key-input').value = key.key;
    document.querySelector('#stream-key2-input').value = key.key2;

    document.querySelector('#key-name-input').nextElementSibling.innerText = '';
    document.querySelector('#key-custom-server-input').nextElementSibling.innerText = '';
    document.querySelector('#stream-key-input').nextElementSibling.innerText = '';
    document.querySelector('#key-custom-server2-input').nextElementSibling.innerText = '';
    document.querySelector('#stream-key2-input').nextElementSibling.innerText = '';

    document.getElementById('key-modal').showModal();
}

async function saveKeyFormBtn(event) {
    const server = document.getElementById('key-server-input').value;
    const server2 = document.getElementById('key-server2-input').value;
    const key = {
        id: document.getElementById('key-id-input').value.trim(),
        event: document.getElementById('key-event-input').value.trim(),
        color: document.getElementById('key-color-input').value.trim(),
        name: document.getElementById('key-name-input').value.trim(),
        language: document.getElementById('key-language-input').value.trim(),
        server: server || document.getElementById('key-custom-server-input').value.trim(),
        key: document.getElementById('stream-key-input').value.trim(),
        server2: server2 || document.getElementById('key-custom-server2-input').value.trim(),
        key2: document.getElementById('stream-key2-input').value.trim(),
        link: document.getElementById('key-link-input').value.trim(),
        remarks: document.getElementById('key-remarks-input').value.trim(),
    };

    const keyServer = SERVERS[key.server]?.value || key.server;
    const keyServer2 = SERVERS[key.server2]?.value || key.server2;

    // Validation
    let errorElem = document.querySelector('#key-name-input').nextElementSibling;
    if (key.name === '') {
        errorElem.innerText = "Name can't be empty";
        event.preventDefault();
        return;
    } else if (!/^[a-zA-Z0-9_\- ]*$/.test(key.name)) {
        errorElem.innerText = 'Only letters, numbers, spaces, -, _';
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    errorElem = document.querySelector('#key-custom-server-input').nextElementSibling;
    if (
        (!keyServer.startsWith('rtmp://') && !keyServer.startsWith('rtmps://')) ||
        keyServer.includes(' ')
    ) {
        errorElem.innerText = 'Invalid RTMP Server';
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    if (!keyServer.endsWith('/')) {
        key.server += '/';
    }

    for (const shortName of Object.keys(SERVERS)) {
        if (SERVERS[shortName].value === key.server) key.server = shortName;
    }

    errorElem = document.querySelector('#stream-key-input').nextElementSibling;
    if (
        key.key === '' ||
        key.key.startsWith('rtmp://') ||
        key.key.startsWith('rtmps://') ||
        key.key.includes(' ')
    ) {
        errorElem.innerText = 'Invalid RTMP Key';
        event.preventDefault();
        return;
    } else if (
        config.keys
            .filter((k) => k.id !== key.id)
            .some(
                (k) =>
                    k.server + k.key === key.server + key.key ||
                    k.server2 + k.key2 === key.server + key.key,
            )
    ) {
        errorElem.innerText = 'This RTMP has already been added';
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    errorElem = document.querySelector('#key-custom-server2-input').nextElementSibling;
    if (
        (key.key2 && keyServer2 === '') ||
        (keyServer2 && !keyServer2.startsWith('rtmp://') && !keyServer2.startsWith('rtmps://')) ||
        keyServer2.includes(' ')
    ) {
        errorElem.innerText = 'Invalid RTMP Server';
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    if (key.server2 && !keyServer2.endsWith('/')) {
        key.server2 += '/';
    }

    for (const shortName of Object.keys(SERVERS)) {
        if (SERVERS[shortName].value === key.server2) key.server2 = shortName;
    }

    errorElem = document.querySelector('#stream-key2-input').nextElementSibling;
    if (key.server + key.key === key.server2 + key.key2) {
        errorElem.innerText = "Backup RTMP can\'t be the same as the Main";
        event.preventDefault();
        return;
    } else if (
        (key.server2 && key.key2 === '') ||
        key.key2.startsWith('rtmp://') ||
        key.key2.startsWith('rtmps://') ||
        key.key2.includes(' ')
    ) {
        errorElem.innerText = 'Invalid RTMP Key';
        event.preventDefault();
        return;
    } else if (
        key.server2 &&
        config.keys
            .filter((k) => k.id !== key.id)
            .some(
                (k) =>
                    k.server + k.key === key.server2 + key.key2 ||
                    k.server2 + k.key2 === key.server2 + key.key2,
            )
    ) {
        errorElem.innerText = 'This RTMP has already been added';
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    // Sending request
    showLoading();
    if (key.id === '') {
        // Adding new row
        document.querySelector('#add-key-btn').disabled = true;
        console.assert(key.event);

        const newKey = processResponse(await api('addKey', key));
        if (newKey !== null) {
            config.keys.push(newKey);
        }
        document.querySelector('#add-key-btn').disabled = false;
    } else {
        // Updating existing row
        const newKey = processResponse(await api('editKey', key));
        if (newKey !== null) {
            const oldKey = config.keys.find((k) => k.id === newKey.id);
            console.assert(oldKey);
            config.keys.splice(config.keys.indexOf(oldKey), 1, newKey);
        }
    }
    renderKeyTable(key.event);
    hideLoading();
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

    showLoading();
    const res = processResponse(await api('deleteKey', key.id));
    if (res !== null) {
        config.keys = config.keys.filter((k) => k.id !== key.id);
    }
    renderKeyTable(key.event);
    hideLoading();
}

function showCopiedNotification() {
    const notification = document.getElementById('copied-notification');
    if (!notification) return;

    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 2000);
}

async function copyLinkBtn() {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
        return;
    }

    if (await copyText(key.link)) {
        showCopiedNotification();
    }
}

async function copyKeyBtn() {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
        return;
    }

    if (await copyText(key.key)) {
        showCopiedNotification();
    }
}

async function copyRtmpBtn(suffix = '') {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
        return;
    }

    let serverUrl = SERVERS[key['server' + suffix]]?.value || key['server' + suffix];
    if (serverUrl.includes('${s_prp}')) {
        // Instagram
        const params = new URLSearchParams(key.key.split('?')[1]);
        serverUrl = serverUrl.replaceAll('${s_prp}', params.get('s_prp'));
    }

    if (await copyText(serverUrl + key['key' + suffix])) {
        showCopiedNotification();
    }
}

function renderKeyLanguages(eventId) {
    document.querySelector('#key-language-input').innerHTML = LANGUAGES.filter((lang) =>
        hasKeyAccess(eventRoles, ACTIONS.CREATE, eventId, lang),
    )
        .map((lang) => `<option value="${lang}">${LANGUAGE_MAP[lang]}</option>`)
        .join('');
}

function renderServerInput(server, suffix = '') {
    if (server && Object.keys(SERVERS).includes(server)) {
        document.querySelector('#key-server' + suffix + '-input').value = server;
        document.querySelector('#key-custom-server' + suffix + '-input').value = '';
        document.querySelector('#custom-server' + suffix).classList.remove('inline-block');
        document.querySelector('#custom-server' + suffix).classList.add('hidden');
    } else {
        document.querySelector('#key-server' + suffix + '-input').value = '';
        document.querySelector('#key-custom-server' + suffix + '-input').value = server;
        document.querySelector('#custom-server' + suffix).classList.add('inline-block');
        document.querySelector('#custom-server' + suffix).classList.remove('hidden');
    }
}

const COLORS = {
    '': { name: 'None', css: '', bgCss: '' },
    1: { name: '🔴 Red', css: 'text-error', bgCss: 'bg-red-500/30' },
    2: { name: '🟠 Orange', css: 'text-secondary', bgCss: 'bg-secondary/10' },
    3: { name: '🟡 Yellow', css: 'text-warning', bgCss: 'bg-warning/10' },
    4: { name: '🟢 Green', css: 'text-primary', bgCss: 'bg-primary/10' },
    5: { name: '🔵 Blue', css: 'text-info', bgCss: 'bg-info/10' },
    6: { name: '🟣 Purple', css: 'text-accent', bgCss: 'bg-accent/10' },
};

const SERVERS = {
    '': { name: 'Custom', value: '' },
    yt: { name: 'YouTube', value: 'rtmp://a.rtmp.youtube.com/live2/' },
    yb: { name: 'YT Backup', value: 'rtmp://b.rtmp.youtube.com/live2?backup=1/' },
    fb: { name: 'Facebook', value: 'rtmps://live-api-s.facebook.com:443/rtmp/' },
    ig: { name: 'Instagram', value: 'rtmps://edgetee-upload-${s_prp}.xx.fbcdn.net:443/rtmp/' },
    vc: { name: 'VDO Cipher', value: 'rtmp://live-ingest-01.vd0.co:1935/livestream/' },
    vk: { name: 'VK Video', value: 'rtmp://ovsu.okcdn.ru/input/' },
};
