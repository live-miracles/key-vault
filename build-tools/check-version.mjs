import fs from 'node:fs/promises';
import process from 'node:process';

const versionArg = process.argv[2] || process.env.GITHUB_REF_NAME || '';
const releaseVersion = versionArg.replace(/^refs\/tags\//, '').replace(/^v/, '');

if (!releaseVersion) {
    console.error('Usage: npm run version:check -- <version>');
    process.exit(1);
}

const pkg = JSON.parse(await fs.readFile('package.json', 'utf8'));

if (pkg.version !== releaseVersion) {
    console.error(
        `Version mismatch: package.json has ${pkg.version}, but release tag is ${releaseVersion}.`,
    );
    process.exit(1);
}

console.log(`package.json version matches release tag: ${releaseVersion}`);
