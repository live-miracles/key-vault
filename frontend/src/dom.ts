// Small helpers for the parts of the page every screen uses: finding elements, the alerts,
// the "Saving" badge, asking before deleting, and the clipboard.

import { escapeHtml, iconSvg } from './html.ts';

export function $<T extends HTMLElement = HTMLElement>(selector: string): T {
    return document.querySelector(selector) as T;
}

export function $$<T extends HTMLElement = HTMLElement>(selector: string): T[] {
    return [...document.querySelectorAll(selector)] as T[];
}

// Swaps each <span data-icon="name"> for its inline icon.
export function hydrateIcons() {
    for (const elem of $$('[data-icon]')) {
        const attrs = elem.dataset.lockIcon
            ? `data-lock-icon="${escapeHtml(elem.dataset.lockIcon)}"`
            : '';
        elem.outerHTML = iconSvg(elem.dataset.icon ?? '', elem.className, attrs);
    }
}

let alertCount = 0;
export function showErrorAlert(error: string, log = true) {
    const elem = document.getElementById('error-alert');
    if (!elem) return;
    elem.classList.remove('hidden');
    (elem.querySelector('.msg') as HTMLElement).innerText = error;
    if (log) console.error(error);
    const alertId = ++alertCount;
    setTimeout(() => {
        if (alertId !== alertCount) return;
        elem.classList.add('hidden');
    }, 5000);
}

export function setSaving(saving: boolean) {
    const badge = document.getElementById('saving-badge') as HTMLInputElement | null;
    if (badge) badge.checked = saving;
}

// Asks in the page, not with the browser's confirm(): some browsers, such as the one inside the
// Claude app, never show that popup and answer "no" at once, so Delete would do nothing.
// Resolves true only when the person picks the red button.
export function confirmAction(message: string, confirmLabel = 'Delete'): Promise<boolean> {
    const dialog = $<HTMLDialogElement>('#confirm-modal');
    $('#confirm-modal-text').textContent = message;
    $('#confirm-modal-ok').textContent = confirmLabel;
    return new Promise((resolve) => {
        dialog.returnValue = '';
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), {
            once: true,
        });
        dialog.showModal();
    });
}

function legacyCopy(text: string): boolean {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    // Prevent scrolling to bottom
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let success = false;
    try {
        success = document.execCommand('copy');
    } catch (err) {
        console.error('Legacy copy failed', err);
    }
    document.body.removeChild(textarea);
    return success;
}

async function copyText(text: string): Promise<boolean> {
    if (navigator.clipboard) {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            console.warn('Clipboard API failed, falling back', err);
        }
    }
    return legacyCopy(text);
}

// Copies and says "Copied".
export async function copyTextValue(text: string | undefined) {
    if (!text || !(await copyText(text))) return;
    const notification = document.getElementById('copied-notification');
    if (!notification) return;
    notification.classList.remove('hidden');
    setTimeout(() => notification.classList.add('hidden'), 2000);
}
