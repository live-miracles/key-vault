import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');

function createDocumentStub() {
    return {
        addEventListener() {},
        querySelectorAll() {
            return [];
        },
    };
}

export function loadFrontendScripts(files) {
    const context = {
        console,
        document: createDocumentStub(),
        navigator: {},
        setTimeout,
        structuredClone,
        URL,
        URLSearchParams,
        window: {
            history: {
                pushState(_state, _title, url) {
                    context.window.location = new URL(url, context.window.location.href);
                },
            },
            location: new URL('https://example.test/app?event=E01'),
        },
    };
    context.globalThis = context;

    vm.createContext(context);

    for (const file of files) {
        const source = fs.readFileSync(path.join(root, file), 'utf8');
        vm.runInContext(source, context, { filename: file });
    }

    return {
        context,
        get(name) {
            return vm.runInContext(name, context);
        },
        set(name, value) {
            context[name] = value;
        },
    };
}
