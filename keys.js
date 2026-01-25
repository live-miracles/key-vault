function renderKeyTable(eventId = null) {
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
                <td>${capitalize(k.type)}</td>
                <td>${capitalize(k.language)}</td>
                <td>${k.server}</td>
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
    const contextMenu = document.getElementById('context-menu');
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
    console.log('Edit key:', selectedKeyId);
    const key = config.keys.find((k) => (k.id = selectedKeyId));
    document.getElementById('key-modal').showModal();
    document.getElementById('context-menu').classList.add('hidden');
}

async function editKeyFormBtn(event) {
    const pipeId = document.getElementById('out-pipe-id-input').value;
    const serverUrl = document.getElementById('out-server-url-input').value;
    const rtmpKey = document.getElementById('out-rtmp-key-input').value;
    const outId = document.getElementById('out-id-input').value;
    const data = {
        name: document.getElementById('out-name-input').value,
        encoding: document.getElementById('out-encoding-input').value,
        url: serverUrl + rtmpKey,
    };

    if (serverUrl.includes('${s_prp}')) {
        // Instagram
        const params = new URLSearchParams(rtmpKey.split('?')[1]);
        data.url = data.url.replaceAll('${s_prp}', params.get('s_prp'));
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
    const key = config.keys.find((k) => (k.id = selectedKeyId));
    if (!key) {
        console.error('Key not found:', selectedKeyId);
    }

    if (!confirm('Are you sure you want to delete key "' + key.name + '"?')) {
        return;
    }

    processResponse(await deleteKey(key.id));

    document.getElementById('context-menu').classList.add('hidden');
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
    const key = config.keys.find((k) => (k.id = selectedKeyId));
    if (!key) {
        console.error('Key not found:', selectedKeyId);
    }

    if (copyText(key.key)) {
        showCopiedNotification();
    }
    document.getElementById('context-menu').classList.add('hidden');
}

async function copyRtmpBtn() {
    if (!selectedKeyId) return;
    const key = config.keys.find((k) => (k.id = selectedKeyId));
    if (!key) {
        console.error('Key not found:', selectedKeyId);
    }

    if (copyText(key.server + key.key)) {
        showCopiedNotification();
    }
    document.getElementById('context-menu').classList.add('hidden');
}
