// Tips for a touch screen. A computer shows a `title` when the pointer rests on it; a phone
// never does. So on a screen with no hover, tapping a badge, an "i" or a link name that has a
// `title` shows the same words in a small bubble, until the next tap, a scroll or a few seconds.
// Anything that does something when pressed (data-action, a link, a form control) is left alone:
// its tap must do its job.

const SHOW_FOR_MS = 6000;
const GAP = 8;
const EDGE = 8;

let bubble: HTMLElement | null = null;
let owner: Element | null = null;
let timer: number | undefined;

// The element a tap landed on that has a tip and does nothing else.
export function tipOwner(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element)) return null;
    const elem = target.closest<HTMLElement>('[title]');
    if (!elem?.getAttribute('title')) return null;
    if (elem.closest('[data-action], a[href], label, input, select, textarea')) return null;
    return elem;
}

function hideTip() {
    window.clearTimeout(timer);
    bubble?.remove();
    bubble = null;
    owner = null;
}

function showTip(elem: HTMLElement) {
    hideTip();
    const text = elem.getAttribute('title') ?? '';
    bubble = document.createElement('div');
    bubble.className = 'tap-tip';
    bubble.setAttribute('role', 'status');
    bubble.textContent = text;
    // Inside the open dialog if there is one, or it would sit behind the dialog's backdrop.
    (elem.closest('dialog[open]') ?? document.body).append(bubble);
    owner = elem;

    const rect = elem.getBoundingClientRect();
    const width = bubble.offsetWidth;
    const height = bubble.offsetHeight;
    const centred = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(EDGE, Math.min(centred, window.innerWidth - width - EDGE));
    const above = rect.top - height - GAP;
    const top = above >= EDGE ? above : rect.bottom + GAP;
    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    timer = window.setTimeout(hideTip, SHOW_FOR_MS);
}

export function initTips() {
    // A computer with a mouse already shows the title on hover.
    if (!window.matchMedia('(hover: none)').matches) return;
    document.addEventListener('click', (event) => {
        const elem = tipOwner(event.target);
        if (!elem) return hideTip();
        // A second tap on the same thing puts the tip away.
        if (elem === owner) return hideTip();
        showTip(elem);
    });
    document.addEventListener('scroll', hideTip, { capture: true, passive: true });
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') hideTip();
    });
}
