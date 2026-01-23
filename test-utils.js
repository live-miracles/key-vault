function getRandomWaitTime() {
    return parseInt((2 + Math.random()) * 1000);
}

function getEventsMock() {
    return {
        success: true,
        data: structuredClone(testEvents), // important to return copy
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

function updateQuestionStatusMock(newQ) {
    for (let i = 0; i < testQuestions.length; i++) {
        const q = testQuestions[i];
        if (q.timestamp !== newQ.timestamp) {
            continue;
        }
        q.status = newQ.status;
        return { success: true };
    }

    return { success: false, error: 'Question not found.' };
}

function updateSelectedQuestionMock(timestamp) {
    testQuestions[0].text = timestamp;
    return { success: true };
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

const testEvents = [
    {
        id: 'EVT00001',
        name: 'Event 1',
    },
    {
        id: 'EVT00002',
        name: 'Event 2',
    },
    {
        id: 'EVT00003',
        name: 'Event 3',
    },
];

const googleMock = {};
googleMock.script = {};
googleMock.script.run = {};
googleMock.script.run.withFailureHandler = (_) => ({
    withSuccessHandler: (f) => ({
        getEvents: () => {
            setTimeout(() => f(getEventsMock()), getRandomWaitTime());
        },
        addQuestion: (q) => {
            setTimeout(() => f(addQuestionMock(q)), getRandomWaitTime());
        },
        updateQuestion: (q) => {
            setTimeout(() => f(updateQuestionMock(q)), getRandomWaitTime());
        },
        deleteQuestion: (id) => {
            setTimeout(() => f(deleteQuestionMock(id)), getRandomWaitTime());
        },
    }),
});
