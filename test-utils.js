function getRandomWaitTime() {
    return parseInt((1 + Math.random()) * 1000);
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
            testKeys.filter((k) => hasKeyAccess(eventRoles, ACTIONS.VIEW, k.event, k.language)),
        ),
        roles: structuredClone(
            testRoles.filter((r) => hasRoleAccess(eventRoles, ACTIONS.VIEW, r.event, r.type)),
        ),
        languages: structuredClone(testLanguages),
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
    event.id = String(Date.now());
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

    etagMock += 1;
    role.id = String(Date.now());
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

function addLanguageMock(language) {
    if (!language) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    if (!/^(0[1-9]|[1-9][0-9])$/.test(language.id)) {
        return {
            success: false,
            error: 'Language id must be between 01 and 99',
        };
    }

    if (testLanguages.length >= 99) {
        return {
            success: false,
            error: 'Cannot add more than 99 languages',
        };
    }

    if (testLanguages.some((l) => l.id === language.id)) {
        return {
            success: false,
            error: 'Language already exists: ' + language.id,
        };
    }

    etagMock += 1;
    language.order = String(Math.max(...testLanguages.map((l) => Number(l.order) || 0), 0) + 1);
    testLanguages.push(language);
    language.row = testLanguages.length + 1;

    return { success: true, data: language };
}

function editLanguageMock(language) {
    if (!language || !language.id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    const old = testLanguages.find((l) => l.id === language.id);
    if (!old) {
        return {
            success: false,
            error: 'Language not found: ' + language.id,
        };
    }

    if (!/^(0[1-9]|[1-9][0-9])$/.test(language.id)) {
        return {
            success: false,
            error: 'Language id must be between 01 and 99',
        };
    }

    etagMock += 1;
    old.name = language.name;

    return { success: true, data: old };
}

function reorderLanguagesMock(languageIds) {
    if (!Array.isArray(languageIds)) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    const currentIds = new Set(testLanguages.map((language) => language.id));
    const newIds = new Set(languageIds);
    if (
        languageIds.length !== testLanguages.length ||
        newIds.size !== currentIds.size ||
        languageIds.some((id) => !currentIds.has(id))
    ) {
        return {
            success: false,
            error: 'Language list mismatch',
        };
    }

    etagMock += 1;
    languageIds.forEach((id, index) => {
        const language = testLanguages.find((l) => l.id === id);
        language.order = String(index + 1);
    });

    return { success: true, data: structuredClone(testLanguages) };
}

function deleteLanguageMock(id) {
    if (!id) {
        return {
            success: false,
            error: 'Invalid parameters',
        };
    }

    const language = testLanguages.find((l) => l.id === id);
    if (!language) {
        return {
            success: false,
            error: 'Language not found: ' + id,
        };
    }

    if (
        testKeys.some((key) => key.language === id) ||
        testRoles.some((role) => role.language === id)
    ) {
        return {
            success: false,
            error: 'Language is in use: ' + id,
        };
    }

    etagMock += 1;
    testLanguages.splice(
        testLanguages.findIndex((l) => l.id === id),
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

    etagMock += 1;
    key.id = String(Date.now());
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

    const old = testKeys.find((k) => k.id === key.id);
    if (!old) {
        return {
            success: false,
            error: 'Key not found: ' + key.id,
        };
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
        id: 'EVT01',
        name: 'Event 1',
        status: '',
    },
    {
        id: 'EVT02',
        name: 'Event 2',
        status: 'locked',
    },
    {
        id: 'EVT03',
        name: 'Event 3',
        status: '',
    },
];

const testRoles = [
    {
        id: 'ROLE01',
        event: 'EVT01',
        email: testEmail1,
        type: ROLES.ADMIN,
        language: '*',
    },
    {
        id: 'ROLE02',
        event: '*',
        email: testEmail2,
        type: ROLES.OWNER,
        language: '*',
    },
    {
        id: 'ROLE03',
        event: 'EVT02',
        email: testEmail3,
        type: ROLES.VIEWER,
        language: '01',
    },
    {
        id: 'ROLE04',
        event: 'EVT02',
        email: testEmail1,
        type: ROLES.EDITOR,
        language: '02',
    },
    {
        id: 'ROLE05',
        event: 'EVT01',
        email: testEmail3,
        type: ROLES.VIEWER,
        language: '09',
    },
];

const testLanguages = [
    {
        id: '01',
        name: 'English',
        order: '1',
    },
    {
        id: '02',
        name: 'German',
        order: '2',
    },
    {
        id: '03',
        name: 'Hindi',
        order: '3',
    },
];

const testKeys = [
    {
        row: 1,
        id: 'KEY01',
        event: 'EVT01',
        name: 'Channel 1',
        language: '01',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        server2: 'yb',
        key2: 'abc-123-abc-123-abc-456',
        color: '',
        link: '',
        remarks: 'Some random information about the key',
    },
    {
        row: 2,
        id: 'KEY02',
        event: 'EVT01',
        name: 'Very Long Platform Name Channel Demo',
        language: '02',
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
        id: 'KEY03',
        event: 'EVT01',
        name: 'Channel 3',
        language: '01',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        server2: 'yb',
        key2: 'abc-123-abc-123-abc',
        color: '6',
        link: '',
        remarks: '',
    },
    {
        row: 4,
        id: 'KEY04',
        event: 'EVT02',
        name: 'Channel 4',
        language: '01',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        server2: 'yb',
        key2: 'abc-123-abc-123-ab',
        color: '',
        link: '',
        remarks: '',
    },
    {
        row: 5,
        id: 'KEY05',
        event: 'EVT01',
        name: 'Channel 5',
        language: '01',
        server: 'rtmp://123:123:123:123/live/',
        key: 'abc-123-abc-123-abc-123',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: '',
    },
    {
        row: 6,
        id: 'KEY06',
        event: 'EVT02',
        name: 'Channel 6',
        language: '02',
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
        id: 'KEY07',
        event: 'EVT01',
        name: 'Missing Language Demo',
        language: '09',
        server: 'yt',
        key: 'abc-123-abc-123-missing',
        server2: '',
        key2: '',
        color: '',
        link: '',
        remarks: '',
    },
];

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
        addEvent: (data) => {
            setTimeout(() => f(addEventMock(data)), getRandomWaitTime());
        },
        editEvent: (event) => {
            setTimeout(() => f(editEventMock(event)), getRandomWaitTime());
        },
        lockEvent: (event) => {
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
        addLanguage: (language) => {
            setTimeout(() => f(addLanguageMock(language)), getRandomWaitTime());
        },
        editLanguage: (language) => {
            setTimeout(() => f(editLanguageMock(language)), getRandomWaitTime());
        },
        reorderLanguages: (languageIds) => {
            setTimeout(() => f(reorderLanguagesMock(languageIds)), getRandomWaitTime());
        },
        deleteLanguage: (id) => {
            setTimeout(() => f(deleteLanguageMock(id)), getRandomWaitTime());
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
