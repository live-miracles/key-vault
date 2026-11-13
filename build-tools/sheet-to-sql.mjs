// One-off migration of the Google Sheet into Postgres.
//
//   1. In the spreadsheet use File > Download > CSV for each tab: Event, Role, Language, Key.
//      Put the four files in one folder, named Event.csv, Role.csv, Language.csv, Key.csv.
//   2. node build-tools/sheet-to-sql.mjs <folder> > .migration/data.sql
//   3. Review it, then run it against the project (SQL editor, or psql with the
//      session pooler connection string) after `supabase db push`.
//
// The output holds real stream keys. It is written outside git (.migration/ is ignored);
// delete it once the data is loaded.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const source = text.replace(/^﻿/, '');
    for (let i = 0; i < source.length; i += 1) {
        const c = source[i];
        if (quoted) {
            if (c === '"' && source[i + 1] === '"') {
                cell += '"';
                i += 1;
            } else if (c === '"') {
                quoted = false;
            } else {
                cell += c;
            }
        } else if (c === '"') {
            quoted = true;
        } else if (c === ',') {
            row.push(cell);
            cell = '';
        } else if (c === '\n' || c === '\r') {
            if (c === '\r' && source[i + 1] === '\n') i += 1;
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
        } else {
            cell += c;
        }
    }
    if (cell !== '' || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }
    return rows;
}

// Header row -> objects. A row with an empty id is a deleted row (the app clears them).
function table(csv, name) {
    const [headers, ...rows] = parseCsv(csv);
    if (!headers) throw new Error(`${name}.csv is empty.`);
    const trimmed = headers.map((h) => h.trim());
    return rows
        .map((r) => Object.fromEntries(trimmed.map((h, i) => [h, (r[i] ?? '').trim()])))
        .filter((r) => r.id);
}

const literal = (value) => `'${String(value).replaceAll("'", "''")}'`;

function normalizeLanguage(value, allowAll) {
    const id = String(value).trim();
    if (allowAll && id === '*') return id;
    if (/^[1-9][0-9]*$/.test(id)) return `L${id}`;
    const m = id.match(/^(?:L|lang)([1-9][0-9]*)$/i);
    return m ? `L${m[1]}` : id;
}

const sequenceOf = (rows, letter) =>
    Math.max(
        0,
        ...rows
            .map((r) => (r.id.match(new RegExp(`^${letter}([1-9][0-9]*)$`)) ?? [])[1] ?? 0)
            .map(Number),
    );

export function convert({ Event, Role, Language, Key }, { skipOrphans = false } = {}) {
    const events = table(Event, 'Event').filter((e) => e.name);
    const languages = table(Language, 'Language');
    const roles = table(Role, 'Role');
    const keys = table(Key, 'Key');
    const problems = [];
    const warnings = [];

    const seen = (rows, label) => {
        const ids = new Set();
        for (const r of rows) {
            if (ids.has(r.id)) problems.push(`${label}: duplicate id ${r.id}`);
            ids.add(r.id);
        }
    };
    seen(events, 'Event');
    seen(languages, 'Language');
    seen(roles, 'Role');
    seen(keys, 'Key');

    const eventIds = new Set(events.map((e) => e.id));
    const languageIds = new Set();
    for (const l of languages) {
        l.id = normalizeLanguage(l.id, false);
        if (!/^L[1-9][0-9]*$/.test(l.id)) problems.push(`Language: invalid id ${l.id}`);
        languageIds.add(l.id);
    }

    const keptRoles = [];
    for (const r of roles) {
        if (!eventIds.has(r.event)) {
            const message = `Role ${r.id} (${r.email}) refers to unknown event "${r.event}"`;
            (skipOrphans ? warnings : problems).push(message);
            continue;
        }
        if (!['0', '1', '2', '3'].includes(r.type))
            problems.push(`Role ${r.id}: invalid type "${r.type}"`);
        const language =
            r.type === '2' || r.type === '3' ? '*' : normalizeLanguage(r.language, true);
        if (language !== '*' && !languageIds.has(language)) {
            problems.push(`Role ${r.id}: unknown language "${r.language}"`);
        }
        keptRoles.push({ ...r, language, email: r.email.toLowerCase() });
    }

    const keptKeys = [];
    for (const k of keys) {
        if (!eventIds.has(k.event)) {
            const message = `Key ${k.id} (${k.name}) refers to unknown event "${k.event}"`;
            (skipOrphans ? warnings : problems).push(message);
            continue;
        }
        const language = normalizeLanguage(k.language, false);
        if (!languageIds.has(language))
            problems.push(`Key ${k.id}: unknown language "${k.language}"`);
        if (!k.name || !k.server || !k.key)
            problems.push(`Key ${k.id}: name, server and key are required`);
        const color = ['', '1', '3', '6'].includes(k.color) ? k.color : '';
        keptKeys.push({ ...k, language, color });
    }

    if (problems.length > 0) {
        throw new Error(`The sheet cannot be migrated as it is:\n- ${problems.join('\n- ')}`);
    }

    const lines = ['begin;'];
    for (const e of events) {
        lines.push(
            `insert into public.events (id, name) values (${literal(e.id)}, ${literal(e.name)});`,
        );
    }
    languages.forEach((l, index) => {
        const order = Number(l.order) || index + 1;
        lines.push(
            `insert into public.languages (id, name, sort_order) values (${literal(l.id)}, ${literal(l.name)}, ${order});`,
        );
    });
    for (const r of keptRoles) {
        lines.push(
            `insert into public.roles (id, event_id, email, type, language) values (${[r.id, r.event, r.email, r.type, r.language].map(literal).join(', ')});`,
        );
    }
    for (const k of keptKeys) {
        lines.push(
            `insert into public.keys (id, event_id, name, language, server, key, server2, key2, link, color_override, remarks) values (${[
                k.id,
                k.event,
                k.name,
                k.language,
                k.server,
                k.key,
                k.server2 ?? '',
                k.key2 ?? '',
                k.link ?? '',
                k.color,
                k.remarks ?? '',
            ]
                .map(literal)
                .join(', ')});`,
        );
    }
    // The next generated ids continue after the migrated ones.
    for (const [sequence, rows, letter] of [
        ['event_id_seq', events, 'E'],
        ['role_id_seq', keptRoles, 'R'],
        ['key_id_seq', keptKeys, 'K'],
    ]) {
        const last = sequenceOf(rows, letter);
        lines.push(
            last > 0
                ? `select setval('public.${sequence}', ${last});`
                : `select setval('public.${sequence}', 1, false);`,
        );
    }
    lines.push('commit;');

    return {
        sql: lines.join('\n') + '\n',
        warnings,
        counts: {
            events: events.length,
            languages: languages.length,
            roles: keptRoles.length,
            keys: keptKeys.length,
        },
    };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const args = process.argv.slice(2);
    const skipOrphans = args.includes('--skip-orphans');
    const folder = args.find((a) => !a.startsWith('--'));
    if (!folder) {
        console.error(
            'Usage: node build-tools/sheet-to-sql.mjs <folder with the four CSV files> [--skip-orphans]',
        );
        process.exit(2);
    }
    const read = (name) => readFileSync(path.join(folder, `${name}.csv`), 'utf8');
    try {
        const { sql, warnings, counts } = convert(
            {
                Event: read('Event'),
                Role: read('Role'),
                Language: read('Language'),
                Key: read('Key'),
            },
            { skipOrphans },
        );
        for (const w of warnings) console.error(`skipped: ${w}`);
        console.error(
            `${counts.events} events, ${counts.languages} languages, ${counts.roles} roles, ${counts.keys} keys`,
        );
        process.stdout.write(sql);
    } catch (error) {
        console.error(error.message);
        process.exit(1);
    }
}
