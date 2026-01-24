async function withTry(functionName, ...params) {
    try {
        const res = await new Promise((resolve, reject) =>
            window.google.script.run
                .withFailureHandler(reject)
                .withSuccessHandler(resolve)
                [functionName](...params),
        );
        if (res.success === false) {
            return { success: false, error: functionName + ': ' + res.error };
        }
        return { success: true, data: res.data };
    } catch (error) {
        return { success: false, error: functionName + ': ' + error };
    }
}

async function getUserEmail() {
    return withTry('getUserEmail');
}

async function getAllDetails() {
    return withTry('getAllDetails');
}

async function editEvent(updated) {
    return withTry('getKeys', updated);
}

async function deleteEvent(id) {
    return withTry('getKeys', id);
}

async function getKeys() {
    return withTry('getKeys');
}
