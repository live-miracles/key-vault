// Finding destinations, and spotting two destinations that share one link. Pure.

import { backupUrl, mainUrl, platformName } from '../../supabase/functions/_shared/platforms.ts';
import type { Destination } from '../../supabase/functions/_shared/platforms.ts';

type Searchable = Destination & { name: string; remarks?: string; link?: string };

// Whether a destination matches what was typed. Every word must be found somewhere in what
// the destination holds: name, input, notes, watch link, the platform and stream key of the
// main and the backup, and their full addresses. So pasting a stream key finds who uses it.
export function matchesDestinationSearch(key: Searchable, query: string, inputName = ''): boolean {
    const words = String(query ?? '')
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return true;
    const text = [
        key.name,
        inputName,
        key.remarks,
        key.link,
        platformName(key.platform),
        key.streamKey,
        mainUrl(key),
        platformName(key.backupPlatform),
        key.backupStreamKey,
        backupUrl(key),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return words.every((word) => text.includes(word));
}

export interface LinkClash {
    label: 'Main' | 'Backup';
    labels: ('Main' | 'Backup')[];
    text: string;
}

type Linked = Destination & { id: string; name: string; input: string };

// Which of a destination's links another destination of the event also uses, in plain words:
// one { label, text } per link. Two destinations on one link would fight over the same stream.
export function describeLinkClashes(
    key: Linked,
    eventKeys: Linked[],
    nameOf: (inputId: string) => string,
): LinkClash[] {
    const urlsOf = (k: Destination) => [mainUrl(k), backupUrl(k)];
    const found: { labels: ('Main' | 'Backup')[]; others: Linked[] }[] = [];
    const links: ['Main' | 'Backup', string][] = [
        ['Main', mainUrl(key)],
        ['Backup', backupUrl(key)],
    ];
    for (const [label, url] of links) {
        if (!url) continue;
        const others = eventKeys.filter((o) => o.id !== key.id && urlsOf(o).includes(url));
        if (others.length > 0) found.push({ labels: [label], others });
    }
    // Main and Backup clashing with the same destinations (a YouTube backup is made from the
    // same key) is one problem, so it is said once.
    const [first, second] = found;
    if (second && first.others.map((o) => o.id).join() === second.others.map((o) => o.id).join()) {
        found.splice(0, 2, { labels: ['Main', 'Backup'], others: first.others });
    }
    const clashes: LinkClash[] = found.map(({ labels, others }) => {
        const names = others
            .slice(0, 2)
            .map((o) => `“${o.name || '(unnamed)'}” (${nameOf(o.input)})`)
            .join(' and ');
        const more = others.length > 2 ? ` and ${others.length - 2} more` : '';
        const subject = labels.length > 1 ? 'Main and Backup links are' : `${labels[0]} link is`;
        return { label: labels[0], labels, text: `${subject} also used by ${names}${more}.` };
    });
    // Both links of one destination being the same defeats the backup.
    const [main, backup] = urlsOf(key);
    if (main && main === backup) {
        clashes.push({
            label: 'Backup',
            labels: ['Backup'],
            text: 'Main and Backup are the same link.',
        });
    }
    return clashes;
}
