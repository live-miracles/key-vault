import { watch } from 'node:fs';
import { execa } from 'execa';

const buildScript = process.argv[2] || 'build';
let running = false;
let pending = false;
let timer;

async function build() {
    if (running) {
        pending = true;
        return;
    }

    running = true;
    try {
        await execa('npm', ['run', buildScript], { stdio: 'inherit' });
    } catch (error) {
        console.error(`[build] failed: ${error.shortMessage || error.message}`);
    } finally {
        running = false;
        if (pending) {
            pending = false;
            await build();
        }
    }
}

function scheduleBuild() {
    clearTimeout(timer);
    timer = setTimeout(() => void build(), 100);
}

await build();
for (const directory of ['frontend/src', 'frontend']) {
    watch(directory, { persistent: true }, (_event, filename) => {
        if (
            filename &&
            (filename.endsWith('.ts') || filename === 'index.html' || filename === 'output.css')
        ) {
            scheduleBuild();
        }
    });
}

console.log('[build] watching frontend TypeScript and shell files');
await new Promise(() => {});
