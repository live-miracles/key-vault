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
            name: 'server',
            command:
                'browser-sync start --server ./frontend --files "frontend/*.js,frontend/*.html,frontend/output.css" --port 3000 --no-open --no-notify',
        },
    ],
    {
        killOthersOn: ['failure', 'success'],
        prefix: 'name',
    },
);

await result;
