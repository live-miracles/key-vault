function maskKey(key) {
    if (!key || key.length === 0) {
        return '';
    }
    if (key.length <= 6) {
        if (key.length === 1) {
            return key;
        }
        return key[0] + ' ... ' + key[key.length - 1];
    }
    return key.substring(0, 3) + ' ... ' + key.substring(key.length - 3);
}

function renderKeyTable(eventId = null) {
    if (hasKeyAccess(eventRoles, ACTIONS.CREATE, eventId)) {
        document.querySelector('#add-key-btn').classList.remove('hidden');
    } else {
        document.querySelector('#add-key-btn').classList.add('hidden');
    }

    const event = config.events.find((e) => e.id === eventId);
    if (!event) {
        document.querySelector('#key-table').classList.add('hidden');
        return;
    }
    document.querySelector('#key-table').classList.remove('hidden');

    const keys = config.keys
        .filter((k) => k.event === eventId)
        .sort((a, b) => {
            // First, sort by language (lexicographical order)
            const langCompare = a.language.localeCompare(b.language);
            if (langCompare !== 0) return langCompare;

            // If language is same, sort by type (primary before backup)
            if (a.type === 'primary' && b.type === 'backup') return -1;
            if (a.type === 'backup' && b.type === 'primary') return 1;
            if (a.type !== b.type) return a.type.localeCompare(b.type);

            // If language and type are same, sort by row number
            return (a.row || 0) - (b.row || 0);
        });
    document.querySelector('#key-rows').innerHTML = keys
        .map(
            (k, i) => `
            <tr class="hover:bg-base-300" data-key-id="${k.id}">
                <th>${i + 1}</th>
                <td>${k.name}</td>
                <td>${KEY_TYPE_MAP[k.type]}</td>
                <td>${LANGUAGE_MAP[k.language]}</td>
                <td>${SERVERS[k.server]?.value || k.server}</td>
                <td>${maskKey(k.key)}</td>
                <td>${k.remarks}</td>
            </tr>`,
        )
        .join('');

    // Add right-click event listeners to rows
    document.querySelectorAll('#key-rows tr').forEach((row) => {
        row.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            showContextMenu(e, row.dataset.keyId);
        });
    });
}

let selectedKeyId = null;
function showContextMenu(event, keyId) {
    selectedKeyId = keyId;
    const contextMenu = document.getElementById('key-context-menu');
    contextMenu.style.left = `${event.pageX}px`;
    contextMenu.style.top = `${event.pageY}px`;
    contextMenu.classList.remove('hidden');

    // Hide context menu when clicking elsewhere
    const hideMenu = (e) => {
        if (!contextMenu.contains(e.target)) {
            contextMenu.classList.add('hidden');
            document.removeEventListener('click', hideMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', hideMenu), 0);
}

function editKeyRow() {
    if (!selectedKeyId) return;
    console.log(selectedKeyId);
    const key = config.keys.find((k) => k.id === selectedKeyId);

    document.querySelector('#key-id-input').value = key.id;
    document.querySelector('#key-event-input').value = key.event;
    document.querySelector('#key-color-input').value = key.color;
    document.querySelector('#key-type-input').value = key.type;
    document.querySelector('#key-name-input').value = key.name;

    renderServerInput(key.server);

    document.querySelector('#stream-key-input').value = key.key;

    document.getElementById('key-modal').showModal();
    document.getElementById('key-context-menu').classList.add('hidden');
}

async function saveKeyFormBtn(event) {
    const data = {
        id: document.getElementById('key-id-input').value,
        event: document.getElementById('key-event-input').value,
        color: document.getElementById('key-color-input').value,
        name: document.getElementById('key-name-input').value,
        type: document.getElementById('key-type-input').value,
        language: document.getElementById('key-language-input').value,
        server:
            document.getElementById('key-server-input').value ||
            document.getElementById('key-custom-server-input').value,
        key: document.getElementById('stream-key-input').value,
        remarks: document.getElementById('key-remarks-input').value,
    };

    // Validation
    if (data.name === '') {
        const errorElem = document.querySelector('#key-name-input').nextElementSibling;
        errorElem.innerText = "Name can't be empty";
        event.preventDefault();
        return;
    } else {
        errorElem.classList.add('hidden');
    }

    const isUrlValid = isValidUrl(data.url);
    if (isUrlValid) {
        document.getElementById('out-rtmp-key-input').classList.remove('input-error');
    } else {
        document.getElementById('out-rtmp-key-input').classList.add('input-error');
    }

    const isOutNameValid = /^[a-zA-Z0-9_]*$/.test(data.name);
    if (isOutNameValid) {
        document.getElementById('out-name-input').classList.remove('input-error');
    } else {
        document.getElementById('out-name-input').classList.add('input-error');
    }

    if (!isUrlValid || !isOutNameValid) {
        event.preventDefault();
        return;
    }

    const res = await setOut(pipeId, outId, data);

    if (res.error) {
        return;
    }

    streamOutsConfig[pipeId][outId].name = data.name;
    streamOutsConfig[pipeId][outId].encoding = data.encoding;
    streamOutsConfig[pipeId][outId].url = data.url;
    pipelines = getPipelinesInfo();
    renderPipelines();
}

async function deleteKeyRow() {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
    }

    if (!confirm('Are you sure you want to delete key "' + key.name + '"?')) {
        return;
    }

    processResponse(await deleteKey(key.id));

    document.getElementById('key-context-menu').classList.add('hidden');
}

function showCopiedNotification() {
    const notification = document.getElementById('copied-notification');
    if (!notification) return;

    notification.classList.remove('hidden');
    setTimeout(() => {
        notification.classList.add('hidden');
    }, 2000);
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
    document.getElementById('key-context-menu').classList.add('hidden');
}

async function copyRtmpBtn() {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => k.id === selectedKeyId);
    if (!key) {
        console.error('Key not found:', selectedKeyId);
    }

    let serverUrl = SERVERS[key.server]?.value || key.server;
    if (serverUrl.includes('${s_prp}')) {
        // Instagram
        const params = new URLSearchParams(key.key.split('?')[1]);
        serverUrl = serverUrl.replaceAll('${s_prp}', params.get('s_prp'));
    }

    if (copyText(serverUrl + key.key)) {
        showCopiedNotification();
    }
    document.getElementById('key-context-menu').classList.add('hidden');
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
    document.querySelector('#key-type-input').value = 'p';
    renderKeyLanguages(eventId);
    document.querySelector('#key-language-input').value = 'en';
    renderServerInput('yt');
    document.querySelector('#key-custom-server-input').value = '';
    document.querySelector('#stream-key-input').value = '';
    document.querySelector('#key-remarks-input').value = '';

    document.querySelector('#key-modal').showModal();
}

function renderKeyLanguages(eventId) {
    document.querySelector('#key-language-input').innerHTML = LANGUAGES.filter((lang) =>
        hasKeyAccess(eventRoles, ACTIONS.CREATE, eventId, lang),
    )
        .map((lang) => `<option value="${lang}">${LANGUAGE_MAP[lang]}</option>`)
        .join('');
}

function renderServerInput(server) {
    if (server && Object.keys(SERVERS).includes(server)) {
        document.querySelector('#key-server-input').value = server;
        document.querySelector('#custom-url').value = '';
        document.querySelector('#custom-url').classList.remove('inline-block');
        document.querySelector('#custom-url').classList.add('hidden');
    } else {
        document.querySelector('#key-server-input').value = '';
        document.querySelector('#custom-url').value = server;
        document.querySelector('#custom-url').classList.add('inline-block');
        document.querySelector('#custom-url').classList.remove('hidden');
    }
}

const COLORS = {
    '': { name: 'None', css: '' },
    1: { name: '🔴 Red', css: 'text-error' },
    2: { name: '🟠 Orange', css: 'text-secondary' },
    3: { name: '🟡 Yellow', css: 'text-warning' },
    4: { name: '🟢 Green', css: 'text-primary' },
    5: { name: '🔵 Blue', css: 'text-info' },
    6: { name: '🟣 Purple', css: 'text-accent' },
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

const KEY_TYPE_MAP = {
    p: 'Primary',
    b: 'Backup',
};
