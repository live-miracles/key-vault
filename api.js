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

// ===== Events =====
async function addEvent(data) {
    return withTry('addEvent', data);
}

async function editEvent(updated) {
    return withTry('editEvent', updated);
}

async function deleteEvent(id) {
    return withTry('deleteEvent', id);
}

// ===== Keys =====
async function addKey(data) {
    return withTry('addKey', data);
}

async function editKey(updated) {
    return withTry('editKey', updated);
}

async function deleteKey(id) {
    return withTry('deleteKey', id);
}

// ===== Roles =====
async function addRole(data) {
    return withTry('addRole', data);
}

async function editRole(updated) {
    return withTry('editRole', updated);
}

async function deleteRole(id) {
    return withTry('deleteRole', id);
}
