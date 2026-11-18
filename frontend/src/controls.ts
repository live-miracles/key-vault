// The refresh, bunryu and account controls (#app-controls), and where they sit.

import { app } from './app.ts';
import { $ } from './dom.ts';

// The account menu: who is signed in, and Sign out. It opens upward from the bottom bar, or
// downward from the top bar on a phone, and closes on any click elsewhere or on Escape.
function isProfileMenuOpen(): boolean {
    return document.getElementById('profile-menu')?.classList.contains('open') ?? false;
}

export function setProfileMenu(open: boolean) {
    document.getElementById('profile-menu')?.classList.toggle('open', open);
    document.getElementById('profile-btn')?.setAttribute('aria-expanded', String(open));
}

export function toggleProfileMenu() {
    setProfileMenu(!isProfileMenuOpen());
}

// On a computer the refresh, bunryu and account controls sit in the bottom bar, where there is
// room. On a phone that bar holds the event tabs, so they move to a slim bar at the top.
function placeAppControls() {
    const phone = window.matchMedia('(max-width: 640px)').matches;
    const slot = document.getElementById(phone ? 'top-bar' : 'controls-slot');
    const controls = document.getElementById('app-controls');
    if (slot && controls && controls.parentElement !== slot) slot.append(controls);
    setProfileMenu(false);
}

export function initControls() {
    placeAppControls();
    window.matchMedia('(max-width: 640px)').addEventListener('change', placeAppControls);
    document.addEventListener('click', (event) => {
        if (!(event.target instanceof Element) || !event.target.closest('#profile-wrap')) {
            setProfileMenu(false);
        }
    });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setProfileMenu(false);
    });
}

export async function refreshDataBtn() {
    const button = $<HTMLButtonElement>('#refresh-data-btn');
    const cards = $('#key-cards');
    button.disabled = true;
    cards.classList.add('key-rows-refreshing');
    cards.setAttribute('aria-busy', 'true');
    try {
        await Promise.all([app.refresh(), app.refreshStatus()]);
    } finally {
        cards.classList.remove('key-rows-refreshing');
        cards.removeAttribute('aria-busy');
        button.disabled = false;
    }
}
