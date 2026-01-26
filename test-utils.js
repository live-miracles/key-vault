function getRandomWaitTime() {
    return parseInt((1 + Math.random()) * 1000);
}

function getUserEmailMock() {
    return {
        success: true,
        data: testEmail1,
    };
}

function getAllDetailsMock() {
    return {
        success: true,
        data: {
            events: structuredClone(testEvents), // important to return copy
            keys: structuredClone(testKeys),
            roles: structuredClone(testRoles),
        },
    };
}

function addQuestionMock(q) {
    if (!q) {
        return {
            success: false,
            error: 'Invalid parameters',
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
        type: 'primary',
        language: 'english',
        server: 'rtmp://a.rtmp.youtube.com/live2/',
        key: 'abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
    {
        row: 2,
        id: 'KEY02',
        event: 'EVT01',
        name: 'Channel 2',
        type: 'primary',
        language: 'german',
        server: 'rtmps://live-api-s.facebook.com:443/rtmp/',
        key: 'FB-abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
    {
        row: 3,
        id: 'KEY03',
        event: 'EVT01',
        name: 'Channel 1',
        type: 'backup',
        language: 'english',
        server: 'rtmp://b.rtmp.youtube.com/live2?backup=1/',
        key: 'abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
    {
        row: 4,
        id: 'KEY04',
        event: 'EVT02',
        name: 'Channel 3',
        type: 'backup',
        language: 'english',
        server: 'rtmp://b.rtmp.youtube.com/live2?backup=1/',
        key: 'abc-123-abc-123-abc-123',
        color: '',
        remarks: '',
    },
];

const testRoles = [
    {
        id: 'ROLE01',
        event: 'EVT000001',
        email: testEmail1,
        type: 'admin',
        language: '*',
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
        getAllDetails: () => {
            setTimeout(() => f(getAllDetailsMock()), getRandomWaitTime());
        },
        deleteQuestion: (id) => {
            setTimeout(() => f(deleteQuestionMock(id)), getRandomWaitTime());
        },
    }),
});
