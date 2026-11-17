import assert from 'node:assert/strict';
import test from 'node:test';

import { convert, parseCsv } from '../build-tools/sheet-to-sql.mjs';

const files = (overrides = {}) => ({
    Event: 'id,name\nE1,Event one\nE3,"Event, three"\n,\n',
    Language: 'id,name,order\n1,English,1\nL2,Hindi,2\n',
    Role: [
        'id,event,email,type,language,remarks',
        'R1,E1,Admin@Example.test,2,*,',
        'R2,E1,editor@example.test,1,1,',
        ',,,,,',
    ].join('\n'),
    Key: [
        'id,event,name,language,server,key,server2,key2,link,color,remarks',
        "K1,E1,Main,1,yt,abcd-1234,,,,3,it's fine",
        'K7,E3,Other,L2,rtmp,rtmp://x.example/live/k,,,,9,',
    ].join('\n'),
    ...overrides,
});

test('parseCsv handles quotes, commas, newlines and a BOM', () => {
    assert.deepEqual(parseCsv('﻿a,b\r\n"x, ""y""","line\nbreak"\n'), [
        ['a', 'b'],
        ['x, "y"', 'line\nbreak'],
    ]);
});

test('convert normalises ids, inputs and colors and keeps ids', () => {
    const { sql, counts, warnings } = convert(files());

    assert.deepEqual(counts, { events: 2, inputs: 2, roles: 2, keys: 2 });
    assert.deepEqual(warnings, []);
    assert.match(sql, /insert into public\.events \(id, name\) values \('E3', 'Event, three'\)/);
    // The sheet's Language tab becomes the inputs table.
    assert.match(
        sql,
        /insert into public\.inputs \(id, name, sort_order\) values \('L1', 'English', 1\)/,
    );
    assert.match(sql, /insert into public\.roles \(id, event_id, email, type, input\)/);
    assert.match(sql, /insert into public\.keys \(id, event_id, name, input, server,/);
    // Admin roles apply to every language and emails are lowercased.
    assert.match(sql, /values \('R1', 'E1', 'admin@example\.test', '2', '\*'\)/);
    // A bare language number becomes an id.
    assert.match(sql, /values \('R2', 'E1', 'editor@example\.test', '1', 'L1'\)/);
    // Quotes are escaped, and an unknown color is dropped.
    assert.match(sql, /'it''s fine'/);
    assert.match(sql, /'rtmp:\/\/x\.example\/live\/k', '', '', '', '', ''\)/);
    // New rows get random ids from the database, so nothing sets a sequence.
    assert.doesNotMatch(sql, /setval/);
    assert.ok(sql.startsWith('begin;') && sql.trimEnd().endsWith('commit;'));
});

test('convert refuses data that would not load, and lists every problem', () => {
    assert.throws(
        () =>
            convert(
                files({
                    Role: 'id,event,email,type,language\nR1,*,a@example.test,3,*\nR2,E1,b@example.test,1,9\n',
                    Key: 'id,event,name,language,server,key\nK1,E1,A,1,yt,k\nK1,E1,B,1,yt,k\nK2,E1,C,L8,yt,k\n',
                }),
            ),
        (error) =>
            /unknown event "\*"/.test(error.message) &&
            /unknown language "9"/.test(error.message) &&
            /duplicate id K1/.test(error.message) &&
            /Key K2: unknown language "L8"/.test(error.message),
    );
});

test('--skip-orphans drops rows of a missing event and says so', () => {
    const { counts, warnings, sql } = convert(
        files({ Role: 'id,event,email,type,language\nR1,*,a@example.test,3,*\n' }),
        { skipOrphans: true },
    );
    assert.equal(counts.roles, 0);
    assert.equal(warnings.length, 1);
    assert.doesNotMatch(sql, /insert into public\.roles/);
});
