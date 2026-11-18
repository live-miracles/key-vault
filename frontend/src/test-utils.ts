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
    if (!input || !input.event || !String(input.name ?? '').trim()) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }
    const name = String(input.name).trim();
    const own = testInputs.filter((l) => l.event === input.event);
    if (own.some((l) => l.name.trim().toLowerCase() === name.toLowerCase())) {
        return {
            success: false,
            error: `This event already has an input called "${name}".`,
        };
    }
    input = { id: newMockId(), event: input.event, name };

    etagMock += 1;
    input.order = String(Math.max(...own.map((l) => Number(l.order) || 0), 0) + 1);
    testInputs.push(input);

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
    const name = String(input.name ?? '').trim();
    const taken = testInputs.some(
        (l) =>
            l.event === old.event &&
            l.id !== old.id &&
            l.name.trim().toLowerCase() === name.toLowerCase(),
    );
    if (taken) {
        return {
            success: false,
            error: `This event already has an input called "${name}".`,
        };
    }

    etagMock += 1;
    old.name = name;

    return { success: true, data: old };
}

// `payload` is { event, ids }: the ids of that event's inputs, in their new order.
function reorderInputsMock(payload) {
    if (!payload || !payload.event || !Array.isArray(payload.ids)) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    const own = testInputs.filter((input) => input.event === payload.event);
    const inputIds = payload.ids.map((id) => normalizeInputIdMock(id));
    const currentIds = new Set(own.map((input) => input.id));
    const newIds = new Set(inputIds);
    if (
        inputIds.length !== own.length ||
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

    return {
        success: true,
        data: structuredClone(inputIds.map((id) => testInputs.find((l) => l.id === id))),
    };
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
            error: 'This input still has destinations or shared people. Remove them first, then delete the input.',
        };
    }

    etagMock += 1;
    testInputs.splice(
        testInputs.findIndex((l) => l.id === id),
        1,
    );

    return { success: true, data: true };
}

// The demo's signed-in user, as the server records it on a real add or edit.
function mockLastEdit(action) {
    return { updatedBy: testEmail2, updatedAction: action, updatedAt: new Date().toISOString() };
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
    Object.assign(key, mockLastEdit('added'));
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
    Object.assign(old, key, mockLastEdit('edited'));

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
        id: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'Event 1',
    },
    {
        id: '99b2736f-41f3-4e57-8074-fdb87cb01463',
        name: 'Event 2',
    },
    {
        id: '75d6090e-ff3a-4516-9c0b-2c4e68719a64',
        name: 'Event 3',
    },
];

const testRoles = [
    {
        id: 'de6fd494-e7b0-4d15-8c5d-1623c3125b13',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        email: testEmail1,
        type: ROLES.ADMIN,
        input: '*',
    },
    {
        id: '73c121da-17cc-4b89-a651-ea71824dd48e',
        event: '*',
        email: testEmail2,
        type: ROLES.OWNER,
        input: '*',
    },
    {
        id: '1507f82d-6a35-4f7c-a9a9-6e638b116b67',
        event: '99b2736f-41f3-4e57-8074-fdb87cb01463',
        email: testEmail3,
        type: ROLES.VIEWER,
        input: '57d84efd-e87c-4554-9d7b-8f8446a90519',
    },
    {
        id: '4b472b8f-0bf5-4357-ae38-058a9c4d1eba',
        event: '99b2736f-41f3-4e57-8074-fdb87cb01463',
        email: testEmail1,
        type: ROLES.EDITOR,
        input: '9da3b8ce-7393-4bda-8447-9efc006b917f',
    },
];

// Each event has its own inputs, in its own order.
const testInputs = [
    {
        id: '544f7c08-2631-42b4-8ba7-0fb286f8051f',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'English',
        order: '1',
    },
    {
        id: '83d83dc9-3846-417c-b15c-6486dd154488',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'German',
        order: '2',
    },
    {
        id: 'ccc11d97-0871-4e22-a96b-e433ed0e4177',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'Hindi',
        order: '3',
    },
    {
        id: '57d84efd-e87c-4554-9d7b-8f8446a90519',
        event: '99b2736f-41f3-4e57-8074-fdb87cb01463',
        name: 'English',
        order: '1',
    },
    {
        id: '9da3b8ce-7393-4bda-8447-9efc006b917f',
        event: '99b2736f-41f3-4e57-8074-fdb87cb01463',
        name: 'German',
        order: '2',
    },
];

const testKeys = [
    {
        row: 1,
        id: 'e09de1b9-4aee-47f9-b9e1-d319b8e4e4bc',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'Channel 1',
        input: '544f7c08-2631-42b4-8ba7-0fb286f8051f',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: 'Some random information about the key',
        updatedBy: testEmail1,
        updatedAction: 'edited',
        updatedAt: new Date(Date.now() - 26 * 3600000).toISOString(),
    },
    {
        row: 2,
        id: '45f53112-cccb-4d3c-865f-9192bc5abd60',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'Very Long Platform Name Channel Demo',
        input: '83d83dc9-3846-417c-b15c-6486dd154488',
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
        id: '300ba1c7-3597-4cde-832a-14e885ca829c',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'Channel 3',
        input: '544f7c08-2631-42b4-8ba7-0fb286f8051f',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        server2: '',
        key2: '',
        color: '6',
        link: '',
        remarks: '',
        updatedBy: testEmail2,
        updatedAction: 'added',
        updatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    },
    {
        row: 4,
        id: 'fb8b9138-76da-4022-8987-e4c99e7e4e8b',
        event: '99b2736f-41f3-4e57-8074-fdb87cb01463',
        name: 'Channel 4',
        input: '57d84efd-e87c-4554-9d7b-8f8446a90519',
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
        id: '354e9d2b-f773-488c-8139-62c8cd5bb2e6',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'Channel 5',
        input: '544f7c08-2631-42b4-8ba7-0fb286f8051f',
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
        id: '1d9be01b-6cb1-4bf8-95e3-656673af1d8c',
        event: '99b2736f-41f3-4e57-8074-fdb87cb01463',
        name: 'Channel 6',
        input: '9da3b8ce-7393-4bda-8447-9efc006b917f',
        server: 'yt',
        key: 'abc-123-abc-123-abc-456',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: '',
    },
    {
        row: 8,
        id: '65caf455-9f34-45a9-8240-b3818a5a4880',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'Instagram Demo',
        input: 'ccc11d97-0871-4e22-a96b-e433ed0e4177',
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
        id: '22384057-2994-4f93-90c7-14fb311127cc',
        event: '3797ce47-a7be-453f-9c15-9afefcdfcfc3',
        name: 'Custom SRT Demo',
        input: 'ccc11d97-0871-4e22-a96b-e433ed0e4177',
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
                'e09de1b9-4aee-47f9-b9e1-d319b8e4e4bc': { main: status('running'), backup: null },
                '45f53112-cccb-4d3c-865f-9192bc5abd60': {
                    main: status('error', {
                        message: 'Connection refused by the destination.',
                        failures: 5,
                        stoppedAfterFailures: true,
                    }),
                    backup: null,
                },
                '300ba1c7-3597-4cde-832a-14e885ca829c': {
                    main: status('warning', {
                        message: 'Output is falling behind live.',
                    }),
                    backup: null,
                },
                // Runs in a pipeline of another name than its input: put in the wrong place.
                'fb8b9138-76da-4022-8987-e4c99e7e4e8b': {
                    main: status('stopped', { pipeline: 'Tamil', inputMismatch: true }),
                    backup: null,
                },
            },
            inputs: {
                '544f7c08-2631-42b4-8ba7-0fb286f8051f': {
                    status: 'running',
                    message: '',
                    sinceMs: Date.now() - 3600000,
                    pipeline: 'English',
                },
                '83d83dc9-3846-417c-b15c-6486dd154488': {
                    status: 'error',
                    message: 'No signal',
                    sinceMs: Date.now() - 120000,
                    pipeline: 'German',
                },
                'ccc11d97-0871-4e22-a96b-e433ed0e4177': {
                    status: 'warning',
                    message: 'Low bitrate',
                    sinceMs: Date.now() - 600000,
                    pipeline: 'Hindi',
                },
                '57d84efd-e87c-4554-9d7b-8f8446a90519': {
                    status: 'running',
                    message: '',
                    sinceMs: Date.now() - 3600000,
                    pipeline: 'English',
                },
                '9da3b8ce-7393-4bda-8447-9efc006b917f': {
                    status: 'running',
                    message: '',
                    sinceMs: Date.now() - 3600000,
                    pipeline: 'German',
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
        reorderInputs: (payload) => {
            setTimeout(() => f(reorderInputsMock(payload)), getRandomWaitTime());
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
