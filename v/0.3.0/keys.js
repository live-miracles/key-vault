function maskKey(key) {
    if (!key || key.length === 0) {
        return '';
    }
    if (key.length <= 6) {
        if (key.length === 1) {
            return key;
        }
        return key[0] + '...' + key[key.length - 1];
    }
    return key.substring(0, 3) + '...' + key.substring(key.length - 3);
}

function renderKeyTable(eventId = null) {
    const keysByLanguage = Object.groupBy(
        config.keys.filter((k) => k.event === eventId),
        (k) => k.language,
    );
    let langIndex = 0;
    let html = '';

    Object.keys(keysByLanguage)
        .sort((a, b) => LANGUAGE_MAP[a].localeCompare(LANGUAGE_MAP[b]))
        .forEach((lang) => {
            langIndex++;
            const keys = keysByLanguage[lang].sort((a, b) => a.row - b.row);

            keys.forEach((k, keyIndex) => {
                html += `
                <tr class="hover:bg-base-300 ${COLORS[k.color].bgCss} text-center" data-key-id="${k.id}">
                    ${
                        keyIndex === 0
                            ? `<td rowspan="${keys.length}" class="align-middle font-semibold" style="padding: 2px">
                                ${langIndex} - ${LANGUAGE_MAP[k.language] || k.language}
                            </td>`
                            : ''
                    }
                    <td style="padding: 2px">${keyIndex + 1}</td>
                    <td style="padding: 2px">${k.name}</td>
                    <td style="padding: 2px">${(SERVERS[k.server]?.value || k.server) + maskKey(k.key)}</td>
                    <td style="padding: 2px">${(SERVERS[k.server2]?.value || k.server2) + maskKey(k.key2)}</td>
                    <td style="padding: 2px">${
                        k.link
                            ? `<a href="${k.link}" class="link" target="_blank">${getShortText(k.link, 25)}</a>`
                            : ''
                    }</td>
                    <td style="padding: 2px">${k.remarks || ''}</td>
                </tr>`;
            });
        });

    document.querySelector('#key-rows').innerHTML = html;

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
            const event = config.events.find((e) => e.id === key.event);
            const isLocked = event.status === EVENT_STATUS.LOCKED;
            if (hasKeyAccess(eventRoles, ACTIONS.UPDATE, key.event, key.language) && !isLocked) {
                document.querySelector('#edit-key-btn').classList.remove('hidden');
                document.querySelector('#delete-key-btn').classList.remove('hidden');
            } else {
                document.querySelector('#edit-key-btn').classList.add('hidden');
                document.querySelector('#delete-key-btn').classList.add('hidden');
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

    errorElem = document.querySelector('#stream-key2-input').nextElementSibling;
    if (
        (key.server2 && key.key2 === '') ||
        key.key2.startsWith('rtmp://') ||
        key.key2.startsWith('rtmps://') ||
        key.key2.includes(' ')
    ) {
        errorElem.innerText = 'Invalid RTMP Key';
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    // Sending request
    showLoading();
    if (key.id === '') {
        console.log(key);
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
    }

    if (copyText(key.link)) {
        showCopiedNotification();
    }
}

async function copyKeyBtn() {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
    }

    if (copyText(key.key)) {
        showCopiedNotification();
    }
}

async function copyRtmpBtn(suffix = '') {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
    }

    let serverUrl = SERVERS[key['server' + suffix]]?.value || key['server' + suffix];
    if (serverUrl.includes('${s_prp}')) {
        // Instagram
        const params = new URLSearchParams(key.key.split('?')[1]);
        serverUrl = serverUrl.replaceAll('${s_prp}', params.get('s_prp'));
    }

    if (copyText(serverUrl + key['key' + suffix])) {
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
