// Plain-language times and the words about bunryu in the corner. Pure: no page needed.

import type { StatusReport } from '../../supabase/functions/_shared/status.ts';

// "3 min ago", "2 h ago", "5 d ago".
export function formatAgo(ms: number): string {
    const minutes = Math.floor(Math.max(0, ms) / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    return `${Math.floor(hours / 24)} d ago`;
}

// "18 Nov, 3:42 pm", with the year only when it is not this one. '' for a time that is not one.
export function formatWhen(iso: string, nowMs = Date.now()): string {
    const date = new Date(iso);
    if (!iso || Number.isNaN(date.getTime())) return '';
    const sameYear = date.getFullYear() === new Date(nowMs).getFullYear();
    return date.toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
        hour: 'numeric',
        minute: '2-digit',
    });
}

export interface BunryuState {
    state: 'unknown' | 'online' | 'never' | 'offline';
    text: string;
    title: string;
}

// What the corner says about bunryu. bunryu only runs during events, so being offline is
// normal: the text is informational, never a warning.
export function describeBunryu(
    report: Pick<StatusReport, 'online' | 'instances'> | null | undefined,
    nowMs = Date.now(),
): BunryuState {
    if (!report) return { state: 'unknown', text: '', title: '' };
    if (report.online) {
        // One bunryu is the usual case; a standby running beside it is counted.
        const count = (report.instances || []).filter((i) => i.online).length;
        return {
            state: 'online',
            text: count > 1 ? `${count} bunryu connected` : 'bunryu connected',
            title: 'bunryu is reporting stream status',
        };
    }
    const lastSeen = (report.instances || [])
        .map((i) => new Date(i.lastSeenAt).getTime())
        .filter((t) => !Number.isNaN(t))
        .sort((a, b) => b - a)[0];
    if (lastSeen === undefined) {
        return {
            state: 'never',
            text: 'bunryu not connected',
            title: 'bunryu has not reported yet',
        };
    }
    return {
        state: 'offline',
        text: `bunryu last seen ${formatAgo(nowMs - lastSeen)}`,
        title: `Last report: ${new Date(lastSeen).toLocaleString()}`,
    };
}

export interface InstanceLine {
    name: string;
    online: boolean;
    // "just now", "5 min ago": when it last reported.
    seen: string;
}

// The bunryu servers that have reported, for the dialog behind the corner: connected ones
// first, then the most recently seen.
export function listInstances(
    report: Pick<StatusReport, 'instances'> | null | undefined,
    nowMs = Date.now(),
): InstanceLine[] {
    return (report?.instances || [])
        .map((i) => ({ ...i, at: new Date(i.lastSeenAt).getTime() }))
        .sort((a, b) => Number(b.online) - Number(a.online) || b.at - a.at)
        .map((i) => ({
            name: i.instance,
            online: i.online,
            seen: Number.isNaN(i.at) ? '' : formatAgo(nowMs - i.at),
        }));
}
