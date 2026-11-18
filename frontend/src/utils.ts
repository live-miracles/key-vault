// @ts-nocheck

// "3 min ago", "2 h ago", "5 d ago".
function formatAgo(ms) {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
}

// "18 Nov, 3:42 pm", with the year only when it is not this one. '' for a time that is not one.
function formatWhen(iso, nowMs = Date.now()) {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return '';
    const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
    return date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
        hour: 'numeric',
        minute: '2-digit',
    });
}

// What the header says about bunryu. bunryu only runs during events, so being offline is
// normal: the text is informational, never a warning.
function describeBunryu(report, nowMs = Date.now()) {
    if (!report) return { state: 'unknown', text: '', title: '' };
    if (report.online) {
        return {
            state: 'online',
            text: 'bunryu connected',
            title: 'bunryu is reporting stream status',
        };
    }
    const lastSeen = (report.instances || [])
        .map((i) => new Date(i.lastSeenAt).getTime())
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => b - a)[0];
    if (lastSeen === undefined) {
        return {
            state: 'never',
            text: 'bunryu not connected',
            title: 'bunryu has not reported yet',
        };
    }
    return {
        state: 'offline',
        text: `bunryu last seen ${formatAgo(nowMs - lastSeen)}`,
        title: `Last report: ${new Date(lastSeen).toLocaleString()}`,
    };
}

function capitalize(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function getShortText(str, len) {
    return str.length > len ? str.slice(0, len / 2) + ' … ' + str.slice(-len / 2) : str;
}

function getMiddleEllipsisText(value, maxLength, startLength, endLength) {
    const text = String(value ?? '');
    if (text.length <= maxLength) return text;
    return text.slice(0, startLength) + ' ... ' + text.slice(-endLength);
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

// A stand-in id for a row that is saved but not yet answered by the server, which makes the
// real one. It only has to differ from every other id on the page.
function newTempId() {
    const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    return 'new-' + random;
}

const ICON_PATHS = {
    check: '<path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />',
    error: '<path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /><circle cx="12" cy="12" r="9" />',
    settings:
        '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />',
    pen: '<path d="M21.17 6.81a2 2 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.36a.5.5 0 0 0 .62.62L7 20.66a2 2 0 0 0 .83-.5Z" />',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />',
    trash: '<path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6" /><path d="M14 11v6" />',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
    refresh:
        '<path d="M3 12a9 9 0 0 1 15.5-6.3L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16" /><path d="M3 21v-5h5" />',
    plus: '<path d="M12 5v14" /><path d="M5 12h14" />',
    grip: '<circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />',
    home: '<path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" />',
    x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
    search: '<circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" />',
    'eye-off':
        '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" />',
};

function iconSvg(name, className = 'h-4 w-4', attrs = '') {
    return `<svg ${attrs} xmlns="http://www.w3.org/2000/svg" class="${escapeHtml(className)} stroke-current" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
}

function hydrateIcons() {
    document.querySelectorAll('[data-icon]').forEach((elem) => {
        const attrs = elem.dataset.lockIcon
            ? `data-lock-icon="${escapeHtml(elem.dataset.lockIcon)}"`
            : '';
        elem.outerHTML = iconSvg(elem.dataset.icon, elem.className, attrs);
    });
}

document.addEventListener('DOMContentLoaded', hydrateIcons);

// Asks in the page, not with the browser's confirm(): some browsers, such as the one inside the
// Claude app, never show that popup and answer "no" at once, so Delete would do nothing.
// Resolves true only when the person picks the red button.
function confirmAction(message, confirmLabel = 'Delete') {
    const dialog = document.querySelector('#confirm-modal');
    document.querySelector('#confirm-modal-text').textContent = message;
    document.querySelector('#confirm-modal-ok').textContent = confirmLabel;
    return new Promise((resolve) => {
        dialog.returnValue = '';
        dialog.addEventListener('close', () => resolve(dialog.returnValue === 'yes'), {
            once: true,
        });
        dialog.showModal();
    });
}

function safeUrl(value) {
    const text = String(value ?? '').trim();
    if (text === '') return '';

    try {
        const url = new URL(text, window.location.href);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch (_) {
        return '';
    }
}

function isValidUrl(str) {
    // YouTube backup URL is a little funny
    const text = str.replaceAll(
        'rtmp://b.rtmp.youtube.com/live2?backup=1',
        'rtmp://a.rtmp.youtube.com/live2',
    );

    const pattern = new RegExp(
        '^([a-zA-Z]+:\\/\\/)?' + // protocol
            '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
            '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR IP (v4) address
            '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*' + // port and path
            '(\\?[;&a-z\\d%_.~+=-]*)?' + // query string
            '(\\#[-a-z\\d_]*)?$', // fragment locator
        'i',
    );

    return pattern.test(text);
}

function legacyCopy(text) {
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

async function copyText(text) {
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

function setUrlParam(param, value) {
    const url = new URL(window.location);
    if (value === null) {
        url.searchParams.delete(param);
    } else {
        url.searchParams.set(param, value);
    }
    window.history.pushState({}, '', url);
}

// Several parameters in one history entry; null removes one.
function setUrlParams(params) {
    const url = new URL(window.location);
    for (const [param, value] of Object.entries(params)) {
        if (value === null) {
            url.searchParams.delete(param);
        } else {
            url.searchParams.set(param, value);
        }
    }
    window.history.pushState({}, '', url);
}

function getUrlParam(param) {
    const url = new URL(window.location);
    return url.searchParams.get(param);
}
