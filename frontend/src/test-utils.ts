// @ts-nocheck

function getRandomWaitTime() {
    return parseInt((1 + Math.random()) * 1000);
}

// The real backend makes random ids; the mock does the same.
function newMockId() {
    return globalThis.crypto?.randomUUID?.() ?? 'mock-' + Math.random().toString(36).slice(2);
}

function normalizeInputIdMock(id, allowAll = false) {
    const inputId = String(id ?? '').trim();
    return allowAll && inputId === '*' ? '*' : inputId;
}

function getAllDataMock(etag) {
    const serverEtag = String(etagMock);
    if (etag === serverEtag) {
        return {
            success: true,
            data: {
                etag: serverEtag,
            },
        };
    }

    const userEmail = testEmail2;
    const eventRoles = getEventRoles(userEmail, testEvents, testRoles);

    const data = {
        etag: serverEtag,
        userEmail: userEmail,
        size: '0',
        events: structuredClone(
            testEvents.filter((e) => hasEventAccess(eventRoles, ACTIONS.VIEW, e.id)),
        ), // important to return copy
        keys: structuredClone(
            testKeys.filter((k) => hasKeyAccess(eventRoles, ACTIONS.VIEW, k.event, k.input)),
        ),
        roles: structuredClone(
            testRoles.filter((r) => hasRoleAccess(eventRoles, ACTIONS.VIEW, r.event, r.type)),
        ),
        inputs: structuredClone(testInputs),
    };
    data.size = JSON.stringify(data).length;

    return { success: true, data: data };
}

function addEventMock(event) {
    if (!event) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    etagMock += 1;
    event.id = newMockId();
    testEvents.push(event);
    event.row = testEvents.length + 1;

    return { success: true, data: event };
}

function editEventMock(event) {
    if (!event || !event.id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    const old = testEvents.find((e) => e.id === event.id);
    if (!old) {
        return {
            success: false,
            error: 'Event not found: ' + event.id,
        };
    }

    etagMock += 1;
    Object.assign(old, event);

    return { success: true, data: old };
}

function deleteEventMock(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    const event = testEvents.find((e) => e.id === id);
    if (!event) {
        return {
            success: false,
            error: 'Event not found: ' + id,
        };
    }

    etagMock += 1;
    testEvents.splice(
        testEvents.findIndex((e) => e.id === id),
        1,
    );

    return { success: true, data: true };
}

function addRoleMock(role) {
    if (!role) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }
    role.input = normalizeInputIdMock(role.input, true);

    etagMock += 1;
    role.id = newMockId();
    testRoles.push(role);
    role.row = testRoles.length + 1;

    return { success: true, data: role };
}

function editRoleMock(role) {
    if (!role || !role.id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }
    role.input = normalizeInputIdMock(role.input, true);

    const old = testRoles.find((r) => r.id === role.id);
    if (!old) {
        return {
            success: false,
            error: 'Role not found: ' + role.id,
        };
    }

    etagMock += 1;
    Object.assign(old, role);

    return { success: true, data: old };
}

function deleteRoleMock(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    const role = testRoles.find((r) => r.id === id);
    if (!role) {
        return {
            success: false,
            error: 'Role not found: ' + id,
        };
    }

    etagMock += 1;
    testRoles.splice(
        testRoles.findIndex((r) => r.id === id),
        1,
    );

    return { success: true, data: true };
}

function addInputMock(input) {
    if (!input || !String(input.name ?? '').trim()) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }
    input = { id: newMockId(), name: String(input.name).trim() };

    etagMock += 1;
    input.order = String(Math.max(...testInputs.map((l) => Number(l.order) || 0), 0) + 1);
    testInputs.push(input);
    input.row = testInputs.length + 1;

    return { success: true, data: input };
}

function editInputMock(input) {
    if (!input || !input.id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }
    input.id = normalizeInputIdMock(input.id);

    const old = testInputs.find((l) => l.id === input.id);
    if (!old) {
        return {
            success: false,
            error: 'Input not found: ' + input.id,
        };
    }

    etagMock += 1;
    old.name = input.name;

    return { success: true, data: old };
}

function reorderInputsMock(inputIds) {
    if (!Array.isArray(inputIds)) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    inputIds = inputIds.map((id) => normalizeInputIdMock(id));
    const currentIds = new Set(testInputs.map((input) => input.id));
    const newIds = new Set(inputIds);
    if (
        inputIds.length !== testInputs.length ||
        newIds.size !== currentIds.size ||
        inputIds.some((id) => !currentIds.has(id))
    ) {
        return {
            success: false,
            error: 'Input list mismatch',
        };
    }

    etagMock += 1;
    inputIds.forEach((id, index) => {
        const input = testInputs.find((l) => l.id === id);
        input.order = String(index + 1);
    });

    return { success: true, data: structuredClone(testInputs) };
}

function deleteInputMock(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    id = normalizeInputIdMock(id);
    const input = testInputs.find((l) => l.id === id);
    if (!input) {
        return {
            success: false,
            error: 'Input not found: ' + id,
        };
    }

    if (testKeys.some((key) => key.input === id) || testRoles.some((role) => role.input === id)) {
        return {
            success: false,
            error: 'Input is in use: ' + id,
        };
    }

    etagMock += 1;
    testInputs.splice(
        testInputs.findIndex((l) => l.id === id),
        1,
    );

    return { success: true, data: true };
}

function addKeyMock(key) {
    if (!key) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }
    key.input = normalizeInputIdMock(key.input);

    etagMock += 1;
    key.id = newMockId();
    testKeys.push(key);
    key.row = testKeys.length + 1;

    return { success: true, data: key };
}

function editKeyMock(key) {
    if (!key || !key.id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }
    key.input = normalizeInputIdMock(key.input);

    const old = testKeys.find((k) => k.id === key.id);
    if (!old) {
        return {
            success: false,
            error: 'Key not found: ' + key.id,
        };
    }

    if (hasStreamingConfigChanged(old, key)) {
        key.color = KEY_COLORS.NONE;
    }

    etagMock += 1;
    Object.assign(old, key);

    return { success: true, data: old };
}

function deleteKeyMock(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    const key = testKeys.find((k) => k.id === id);
    if (!key) {
        return {
            success: false,
            error: 'Key not found: ' + id,
        };
    }

    etagMock += 1;
    testKeys.splice(
        testKeys.findIndex((k) => k.id === id),
        1,
    );

    return { success: true, data: true };
}

function editQuestionMock(newQ) {
    for (let i = 0; i < testQuestions.length; i++) {
        const q = testQuestions[i];
        if (q.timestamp !== newQ.timestamp) {
            continue;
        }
        if (newQ.text === '') {
            return {
                success: false,
                error: "Invalid data: the question text can't be empty.",
            };
        }
        Object.assign(q, newQ);
        return { success: true };
    }

    return { success: false, error: 'Question not found.' };
}

function deleteQuestionMock(timestamp) {
    const index = testQuestions.findIndex((q) => q.timestamp === timestamp);
    if (index !== -1 || console.assert(false)) {
        testQuestions.splice(index, 1);
    } else {
        return { success: false, error: 'Question not found.' };
    }
    return { success: true };
}

const testEmail1 = 'test1@mail.com';
const testEmail2 = 'test2@mail.com';
const testEmail3 = 'test3@mail.com';

const testEvents = [
    {
        id: 'E1',
        name: 'Event 1',
    },
    {
        id: 'E2',
        name: 'Event 2',
    },
    {
        id: 'E3',
        name: 'Event 3',
    },
];

const testRoles = [
    {
        id: 'R1',
        event: 'E1',
        email: testEmail1,
        type: ROLES.ADMIN,
        input: '*',
    },
    {
        id: 'R2',
        event: '*',
        email: testEmail2,
        type: ROLES.OWNER,
        input: '*',
    },
    {
        id: 'R3',
        event: 'E2',
        email: testEmail3,
        type: ROLES.VIEWER,
        input: 'L1',
    },
    {
        id: 'R4',
        event: 'E2',
        email: testEmail1,
        type: ROLES.EDITOR,
        input: 'L2',
    },
    {
        id: 'R5',
        event: 'E1',
        email: testEmail3,
        type: ROLES.VIEWER,
        input: 'L9',
    },
];

const testInputs = [
    {
        id: 'L1',
        name: 'English',
        order: '1',
    },
    {
        id: 'L2',
        name: 'German',
        order: '2',
    },
    {
        id: 'L3',
        name: 'Hindi',
        order: '3',
    },
];

const testKeys = [
    {
        row: 1,
        id: 'K1',
        event: 'E1',
        name: 'Channel 1',
        input: 'L1',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: 'Some random information about the key',
    },
    {
        row: 2,
        id: 'K2',
        event: 'E1',
        name: 'Very Long Platform Name Channel Demo',
        input: 'L2',
        server: 'fb',
        key: 'FB-abc-123-abc-123-abc-123',
        server2: 'fb',
        key2: 'B-abc-123-abc-123-abc-123',
        color: '',
        link: 'https://youtube.com/live/abc123abc123',
        remarks: '',
    },
    {
        row: 3,
        id: 'K3',
        event: 'E1',
        name: 'Channel 3',
        input: 'L1',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        server2: '',
        key2: '',
        color: '6',
        link: '',
        remarks: '',
    },
    {
        row: 4,
        id: 'K4',
        event: 'E2',
        name: 'Channel 4',
        input: 'L1',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: '',
    },
    {
        row: 5,
        id: 'K5',
        event: 'E1',
        name: 'Channel 5',
        input: 'L1',
        server: 'rtmp',
        key: 'rtmp://123.123.123.123/live/abc-123-abc-123-abc-123',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: '',
    },
    {
        row: 6,
        id: 'K6',
        event: 'E2',
        name: 'Channel 6',
        input: 'L2',
        server: 'yt',
        key: 'abc-123-abc-123-abc-456',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: '',
    },
    {
        row: 7,
        id: 'K7',
        event: 'E1',
        name: 'Missing Input Demo',
        input: 'L9',
        server: 'yt',
        key: 'abc-123-abc-123-missing',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: '',
    },
    {
        row: 8,
        id: 'K8',
        event: 'E1',
        name: 'Instagram Demo',
        input: 'L3',
        server: 'ig',
        key: 'IG-abc-123-abc-123?s_prp=demo',
        server2: '',
        key2: '',
        color: '',
        link: 'https://instagram.com/',
        remarks: '',
    },
    {
        row: 9,
        id: 'K9',
        event: 'E1',
        name: 'Custom SRT Demo',
        input: 'L3',
        server: 'srt',
        key: 'srt://stream.example.com:10000?mode=caller&latency=240000&passphrase=demo-passphrase&pbkeylen=16&streamid=%23%21%3A%3Ar%3Dlive%2Fdemo%2Cm%3Dpublish',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: '',
    },
];

// Sample statuses so the demo shows every color the real site can.
function getStatusMock() {
    const status = (state, extra = {}) => ({
        status: state,
        message: '',
        failures: 0,
        stoppedAfterFailures: false,
        sinceMs: Date.now() - 600000,
        pipeline: 'Demo pipeline',
        output: 'Demo output',
        inputMismatch: false,
        ...extra,
    });
    return {
        success: true,
        data: {
            online: true,
            instances: [{ instance: 'demo', lastSeenAt: new Date().toISOString(), online: true }],
            keys: {
                K1: { main: status('running'), backup: null },
                K2: {
                    main: status('error', {
                        message: 'Connection refused by the destination.',
                        failures: 5,
                        stoppedAfterFailures: true,
                    }),
                    backup: null,
                },
                K3: {
                    main: status('warning', {
                        message: 'Output is falling behind live.',
                    }),
                    backup: null,
                },
                // Runs in a pipeline of another name than its input: put in the wrong place.
                K4: {
                    main: status('stopped', { pipeline: 'Tamil', inputMismatch: true }),
                    backup: null,
                },
            },
            inputs: {
                L1: {
                    status: 'running',
                    message: '',
                    sinceMs: Date.now() - 3600000,
                    pipeline: 'English',
                },
                L2: {
                    status: 'error',
                    message: 'No signal',
                    sinceMs: Date.now() - 120000,
                    pipeline: 'German',
                },
                L3: {
                    status: 'warning',
                    message: 'Low bitrate',
                    sinceMs: Date.now() - 600000,
                    pipeline: 'Hindi',
                },
            },
        },
    };
}

const googleMock = {};
googleMock.script = {};
googleMock.script.run = {};
googleMock.script.run.withFailureHandler = (_) => ({
    withSuccessHandler: (f) => ({
        getUserEmail: () => {
            setTimeout(() => f(getUserEmailMock()), getRandomWaitTime());
        },
        getAllData: (etag) => {
            setTimeout(() => f(getAllDataMock(etag)), getRandomWaitTime());
        },
        getStatus: () => {
            setTimeout(() => f(getStatusMock()), getRandomWaitTime());
        },
        addEvent: (data) => {
            setTimeout(() => f(addEventMock(data)), getRandomWaitTime());
        },
        editEvent: (event) => {
            setTimeout(() => f(editEventMock(event)), getRandomWaitTime());
        },
        deleteEvent: (id) => {
            setTimeout(() => f(deleteEventMock(id)), getRandomWaitTime());
        },
        addRole: (role) => {
            setTimeout(() => f(addRoleMock(role)), getRandomWaitTime());
        },
        editRole: (role) => {
            setTimeout(() => f(editRoleMock(role)), getRandomWaitTime());
        },
        deleteRole: (id) => {
            setTimeout(() => f(deleteRoleMock(id)), getRandomWaitTime());
        },
        addInput: (input) => {
            setTimeout(() => f(addInputMock(input)), getRandomWaitTime());
        },
        editInput: (input) => {
            setTimeout(() => f(editInputMock(input)), getRandomWaitTime());
        },
        reorderInputs: (inputIds) => {
            setTimeout(() => f(reorderInputsMock(inputIds)), getRandomWaitTime());
        },
        deleteInput: (id) => {
            setTimeout(() => f(deleteInputMock(id)), getRandomWaitTime());
        },
        addKey: (key) => {
            setTimeout(() => f(addKeyMock(key)), getRandomWaitTime());
        },
        editKey: (key) => {
            setTimeout(() => f(editKeyMock(key)), getRandomWaitTime());
        },
        deleteKey: (id) => {
            setTimeout(() => f(deleteKeyMock(id)), getRandomWaitTime());
        },
        deleteQuestion: (id) => {
            setTimeout(() => f(deleteQuestionMock(id)), getRandomWaitTime());
        },
    }),
});

let etagMock = 1;
