import concurrently from 'concurrently';
import { execa } from 'execa';

await execa('npm', ['run', 'css'], { stdio: 'inherit' });

const { result } = concurrently(
    [
        {
            name: 'css',
            command: 'tailwindcss -i ./frontend/input.css -o ./frontend/output.css --watch',
        },
        {
            name: 'build',
            command: 'node build-tools/watch-build.mjs pages',
        },
        {
            name: 'server',
            command:
                'browser-sync start --server ./site --files "site/*" --port 3000 --no-open --no-notify',
        },
    ],
    {
        killOthersOn: ['failure', 'success'],
        prefix: 'name',
    },
);

await result;
