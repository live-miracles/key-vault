function getRandomWaitTime() {
    return parseInt((1 + Math.random()) * 1000);
}

function getUserEmailMock() {
    return {
        success: true,
        data: testEmail2,
    };
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

    return {
        success: true,
        data: {
            events: structuredClone(testEvents), // important to return copy
            keys: structuredClone(testKeys),
            roles: structuredClone(testRoles),
            etag: serverEtag,
        },
    };
}

function addEventMock(data) {
    if (!data) {
        return {
            success: false,
            error: 'Invalid parameters',
            etag: String(etagMock),
        };
    }

    q.status = 'none';
    q.timestamp = String(Date.now());
    testQuestions.push(q);

    return { success: true };
}

function updateQuestionMock(newQ) {
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
    },
    {
        id: 'EVT02',
        name: 'Event 2',
    },
    {
        id: 'EVT03',
        name: 'Event 3',
    },
];

const testKeys = [
    {
        row: 1,
        id: 'KEY01',
        event: 'EVT01',
        name: 'Channel 1',
        type: 'p',
        language: 'en',
        server: 'yt',
        key: 'abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
    {
        row: 2,
        id: 'KEY02',
        event: 'EVT01',
        name: 'Channel 2',
        type: 'p',
        language: 'de',
        server: 'fb',
        key: 'FB-abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
    {
        row: 3,
        id: 'KEY03',
        event: 'EVT01',
        name: 'Channel 1',
        type: 'b',
        language: 'en',
        server: 'yb',
        key: 'abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
    {
        row: 4,
        id: 'KEY04',
        event: 'EVT02',
        name: 'Channel 3',
        type: 'b',
        language: 'en',
        server: 'yb',
        key: 'abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
    {
        row: 5,
        id: 'KEY05',
        event: 'EVT01',
        name: 'Channel 1',
        type: 'p',
        language: 'en',
        server: 'rtmp://123:123:123:123/live/',
        key: 'abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
];

const testRoles = [
    {
        id: 'ROLE01',
        event: 'EVT01',
        email: testEmail1,
        type: ROLES.ADMIN,
        language: '*',
        remarks: '',
    },
    {
        id: 'ROLE02',
        event: '*',
        email: testEmail2,
        type: ROLES.ADMIN,
        language: '*',
        remarks: '',
    },
    {
        id: 'ROLE03',
        event: 'EVT02',
        email: testEmail3,
        type: ROLES.VIEWER,
        language: 'en',
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
        getAllData: () => {
            setTimeout(() => f(getAllDataMock()), getRandomWaitTime());
        },
        addEvent: (data) => {
            setTimeout(() => f(addEventMock(data)), getRandomWaitTime());
        },
        updateEvent: (updated) => {
            setTimeout(() => f(updateEventMock(updated)), getRandomWaitTime());
        },
        deleteEvent: (id) => {
            setTimeout(() => f(deleteEventMock(id)), getRandomWaitTime());
        },
        addRole: (data) => {
            setTimeout(() => f(addRoleMock(data)), getRandomWaitTime());
        },
        updateRole: (updated) => {
            setTimeout(() => f(updateRoleMock(updated)), getRandomWaitTime());
        },
        deleteRole: (id) => {
            setTimeout(() => f(deleteRoleMock(id)), getRandomWaitTime());
        },
        addKey: (data) => {
            setTimeout(() => f(addKeyMock(data)), getRandomWaitTime());
        },
        updateKey: (updated) => {
            setTimeout(() => f(updateKeyMock(updated)), getRandomWaitTime());
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
