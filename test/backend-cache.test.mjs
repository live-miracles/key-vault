import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function loadBackend() {
    const context = {
        console,
        PropertiesService: {
            getScriptProperties() {
                return {
                    getProperty() {
                        return 'spreadsheet-id';
                    },
                };
            },
        },
        Utilities: {
            DigestAlgorithm: {
                MD5: 'MD5',
            },
            computeDigest(_algorithm, text) {
                return [...createHash('md5').update(text).digest()];
            },
        },
    };
    context.globalThis = context;

    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(root, 'Code.js'), 'utf8'), context, {
        filename: 'Code.js',
    });

    return {
        get(name) {
            return vm.runInContext(name, context);
        },
    };
}

function createSheet(values, name = 'Key') {
    return {
        getName() {
            return name;
        },
        getDataRange() {
            return {
                getValues() {
                    return values;
                },
            };
        },
    };
}

test('backend cache etag is stable for identical sheet payloads', () => {
    const runtime = loadBackend();
    const delimiter = runtime.get('CACHE_CELL_DELIMITER');
    const getContentEtag = runtime.get('getContentEtag');
    const payload = {
        events: [`id${delimiter}name`, `E1${delimiter}Main`],
        roles: [['id', 'event', 'email', 'type', 'language', 'remarks'].join(delimiter)],
        keys: [
            [
                'id',
                'event',
                'name',
                'language',
                'server',
                'key',
                'server2',
                'key2',
                'link',
                'color',
                'remarks',
            ].join(delimiter),
        ],
        languages: [`id${delimiter}name${delimiter}order`, `L1${delimiter}English${delimiter}1`],
    };

    assert.equal(getContentEtag(payload), getContentEtag({ ...payload }));
    assert.notEqual(
        getContentEtag(payload),
        getContentEtag({
            ...payload,
            languages: [`id${delimiter}name${delimiter}order`, `L2${delimiter}German${delimiter}1`],
        }),
    );
});

test('backend cache writer rejects reserved delimiter characters', () => {
    const runtime = loadBackend();
    const delimiter = runtime.get('CACHE_CELL_DELIMITER');
    const sheetToCacheStrings = runtime.get('sheetToCacheStrings');
    const sheet = createSheet([
        ['id', 'name'],
        ['E1', `Main ${delimiter} Event`],
    ]);

    assert.throws(
        () => sheetToCacheStrings(sheet),
        /Reserved delimiter found in Key row 2, column 2/,
    );
});

test('backend cache parser keeps missing cells blank instead of undefined', () => {
    const runtime = loadBackend();
    const delimiter = runtime.get('CACHE_CELL_DELIMITER');
    const sheetStringsToObjects = runtime.get('sheetStringsToObjects');

    const rows = sheetStringsToObjects([
        `id${delimiter}name${delimiter}remarks`,
        `K1${delimiter}Main`,
    ]);

    assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
        { row: 2, id: 'K1', name: 'Main', remarks: '' },
    ]);
});
