function getLanguages() {
    return [...(config.languages || [])]
        .map((language) => ({ ...language, id: normalizeLanguageId(language.id) }))
        .filter((language) => isValidLanguageId(language.id) && language.name)
        .sort((a, b) => {
            const orderDiff = Number(a.order || 0) - Number(b.order || 0);
            if (orderDiff !== 0) return orderDiff;
            return a.name.localeCompare(b.name);
        });
}

function getLanguageName(id) {
    if (id === '*') return '* (All)';
    const languageId = normalizeLanguageId(id);
    return getLanguages().find((language) => language.id === languageId)?.name || languageId;
}

function hasMissingLanguage(id) {
    const languageId = normalizeLanguageId(id);
    return id !== '*' && !getLanguages().some((language) => language.id === languageId);
}

function languageLabelHtml(id) {
    if (!hasMissingLanguage(id)) return escapeHtml(getLanguageName(id));

    return `
        <span class="text-error inline-flex items-center justify-center gap-1" title="Language not found">
            ${iconSvg('error', 'h-4 w-4')}
            <span>${escapeHtml(id)}</span>
        </span>
    `;
}

function getLanguageOrder(id) {
    const languageId = normalizeLanguageId(id);
    const index = getLanguages().findIndex((language) => language.id === languageId);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function getNextLanguageId() {
    return getNextSequentialId(getLanguages(), 'L');
}

function isValidLanguageId(id) {
    return /^L([1-9][0-9]*)$/.test(String(id));
}

function normalizeLanguageId(id) {
    const languageId = String(id ?? '').trim();
    if (/^[1-9][0-9]*$/.test(languageId)) return `L${languageId}`;

    const prefixedMatch = languageId.match(/^(?:L|lang)([1-9][0-9]*)$/i);
    if (prefixedMatch) return `L${prefixedMatch[1]}`;

    return languageId;
}

function languageOptions({ includeAll = false, eventId = null, action = null } = {}) {
    const options = includeAll ? [{ id: '*', name: '* (All)' }] : [];
    const languages = getLanguages().filter(
        (language) => !action || hasKeyAccess(eventRoles, action, eventId, language.id),
    );
    return options.concat(languages.sort((a, b) => a.name.localeCompare(b.name)));
}

function renderLanguageSelect(selector, options) {
    document.querySelector(selector).innerHTML = languageOptions(options)
        .map(
            (language) =>
                `<option value="${escapeHtml(language.id)}">${escapeHtml(language.name)}</option>`,
        )
        .join('');
}

function renderLanguageTable() {
    document.querySelector('#add-language-btn').disabled = false;
    document.querySelector('#language-rows').innerHTML = getLanguages()
        .map((language) => {
            const isPending = Boolean(language.pending);
            const usedByKeys = config.keys.some((key) => key.language === language.id);
            const usedByRoles = config.roles.some((role) => role.language === language.id);
            const deleteDisabled = isPending || usedByKeys || usedByRoles ? 'disabled' : '';
            const deleteTitle = isPending
                ? 'Saving'
                : deleteDisabled
                  ? 'Language is in use'
                  : 'Delete';
            const actions = isPending
                ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
                : `
                        <div class="flex justify-center gap-1">
                            <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Edit" aria-label="Edit language" onclick="editLanguageById(this.closest('tr').dataset.languageId)">
                                ${iconSvg('pen')}
                            </button>
                            <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="${deleteTitle}" aria-label="Delete language" onclick="deleteLanguageById(this.closest('tr').dataset.languageId)" ${deleteDisabled}>
                                ${iconSvg('trash')}
                            </button>
                        </div>
                    `;

            return `
                <tr class="hover:bg-base-300 text-center" data-language-id="${escapeHtml(language.id)}" draggable="${isPending ? 'false' : 'true'}">
                    <td style="padding: 5px;" class="cursor-move text-base-content/60" title="Drag to reorder">
                        ${iconSvg('grip', 'mx-auto h-4 w-4')}
                    </td>
                    <td style="padding: 5px;">${escapeHtml(language.name)}</td>
                    <td style="padding: 5px;">${actions}</td>
                </tr>
            `;
        })
        .join('');

    document.querySelectorAll('#language-rows tr').forEach((row) => {
        if (config.languages.find((language) => language.id === row.dataset.languageId)?.pending) {
            return;
        }
        row.addEventListener('dragstart', dragLanguageStart);
        row.addEventListener('dragover', dragLanguageOver);
        row.addEventListener('drop', dropLanguage);
        row.addEventListener('dragend', dragLanguageEnd);
    });
}

function showSettingsModal() {
    if (!hasLanguageAccess(eventRoles)) return;

    renderLanguageTable();
    document.querySelector('#settings-modal').showModal();
}

function addLanguageBtn() {
    const nextId = getNextLanguageId();
    document.querySelector('#language-id-input').value = nextId;
    document.querySelector('#language-id-input').readOnly = true;
    document.querySelector('#language-modal').dataset.mode = 'add';
    document.querySelector('#language-name-input').value = '';
    document.querySelector('#language-id-input').nextElementSibling.innerText = '';
    document.querySelector('#language-name-input').nextElementSibling.innerText = '';
    document.querySelector('#language-modal').showModal();
}

function editLanguageById(languageId) {
    const language = config.languages.find((l) => l.id === languageId);
    if (!language) {
        console.error('Language not found:', languageId);
        return;
    }

    document.querySelector('#language-id-input').value = language.id;
    document.querySelector('#language-id-input').readOnly = true;
    document.querySelector('#language-modal').dataset.mode = 'edit';
    document.querySelector('#language-name-input').value = language.name;
    document.querySelector('#language-id-input').nextElementSibling.innerText = '';
    document.querySelector('#language-name-input').nextElementSibling.innerText = '';
    document.querySelector('#language-modal').showModal();
}

async function saveLanguageFormBtn(event) {
    const language = {
        id: normalizeLanguageId(document.getElementById('language-id-input').value),
        name: document.getElementById('language-name-input').value.trim(),
    };

    let errorElem = document.querySelector('#language-id-input').nextElementSibling;
    if (language.id === '') {
        errorElem.innerText = "ID can't be empty";
        event.preventDefault();
        return;
    } else if (!isValidLanguageId(language.id)) {
        errorElem.innerText = 'Use L1 or higher';
        event.preventDefault();
        return;
    } else if (
        document.querySelector('#language-modal').dataset.mode === 'add' &&
        config.languages.some((l) => l.id === language.id)
    ) {
        errorElem.innerText = 'ID already exists';
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    errorElem = document.querySelector('#language-name-input').nextElementSibling;
    if (language.name === '') {
        errorElem.innerText = "Name can't be empty";
        event.preventDefault();
        return;
    } else {
        errorElem.innerText = '';
    }

    const isEdit = document.querySelector('#language-modal').dataset.mode === 'edit';
    const snapshot = cloneConfig();
    const oldLanguage = config.languages.find((l) => l.id === language.id);
    const optimisticLanguage = {
        ...oldLanguage,
        ...language,
        pending: !isEdit,
        order:
            oldLanguage?.order ||
            String(Math.max(...config.languages.map((l) => Number(l.order) || 0), 0) + 1),
    };

    replaceConfigItem('languages', optimisticLanguage);
    renderLanguageTable();
    renderRoleLanguages();
    renderKeyLanguages(getUrlParam('event'));
    renderKeyTable(getUrlParam('event'));

    showLoading();
    try {
        const newLanguage = processResponse(
            await api(isEdit ? 'editLanguage' : 'addLanguage', language),
        );
        if (newLanguage === null) {
            restoreConfig(snapshot);
            renderLanguageTable();
            renderRoleLanguages();
            return;
        }
        replaceConfigItem('languages', newLanguage);
        renderLanguageTable();
        renderRoleLanguages();
        renderKeyLanguages(getUrlParam('event'));
        renderKeyTable(getUrlParam('event'));
    } finally {
        hideLoading();
    }
}

async function deleteLanguageById(languageId) {
    const language = config.languages.find((l) => l.id === languageId);
    if (!language) {
        console.error('Language not found:', languageId);
        return;
    }

    if (!confirm(`Are you sure you want to delete language "${language.name}"?`)) {
        return;
    }

    const snapshot = cloneConfig();
    config.languages = config.languages.filter((l) => l.id !== language.id);
    renderLanguageTable();
    renderRoleLanguages();
    renderKeyLanguages(getUrlParam('event'));
    renderKeyTable(getUrlParam('event'));

    showLoading();
    try {
        const res = processResponse(await api('deleteLanguage', language.id));
        if (res === null) {
            restoreConfig(snapshot);
            renderLanguageTable();
            renderRoleLanguages();
        }
    } finally {
        hideLoading();
    }
}

let draggedLanguageId = null;

function dragLanguageStart(event) {
    draggedLanguageId = event.currentTarget.dataset.languageId;
    event.currentTarget.classList.add('opacity-50');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedLanguageId);
}

function dragLanguageOver(event) {
    event.preventDefault();
    const targetRow = event.currentTarget;
    if (!draggedLanguageId || targetRow.dataset.languageId === draggedLanguageId) return;

    const draggedRow = [...document.querySelectorAll('#language-rows tr')].find(
        (row) => row.dataset.languageId === draggedLanguageId,
    );
    if (!draggedRow) return;

    const rect = targetRow.getBoundingClientRect();
    if (event.clientY > rect.top + rect.height / 2) {
        targetRow.after(draggedRow);
    } else {
        targetRow.before(draggedRow);
    }
}

async function dropLanguage(event) {
    event.preventDefault();
    const languageIds = [...document.querySelectorAll('#language-rows tr')].map(
        (row) => row.dataset.languageId,
    );
    const currentIds = getLanguages().map((language) => language.id);
    if (languageIds.join('|') === currentIds.join('|')) return;

    const snapshot = cloneConfig();
    config.languages = languageIds.map((id, index) => {
        const language = config.languages.find((l) => l.id === id);
        return { ...language, order: String(index + 1) };
    });
    renderLanguageTable();
    renderRoleLanguages();
    renderKeyLanguages(getUrlParam('event'));
    renderKeyTable(getUrlParam('event'));

    showLoading();
    try {
        const newLanguages = processResponse(await api('reorderLanguages', languageIds));
        if (newLanguages !== null) {
            config.languages = newLanguages;
            renderLanguageTable();
            renderRoleLanguages();
            renderKeyLanguages(getUrlParam('event'));
            renderKeyTable(getUrlParam('event'));
        } else {
            restoreConfig(snapshot);
            renderLanguageTable();
            renderRoleLanguages();
        }
    } finally {
        hideLoading();
    }
}

function dragLanguageEnd(event) {
    event.currentTarget.classList.remove('opacity-50');
    draggedLanguageId = null;
}
