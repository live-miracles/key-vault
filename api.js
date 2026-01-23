async function getEvents() {
    try {
        const res = await new Promise((resolve, reject) => {
            window.google.script.run
                .withFailureHandler((error) => reject(error))
                .withSuccessHandler((data) => resolve(data))
                .getEvents();
        });
        if (res.success === false) {
            return { success: false, error: res.error };
        }
        return { success: true, data: res.data };
    } catch (error) {
        return { success: false, error: error };
    }
}

function selectEvent() {}

function editEventName() {}

function renderEvent(id) {}

function getRoles() {}

function getKeys() {}
