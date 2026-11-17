// @ts-nocheck

function getInputs() {
    return [...(config.inputs || [])]
        .filter((input) => input.id && input.name)
        .sort((a, b) => {
            const orderDiff = Number(a.order || 0) - Number(b.order || 0);
            if (orderDiff !== 0) return orderDiff;
            return a.name.localeCompare(b.name);
        });
}

function getInputsForTable() {
    return [...(config.inputs || [])]
        .filter((input) => input.id || input.name)
        .sort((a, b) => {
            const orderDiff = Number(a.order || 0) - Number(b.order || 0);
            if (orderDiff !== 0) return orderDiff;
            return String(a.name || '').localeCompare(String(b.name || ''));
        });
}

function getInputName(id) {
    if (id === '*') return '* (All)';
    return getInputs().find((input) => input.id === id)?.name || id;
}

function hasMissingInput(id) {
    return id !== '*' && !getInputs().some((input) => input.id === id);
}

function inputLabelHtml(id) {
    if (!hasMissingInput(id)) return escapeHtml(getInputName(id));

    return `
        <span class="text-error inline-flex items-center justify-center gap-1" title="Input not found">
            ${iconSvg('error', 'h-4 w-4')}
            <span>${escapeHtml(id)}</span>
        </span>
    `;
}

function getInputOrder(id) {
    const index = getInputs().findIndex((input) => input.id === id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function inputOptions({ includeAll = false, eventId = null, action = null } = {}) {
    const options = includeAll ? [{ id: '*', name: '* (All)' }] : [];
    const inputs = getInputs().filter(
        (input) => !action || hasKeyAccess(eventRoles, action, eventId, input.id),
    );
    return options.concat(inputs.sort((a, b) => a.name.localeCompare(b.name)));
}

function renderInputSelect(selector, options = {}) {
    const placeholder = options.placeholder
        ? [
              {
                  id: '',
                  name: options.placeholder,
                  disabled: true,
              },
          ]
        : [];
    document.querySelector(selector).innerHTML = placeholder
        .concat(inputOptions(options))
        .map(
            (input) =>
                `<option value="${escapeHtml(input.id)}" ${input.disabled ? 'disabled' : ''}>${escapeHtml(input.name)}</option>`,
        )
        .join('');
}

function renderInputTable() {
    document.querySelector('#add-input-btn').disabled = false;
    const inputs = getInputsForTable();
    document.querySelector('#input-rows').innerHTML = inputs
        .map((input) => {
            const isPending = Boolean(input.pending);
            const usedByKeys = config.keys.some((key) => key.input === input.id);
            const usedByRoles = config.roles.some((role) => role.input === input.id);
            const deleteDisabled = isPending || usedByKeys || usedByRoles ? 'disabled' : '';
            const deleteTitle = isPending
                ? 'Saving'
                : deleteDisabled
                  ? 'Input is in use'
                  : 'Delete';
            const actions = isPending
                ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
                : `
                        <div class="flex justify-center gap-1">
                            <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Edit" aria-label="Edit input" data-action="edit-input-by-id">
                                ${iconSvg('pen')}
                            </button>
                            <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="${deleteTitle}" aria-label="Delete input" data-action="delete-input-by-id" ${deleteDisabled}>
                                ${iconSvg('trash')}
                            </button>
                        </div>
                    `;

            return `
                <tr class="hover:bg-base-300 text-center" data-input-id="${escapeHtml(input.id)}" draggable="${isPending ? 'false' : 'true'}">
                    <td style="padding: 5px;" class="cursor-move text-base-content/60" title="Drag to reorder">
                        ${iconSvg('grip', 'mx-auto h-4 w-4')}
                    </td>
                    <td style="padding: 5px;">
                        <span>${escapeHtml(input.name || '(unnamed)')}</span>
                    </td>
                    <td style="padding: 5px;">${actions}</td>
                </tr>
            `;
        })
        .join('');

    document.querySelectorAll('#input-rows tr').forEach((row) => {
        if (inputs.find((input) => input.id === row.dataset.inputId)?.pending) {
            return;
        }
        row.addEventListener('dragstart', dragInputStart);
        row.addEventListener('dragover', dragInputOver);
        row.addEventListener('drop', dropInput);
        row.addEventListener('dragend', dragInputEnd);
    });
}

function showSettingsModal() {
    if (!hasInputAccess(eventRoles)) return;

    renderInputTable();
    document.querySelector('#settings-modal').showModal();
}

function openInputModal({ id, name }) {
    const modal = document.querySelector('#input-modal');
    // The id is made by the server when a input is added; it is only kept here to know
    // which input an edit is for.
    document.querySelector('#input-id-field').value = id;
    document.querySelector('#input-name-field').value = name;
    document.querySelector('#input-modal-title').innerText = id ? 'Edit input' : 'Add an input';
    document.querySelector('#save-input-btn').innerText = id ? 'Save changes' : 'Add input';
    document.querySelector('#input-name-field').nextElementSibling.innerText = '';
    document.querySelector('#input-name-field').classList.remove('input-error');
    modal.showModal();
    document.querySelector('#input-name-field').focus();
}

function addInputBtn() {
    openInputModal({ id: '', name: '' });
}

function editInputById(inputId) {
    const input = config.inputs.find((l) => l.id === inputId);
    if (!input) {
        console.error('Input not found:', inputId);
        return;
    }

    openInputModal(input);
}

async function saveInputFormBtn(event) {
    const id = document.getElementById('input-id-field').value.trim();
    const name = document.getElementById('input-name-field').value.trim();
    const isEdit = id !== '';

    const errorElem = document.querySelector('#input-name-field').nextElementSibling;
    if (name === '') {
        errorElem.innerText = 'Please type the name of the input, for example "Hindi".';
        document.querySelector('#input-name-field').classList.add('input-error');
        event.preventDefault();
        return;
    }
    if (
        config.inputs.some(
            (l) => l.id !== id && String(l.name).trim().toLowerCase() === name.toLowerCase(),
        )
    ) {
        errorElem.innerText = 'You already have an input with this name.';
        document.querySelector('#input-name-field').classList.add('input-error');
        event.preventDefault();
        return;
    }

    const snapshot = cloneConfig();
    const oldInput = config.inputs.find((l) => l.id === id);
    const optimisticInput = {
        ...oldInput,
        id: isEdit ? id : newTempId(),
        name,
        pending: !isEdit,
        order:
            oldInput?.order ||
            String(Math.max(...config.inputs.map((l) => Number(l.order) || 0), 0) + 1),
    };

    replaceConfigItem('inputs', optimisticInput);
    renderInputTable();
    renderRoleInputs();
    renderKeyInputs(getUrlParam('event'));
    renderKeyTable(getUrlParam('event'));

    showLoading();
    try {
        const newInput = processResponse(
            await api(isEdit ? 'editInput' : 'addInput', isEdit ? { id, name } : { name }),
        );
        if (newInput === null) {
            restoreConfig(snapshot);
            renderInputTable();
            renderRoleInputs();
            return;
        }
        replaceConfigItem('inputs', newInput, optimisticInput.id);
        renderInputTable();
        renderRoleInputs();
        renderKeyInputs(getUrlParam('event'));
        renderKeyTable(getUrlParam('event'));
    } finally {
        hideLoading();
    }
}

async function deleteInputById(inputId) {
    const input = config.inputs.find((l) => l.id === inputId);
    if (!input) {
        console.error('Input not found:', inputId);
        return;
    }

    if (!confirm(`Are you sure you want to delete input "${input.name}"?`)) {
        return;
    }

    const snapshot = cloneConfig();
    config.inputs = config.inputs.filter((l) => l.id !== input.id);
    renderInputTable();
    renderRoleInputs();
    renderKeyInputs(getUrlParam('event'));
    renderKeyTable(getUrlParam('event'));

    showLoading();
    try {
        const res = processResponse(await api('deleteInput', input.id));
        if (res === null) {
            restoreConfig(snapshot);
            renderInputTable();
            renderRoleInputs();
        }
    } finally {
        hideLoading();
    }
}

let draggedInputId = null;

function dragInputStart(event) {
    draggedInputId = event.currentTarget.dataset.inputId;
    event.currentTarget.classList.add('opacity-50');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedInputId);
}

function dragInputOver(event) {
    event.preventDefault();
    const targetRow = event.currentTarget;
    if (!draggedInputId || targetRow.dataset.inputId === draggedInputId) return;

    const draggedRow = [...document.querySelectorAll('#input-rows tr')].find(
        (row) => row.dataset.inputId === draggedInputId,
    );
    if (!draggedRow) return;

    const rect = targetRow.getBoundingClientRect();
    if (event.clientY > rect.top + rect.height / 2) {
        targetRow.after(draggedRow);
    } else {
        targetRow.before(draggedRow);
    }
}

async function dropInput(event) {
    event.preventDefault();
    const inputIds = [...document.querySelectorAll('#input-rows tr')].map(
        (row) => row.dataset.inputId,
    );
    const currentIds = getInputs().map((input) => input.id);
    if (inputIds.join('|') === currentIds.join('|')) return;

    const snapshot = cloneConfig();
    config.inputs = inputIds.map((id, index) => {
        const input = config.inputs.find((l) => l.id === id);
        return { ...input, order: String(index + 1) };
    });
    renderInputTable();
    renderRoleInputs();
    renderKeyInputs(getUrlParam('event'));
    renderKeyTable(getUrlParam('event'));

    showLoading();
    try {
        const newInputs = processResponse(await api('reorderInputs', inputIds));
        if (newInputs !== null) {
            config.inputs = newInputs;
            renderInputTable();
            renderRoleInputs();
            renderKeyInputs(getUrlParam('event'));
            renderKeyTable(getUrlParam('event'));
        } else {
            restoreConfig(snapshot);
            renderInputTable();
            renderRoleInputs();
        }
    } finally {
        hideLoading();
    }
}

function dragInputEnd(event) {
    event.currentTarget.classList.remove('opacity-50');
    draggedInputId = null;
}
