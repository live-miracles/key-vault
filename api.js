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

async function getAllData() {
    return withTry('getAllData');
}

// ===== Events =====
async function addEvent(event) {
    return withTry('addEvent', event);
}

async function editEvent(event) {
    return withTry('editEvent', event);
}

async function deleteEvent(id) {
    return withTry('deleteEvent', id);
}

// ===== Roles =====
async function addRole(role) {
    return withTry('addRole', role);
}

async function editRole(role) {
    return withTry('editRole', role);
}

async function deleteRole(id) {
    return withTry('deleteRole', id);
}

// ===== Keys =====
async function addKey(key) {
    return withTry('addKey', key);
}

async function editKey(key) {
    return withTry('editKey', key);
}

async function deleteKey(id) {
    return withTry('deleteKey', id);
}
