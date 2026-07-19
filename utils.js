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

const ICON_PATHS = {
    check: '<path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" />',
    error: '<path d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /><circle cx="12" cy="12" r="9" />',
    settings:
        '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" />',
    pen: '<path d="M21.17 6.81a2 2 0 0 0-3.98-3.98L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.36a.5.5 0 0 0 .62.62L7 20.66a2 2 0 0 0 .83-.5Z" />',
    trash: '<path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6" /><path d="M14 11v6" />',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />',
    unlock: '<rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" />',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />',
    plus: '<path d="M12 5v14" /><path d="M5 12h14" />',
    grip: '<circle cx="9" cy="5" r="1" /><circle cx="9" cy="12" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="19" r="1" />',
    x: '<path d="M18 6 6 18" /><path d="m6 6 12 12" />',
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

function getUrlParam(param) {
    const url = new URL(window.location);
    return url.searchParams.get(param);
}
