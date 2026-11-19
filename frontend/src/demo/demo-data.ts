// What the demo site starts with: a couple of events with inputs, people and destinations of
// every platform, and bunryu's report on them. The report is real in the one way that matters:
// each output's hash is made from the destination's address with the demo secret, exactly as
// bunryu would, so the server's own status code matches them to the destinations.

import { hashUrl } from '../../../supabase/functions/_shared/link-hash.ts';
import type { MemoryState } from '../../../supabase/functions/_shared/memory-store.ts';
import { backupUrl, mainUrl } from '../../../supabase/functions/_shared/platforms.ts';
import type { Status, StatusRow } from '../../../supabase/functions/_shared/status.ts';
import type {
    AdminRow,
    ChangeRow,
    KeyRow,
    RoleRow,
} from '../../../supabase/functions/_shared/types.ts';

export const DEMO_EMAIL = 'demo@example.org';
export const DEMO_HASH_SECRET = 'demo-hash-secret';
export const DEMO_SECRET = 'demo-secret-this-is-not-a-real-key-0123456789';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export async function buildDemoState(
    nowMs = Date.now(),
    uuid: () => string = () => crypto.randomUUID(),
): Promise<MemoryState> {
    const event = (name: string) => ({ id: uuid(), name });
    const winter = event('Winter Retreat');
    const spring = event('Spring Festival');

    const input = (eventId: string, name: string, position: number) => ({
        id: uuid(),
        event: eventId,
        name,
        position,
    });
    const english = input(winter.id, 'English', 1);
    const hindi = input(winter.id, 'Hindi', 2);
    const tamil = input(winter.id, 'Tamil', 3);
    const german = input(winter.id, 'German', 4);
    const springEnglish = input(spring.id, 'English', 1);
    const springHindi = input(spring.id, 'Hindi', 2);

    const role = (
        eventId: string,
        email: string,
        type: 'viewer' | 'editor',
        inputId: string | null = null,
    ) => ({ id: uuid(), event: eventId, email, type, input: inputId });

    const edited = (by: string, action: 'added' | 'edited', minutesAgo: number) => ({
        updatedBy: by,
        updatedAction: action,
        updatedAt: new Date(nowMs - minutesAgo * MINUTE).toISOString(),
    });
    const key = (
        eventId: string,
        inputId: string,
        name: string,
        platform: string,
        streamKey: string,
        extra: Partial<KeyRow> = {},
    ): KeyRow => ({
        id: uuid(),
        event: eventId,
        name,
        input: inputId,
        platform,
        streamKey,
        backupPlatform: '',
        backupStreamKey: '',
        link: '',
        remarks: '',
        ...edited('ann@example.org', 'added', 3 * 24 * 60),
        ...extra,
    });

    const keys: KeyRow[] = [
        key(winter.id, english.id, 'YouTube English', 'yt', 'abcd-1234-efgh-5678-ijkl', {
            link: 'https://www.youtube.com/watch?v=demo-english',
            remarks: 'Main public stream',
        }),
        key(winter.id, english.id, 'Facebook English', 'fb', 'FB-1234567890-0-AbCdEfGh', {
            backupPlatform: 'fb',
            backupStreamKey: 'FB-1234567890-1-ZyXwVuTs',
            link: 'https://www.facebook.com/example/live',
            ...edited('ravi@example.org', 'edited', 45),
        }),
        key(winter.id, english.id, 'Instagram English', 'ig', 'IG-77-1?s_prp=xyz789'),
        key(winter.id, hindi.id, 'YouTube Hindi', 'yt', 'hndi-aaaa-bbbb-cccc-dddd'),
        key(winter.id, hindi.id, 'VdoCipher Hindi', 'vc', 'hindi-stream-001', {
            remarks: 'Set up, waiting for the event',
        }),
        key(
            winter.id,
            hindi.id,
            'Channel 3 SRT Hindi',
            'srt',
            'srt://203.0.113.10:9000?mode=caller&latency=240000&passphrase=0123456789&pbkeylen=32&streamid=ch3',
            {
                remarks: 'New link, sent by the channel today',
                ...edited('ravi@example.org', 'edited', 5),
            },
        ),
        key(winter.id, tamil.id, 'YouTube Tamil', 'yt', 'tmil-aaaa-bbbb-cccc-dddd'),
        key(
            winter.id,
            german.id,
            'Partner Stream German',
            'rtmp',
            'rtmp://partner.example.net/live/german-77',
            {
                backupPlatform: 'rtmp',
                backupStreamKey: 'rtmp://partner-b.example.net/live/german-77',
            },
        ),
        key(spring.id, springEnglish.id, 'YouTube English', 'yt', 'sprg-eng1-aaaa-bbbb-cccc'),
        key(spring.id, springHindi.id, 'Facebook Hindi', 'fb', 'FB-99-0-QwErTy'),
    ];
    const byName = (eventId: string, name: string) => {
        const found = keys.find((k) => k.event === eventId && k.name === name);
        if (!found) throw new Error(`Demo destination missing: ${name}`);
        return found;
    };

    // One output of bunryu for an address, as bunryu reports it: by hash, never by address.
    const rows: StatusRow[] = [];
    const output = async (
        url: string,
        status: Status,
        pipeline: string,
        label: string,
        extra: Partial<StatusRow> = {},
    ) => {
        rows.push({
            instance: 'demo',
            hash: await hashUrl(DEMO_HASH_SECRET, url),
            pipeline,
            output: label,
            status,
            message: '',
            failures: 0,
            stoppedAfterFailures: false,
            sinceMs: nowMs - 95 * MINUTE,
            ...extra,
        });
    };

    const youtubeEnglish = byName(winter.id, 'YouTube English');
    await output(mainUrl(youtubeEnglish), 'running', 'English', 'YouTube');
    await output(backupUrl(youtubeEnglish), 'running', 'English', 'YouTube backup');

    const facebookEnglish = byName(winter.id, 'Facebook English');
    await output(mainUrl(facebookEnglish), 'warning', 'English', 'Facebook', {
        message: 'Output is falling behind live',
    });
    await output(backupUrl(facebookEnglish), 'running', 'English', 'Facebook backup');

    await output(mainUrl(byName(winter.id, 'Instagram English')), 'error', 'English', 'Instagram', {
        message: 'Server returned 403 Forbidden',
        failures: 5,
        stoppedAfterFailures: true,
    });

    await output(mainUrl(byName(winter.id, 'YouTube Hindi')), 'running', 'Hindi', 'YouTube', {
        sinceMs: nowMs - 12 * MINUTE,
    });
    await output(mainUrl(byName(winter.id, 'VdoCipher Hindi')), 'stopped', 'Hindi', 'VdoCipher');
    // "Channel 3 SRT Hindi" has no output: bunryu does not have this link yet.

    // The Tamil input has no signal, so its destination fails for a reason that is not the platform.
    await output(mainUrl(byName(winter.id, 'YouTube Tamil')), 'error', 'Tamil', 'YouTube', {
        message: 'Connection refused',
        failures: 3,
    });

    // This link runs in the English pipeline, though the destination is for German.
    const partner = byName(winter.id, 'Partner Stream German');
    await output(mainUrl(partner), 'running', 'English', 'Partner');
    await output(backupUrl(partner), 'stopped', 'English', 'Partner backup');

    await output(mainUrl(byName(spring.id, 'YouTube English')), 'running', 'English', 'YouTube', {
        sinceMs: nowMs - 30 * MINUTE,
    });

    const pipeline = (name: string, status: Status, message = '', minutesAgo = 100) => ({
        instance: 'demo',
        pipeline: name,
        status,
        message,
        sinceMs: nowMs - minutesAgo * MINUTE,
    });

    const roles = [
        role(winter.id, 'ravi@example.org', 'editor', hindi.id),
        role(winter.id, 'maya@example.org', 'editor', english.id),
        role(winter.id, 'partner@example.org', 'viewer'),
        role(spring.id, 'maya@example.org', 'editor'),
    ];
    const admins: AdminRow[] = [
        { id: uuid(), email: 'ann@example.org', addedBy: DEMO_EMAIL },
        { id: uuid(), email: 'producer@example.org', addedBy: DEMO_EMAIL },
    ];

    // The history of the last few days, so History has something to show. Each change is
    // consistent with the rows above: undoing them, newest first, gives the earlier versions
    // (the event had another name, a destination that is gone was still there, and so on).
    const ann = 'ann@example.org';
    const ravi = 'ravi@example.org';
    const youtubeGerman: KeyRow = {
        id: uuid(),
        event: winter.id,
        name: 'YouTube German old',
        input: german.id,
        platform: 'yt',
        streamKey: 'olde-aaaa-bbbb-cccc-dddd',
        backupPlatform: '',
        backupStreamKey: '',
        link: '',
        remarks: 'Replaced by the partner stream',
        ...edited(ann, 'added', 6 * 24 * 60),
    };
    const oldViewer: RoleRow = {
        id: uuid(),
        event: winter.id,
        email: 'old.vendor@example.org',
        type: 'viewer',
        input: null,
    };
    const facebook = byName(winter.id, 'Facebook English');
    const srt = byName(winter.id, 'Channel 3 SRT Hindi');
    type Entry = Pick<ChangeRow, 'by' | 'kind' | 'action' | 'before' | 'after' | 'rowId'> & {
        ago: number;
        event: string | null;
    };
    const entries: Entry[] = [
        {
            ago: 2 * DAY + 2 * HOUR,
            by: DEMO_EMAIL,
            event: null,
            kind: 'admin',
            action: 'added',
            rowId: admins[1].id,
            before: null,
            after: admins[1],
        },
        // "YouTube German old" was there before the history began, so it is in the start of
        // it and was deleted since.
        {
            ago: DAY + 6 * HOUR,
            by: ann,
            event: winter.id,
            kind: 'role',
            action: 'added',
            rowId: oldViewer.id,
            before: null,
            after: oldViewer,
        },
        {
            ago: DAY + 3 * HOUR,
            by: ann,
            event: winter.id,
            kind: 'event',
            action: 'edited',
            rowId: winter.id,
            before: { id: winter.id, name: 'Winter Retreat draft' },
            after: { ...winter },
        },
        {
            ago: 20 * HOUR,
            by: ann,
            event: winter.id,
            kind: 'role',
            action: 'added',
            rowId: roles[1].id,
            before: null,
            after: roles[1],
        },
        {
            ago: 3 * HOUR,
            by: ann,
            event: winter.id,
            kind: 'role',
            action: 'deleted',
            rowId: oldViewer.id,
            before: oldViewer,
            after: null,
        },
        {
            ago: 2 * HOUR,
            by: ravi,
            event: winter.id,
            kind: 'key',
            action: 'deleted',
            rowId: youtubeGerman.id,
            before: youtubeGerman,
            after: null,
        },
        {
            ago: 45 * MINUTE,
            by: ravi,
            event: winter.id,
            kind: 'key',
            action: 'edited',
            rowId: facebook.id,
            before: {
                ...facebook,
                backupStreamKey: 'FB-1234567890-1-OldBackup',
                remarks: '',
                ...edited(ann, 'added', 3 * 24 * 60),
            },
            after: facebook,
        },
        // The inputs were reordered in one go, so both moves share a moment.
        {
            ago: 20 * MINUTE,
            by: ravi,
            event: winter.id,
            kind: 'input',
            action: 'edited',
            rowId: tamil.id,
            before: { ...tamil, position: 4 },
            after: tamil,
        },
        {
            ago: 20 * MINUTE,
            by: ravi,
            event: winter.id,
            kind: 'input',
            action: 'edited',
            rowId: german.id,
            before: { ...german, position: 3 },
            after: german,
        },
        {
            ago: 5 * MINUTE,
            by: ravi,
            event: winter.id,
            kind: 'key',
            action: 'edited',
            rowId: srt.id,
            before: {
                ...srt,
                streamKey: srt.streamKey.replace('streamid=ch3', 'streamid=ch3-old'),
                remarks: '',
                ...edited(ann, 'added', 3 * 24 * 60),
            },
            after: srt,
        },
    ];
    const changes: ChangeRow[] = entries
        .sort((a, b) => b.ago - a.ago)
        .map((entry, index) => ({
            id: index + 1,
            at: new Date(nowMs - entry.ago).toISOString(),
            by: entry.by,
            event: entry.event,
            kind: entry.kind,
            rowId: entry.rowId,
            action: entry.action,
            before: entry.before,
            after: entry.after,
            batch: null,
            restoredTo: null,
        }));

    return {
        events: [winter, spring],
        inputs: [english, hindi, tamil, german, springEnglish, springHindi],
        roles,
        keys,
        admins,
        trash: [],
        changes,
        status: {
            rows,
            pipelines: [
                pipeline('English', 'running'),
                pipeline('Hindi', 'running'),
                // Lost a few minutes ago: still an alarm. (After 10 minutes it is read as off.)
                pipeline('Tamil', 'error', 'No signal', 3),
                pipeline('German', 'running'),
            ],
            instances: [{ instance: 'demo', lastSeenAt: new Date(nowMs).toISOString() }],
        },
    };
}
