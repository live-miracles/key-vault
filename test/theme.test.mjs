import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
    THEME_KEY,
    otherTheme,
    parseTheme,
    readSavedTheme,
    saveTheme,
} from '../frontend/src/theme.ts';

test('the theme is dark unless a person has picked light', () => {
    assert.equal(parseTheme(undefined), 'dark');
    assert.equal(parseTheme(null), 'dark');
    assert.equal(parseTheme('banana'), 'dark');
    assert.equal(parseTheme('dark'), 'dark');
    assert.equal(parseTheme('light'), 'light');
    assert.equal(otherTheme('dark'), 'light');
    assert.equal(otherTheme('light'), 'dark');
});

test('the last choice is remembered', () => {
    const data = new Map();
    const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    assert.equal(readSavedTheme(storage), 'dark');
    saveTheme(storage, 'light');
    assert.equal(data.get(THEME_KEY), 'light');
    assert.equal(readSavedTheme(storage), 'light');
    saveTheme(storage, 'dark');
    assert.equal(readSavedTheme(storage), 'dark');
});

test('blocked or missing storage never breaks the page', () => {
    const blocked = {
        getItem() {
            throw new Error('blocked');
        },
        setItem() {
            throw new Error('blocked');
        },
    };
    assert.equal(readSavedTheme(blocked), 'dark');
    assert.equal(readSavedTheme(undefined), 'dark');
    assert.doesNotThrow(() => saveTheme(blocked, 'light'));
    assert.doesNotThrow(() => saveTheme(undefined, 'light'));
});

test('the script in the page head reads the same key the app saves', () => {
    const html = readFileSync(new URL('../frontend/index.html', import.meta.url), 'utf8');
    assert.ok(html.includes(`localStorage.getItem('${THEME_KEY}') === 'light'`));
});
