function renderTabBar(selected = null) {
    const tabsElem = document.querySelector('.tabs');
    tabsElem.innerHTML = events
        .map(
            (e) => `
        <a role="tab" class="tab ${selected === e.id ? 'tab-active' : ''}"
          onclick="selectEvent('${e.id}')">${e.name}</a>`,
        )
        .join('');
}

function selectEvent(id) {
    renderTabBar(id);

    const event = events.find((e) => e.id === id);
    if (!event) {
        document.querySelector('.table').classList.add('hidden');
    }
    document.querySelector('.table').classList.remove('hidden');
    console.log(event);
}

let events = [];
let roles = [];
let keys = [];

(async () => {
    if (typeof google === 'undefined') {
        window.google = googleMock;
    }

    let res = await getEvents();

    if (res.success === true) {
        events = res.data;
    } else {
        showErrorAlert(res.error);
        events = [];
    }

    // roles = getRoles();
    // keys = getKeys();

    if (events.length > 0) {
        selectEvent(events[0].id);
    }
})();
