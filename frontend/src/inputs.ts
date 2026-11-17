// @ts-nocheck

// The inputs of one event, in the order its admins gave them; with no event, every input.
function getInputs(eventId = null) {
    return [...(config.inputs || [])]
        .filter((input) => input.id && input.name && (!eventId || input.event === eventId))
        .sort((a, b) => {
            const orderDiff = Number(a.order || 0) - Number(b.order || 0);
            if (orderDiff !== 0) return orderDiff;
            return a.name.localeCompare(b.name);
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
    const input = getInputs().find((item) => item.id === id);
    return input ? Number(input.order || 0) : Number.MAX_SAFE_INTEGER;
}

function inputOptions({ includeAll = false, eventId = null, action = null } = {}) {
    const options = includeAll ? [{ id: '*', name: '* (All)' }] : [];
    const inputs = getInputs(eventId).filter(
        (input) => !action || hasKeyAccess(eventRoles, action, eventId, input.id),
    );
    return options.concat(inputs);
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

// After the inputs of an event change, everything that lists them is drawn again.
function renderInputViews() {
    const eventId = getUrlParam('event');
    renderRoleInputs();
    renderKeyInputs(eventId);
    renderKeyTable(eventId);
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
    if (!hasInputAccess(eventRoles, getUrlParam('event'))) return;
    openInputModal({ id: '', name: '' });
}

function editInputById(inputId) {
    const input = config.inputs.find((l) => l.id === inputId);
    if (!input) {
        console.error('Input not found:', inputId);
        return;
    }
    if (!hasInputAccess(eventRoles, input.event)) return;

    openInputModal(input);
}

async function saveInputFormBtn(event) {
    const eventId = getUrlParam('event');
    const id = document.getElementById('input-id-field').value.trim();
    const name = document.getElementById('input-name-field').value.trim();
    const isEdit = id !== '';

    const errorElem = document.querySelector('#input-name-field').nextElementSibling;
    if (!hasInputAccess(eventRoles, eventId)) {
        event.preventDefault();
        return;
    }
    if (name === '') {
        errorElem.innerText = 'Please type the name of the input, for example "Hindi".';
        document.querySelector('#input-name-field').classList.add('input-error');
        event.preventDefault();
        return;
    }
    // A name only has to differ from the other inputs of this event.
    if (
        config.inputs.some(
            (l) =>
                l.event === eventId &&
                l.id !== id &&
                String(l.name).trim().toLowerCase() === name.toLowerCase(),
        )
    ) {
        errorElem.innerText = 'This event already has an input with this name.';
        document.querySelector('#input-name-field').classList.add('input-error');
        event.preventDefault();
        return;
    }

    const snapshot = cloneConfig();
    const oldInput = config.inputs.find((l) => l.id === id);
    const ownOrders = config.inputs.filter((l) => l.event === eventId).map((l) => Number(l.order));
    const optimisticInput = {
        ...oldInput,
        id: isEdit ? id : newTempId(),
        event: eventId,
        name,
        pending: !isEdit,
        order: oldInput?.order || String(Math.max(...ownOrders, 0) + 1),
    };

    replaceConfigItem('inputs', optimisticInput);
    renderInputViews();

    showLoading();
    try {
        const newInput = processResponse(
            await api(
                isEdit ? 'editInput' : 'addInput',
                isEdit ? { id, name } : { event: eventId, name },
            ),
        );
        if (newInput === null) {
            restoreConfig(snapshot);
            renderInputViews();
            return;
        }
        replaceConfigItem('inputs', newInput, optimisticInput.id);
        // A new input is opened straight away, ready for its first stream.
        if (!isEdit) setUrlParam('input', newInput.id);
        renderInputViews();
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
    if (!hasInputAccess(eventRoles, input.event)) return;

    if (!(await confirmAction(`Delete the input "${input.name}"? This cannot be undone.`))) {
        return;
    }

    const snapshot = cloneConfig();
    config.inputs = config.inputs.filter((l) => l.id !== input.id);
    if (getUrlParam('input') === input.id) setUrlParam('input', null);
    renderInputViews();

    showLoading();
    try {
        const res = processResponse(await api('deleteInput', input.id));
        if (res === null) {
            restoreConfig(snapshot);
            renderInputViews();
        }
    } finally {
        hideLoading();
    }
}

// ----- Reordering: drag an input in the list on the left. The order is that event's own. -----

let draggedInputId = null;

const draggableInputRows = () => [
    ...document.querySelectorAll('#input-list .lang-row[draggable="true"]'),
];

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

    const draggedRow = draggableInputRows().find((row) => row.dataset.inputId === draggedInputId);
    if (!draggedRow) return;

    // The list runs down on a wide screen and across on a narrow one.
    const rect = targetRow.getBoundingClientRect();
    const vertical = window.matchMedia?.('(min-width: 768px)').matches ?? true;
    const after = vertical
        ? event.clientY > rect.top + rect.height / 2
        : event.clientX > rect.left + rect.width / 2;
    if (after) targetRow.after(draggedRow);
    else targetRow.before(draggedRow);
}

async function dropInput(event) {
    event.preventDefault();
    const eventId = getUrlParam('event');
    const inputIds = draggableInputRows().map((row) => row.dataset.inputId);
    const own = getInputs(eventId);
    // While an input is still being saved the list is not complete, so it cannot be ordered.
    if (
        inputIds.join('|') === own.map((input) => input.id).join('|') ||
        own.some((input) => input.pending)
    ) {
        renderKeyTable(eventId);
        return;
    }

    const snapshot = cloneConfig();
    const setOrder = (inputs) => {
        config.inputs = config.inputs.filter((l) => l.event !== eventId).concat(inputs);
    };
    setOrder(
        inputIds.map((id, index) => ({
            ...config.inputs.find((l) => l.id === id),
            order: String(index + 1),
        })),
    );
    renderInputViews();

    showLoading();
    try {
        const newInputs = processResponse(
            await api('reorderInputs', { event: eventId, ids: inputIds }),
        );
        if (newInputs !== null) setOrder(newInputs);
        else restoreConfig(snapshot);
        renderInputViews();
    } finally {
        hideLoading();
    }
}

function dragInputEnd(event) {
    event.currentTarget.classList.remove('opacity-50');
    draggedInputId = null;
}
