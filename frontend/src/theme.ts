// Dark or light: dark until a person picks light, and then the last pick is remembered in this
// browser (localStorage). The theme is the data-theme attribute on <html>; input.css reads it.
//
// The small script in index.html's <head> does the same read before the first paint, so a saved
// light choice never flashes dark first. Keep its key and values in step with this file.

export type Theme = 'dark' | 'light';

export const THEME_KEY = 'key-vault-theme';
const THEME_COLORS: Record<Theme, string> = { dark: '#010102', light: '#f4f5f7' };

// Anything but "light" is dark: a missing, old or mangled value falls back to the default.
export function parseTheme(value: unknown): Theme {
    return value === 'light' ? 'light' : 'dark';
}

export function otherTheme(theme: Theme): Theme {
    return theme === 'light' ? 'dark' : 'light';
}

// Storage can be missing or throw (private windows, blocked site data): the page still works,
// it just forgets.
export function readSavedTheme(storage: Pick<Storage, 'getItem'> | undefined): Theme {
    try {
        return parseTheme(storage?.getItem(THEME_KEY));
    } catch {
        return 'dark';
    }
}

export function saveTheme(storage: Pick<Storage, 'setItem'> | undefined, theme: Theme) {
    try {
        storage?.setItem(THEME_KEY, theme);
    } catch {
        // Not remembered; nothing else to do.
    }
}

function browserStorage(): Storage | undefined {
    try {
        return window.localStorage;
    } catch {
        return undefined;
    }
}

export function currentTheme(): Theme {
    return parseTheme(document.documentElement.dataset.theme);
}

// Puts the theme on the page: the attribute, the browser bar color, and the button's words.
export function applyTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', THEME_COLORS[theme]);
    const button = document.getElementById('theme-btn');
    if (button) {
        const label = theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
        button.title = label;
        button.setAttribute('aria-label', label);
    }
}

export function initTheme() {
    applyTheme(readSavedTheme(browserStorage()));
}

export function toggleTheme() {
    const next = otherTheme(currentTheme());
    applyTheme(next);
    saveTheme(browserStorage(), next);
}
