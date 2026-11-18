import assert from 'node:assert/strict';
import test from 'node:test';

import { describeBunryu, formatWhen, listInstances } from '../frontend/src/format.ts';
import { escapeHtml, safeUrl } from '../frontend/src/html.ts';
import { newTempId } from '../frontend/src/store.ts';

test('escapes HTML-sensitive characters', () => {
    assert.equal(
        escapeHtml(`<button title="x">Tom & 'Jerry'</button>`),
        '&lt;button title=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/button&gt;',
    );
    assert.equal(escapeHtml(null), '');
});

test('keeps only safe HTTP and HTTPS URLs', () => {
    const base = 'https://example.test/app';
    assert.equal(safeUrl('https://example.test/path', base), 'https://example.test/path');
    assert.equal(safeUrl('/relative', base), 'https://example.test/relative');
    assert.equal(safeUrl('javascript:alert(1)', base), '');
    assert.equal(safeUrl('data:text/html,x', base), '');
    assert.equal(safeUrl('', base), '');
});

test('makes a different stand-in id each time, never an empty one', () => {
    const first = newTempId();
    const second = newTempId();
    assert.ok(first.startsWith('new-') && first.length > 8);
    assert.notEqual(first, second);
});

test('describes whether bunryu is connected or when it was last seen', () => {
    const now = Date.parse('2026-11-15T12:00:00Z');
    const ago = (ms) => new Date(now - ms).toISOString();

    assert.equal(describeBunryu(undefined, now).state, 'unknown');
    assert.equal(describeBunryu({ online: true, instances: [] }, now).text, 'bunryu connected');
    assert.equal(
        describeBunryu({ online: false, instances: [] }, now).text,
        'bunryu not connected',
    );

    const offline = (...ms) => ({
        online: false,
        instances: ms.map((m, i) => ({ instance: `i${i}`, lastSeenAt: ago(m), online: false })),
    });
    assert.equal(describeBunryu(offline(30000), now).text, 'bunryu last seen just now');
    assert.equal(describeBunryu(offline(5 * 60000), now).text, 'bunryu last seen 5 min ago');
    assert.equal(describeBunryu(offline(3 * 3600000), now).text, 'bunryu last seen 3 h ago');
    assert.equal(describeBunryu(offline(2 * 86400000), now).text, 'bunryu last seen 2 d ago');
    // With several instances, the most recent report counts.
    assert.equal(
        describeBunryu(offline(2 * 86400000, 10 * 60000), now).text,
        'bunryu last seen 10 min ago',
    );
});

test('formats when something happened, with the year only when it is not this one', () => {
    const now = Date.parse('2026-11-18T12:00:00');

    assert.equal(formatWhen('', now), '');
    assert.equal(formatWhen('not a time', now), '');
    assert.match(formatWhen('2026-11-17T15:42:00', now), /17/);
    assert.doesNotMatch(formatWhen('2026-11-17T15:42:00', now), /2026/);
    assert.match(formatWhen('2025-03-02T09:05:00', now), /2025/);
});

test('counts the connected bunryu and lists them, connected ones first', () => {
    const now = Date.parse('2026-11-15T12:00:00Z');
    const at = (ms) => new Date(now - ms).toISOString();
    const report = {
        online: true,
        instances: [
            { instance: 'Old', lastSeenAt: at(2 * 3600000), online: false },
            { instance: 'Standby', lastSeenAt: at(90000), online: true },
            { instance: 'Main', lastSeenAt: at(20000), online: true },
        ],
    };
    assert.equal(describeBunryu(report, now).text, '2 bunryu connected');
    assert.equal(
        describeBunryu({ ...report, instances: report.instances.slice(0, 2) }, now).text,
        'bunryu connected',
    );
    assert.deepEqual(listInstances(report, now), [
        { name: 'Main', online: true, seen: 'just now' },
        { name: 'Standby', online: true, seen: '1 min ago' },
        { name: 'Old', online: false, seen: '2 h ago' },
    ]);
    assert.deepEqual(listInstances(undefined, now), []);
});
