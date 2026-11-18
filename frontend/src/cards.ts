// The destination cards and the input list beside them, as HTML. Every function takes what it
// shows as parameters and returns a string: nothing here reads the page or the loaded data on
// its own, so each can be checked by calling it.

import { backupUrl, mainUrl } from '../../supabase/functions/_shared/platforms.ts';
import type { StatusReport } from '../../supabase/functions/_shared/status.ts';
import { formatWhen } from './format.ts';
import { escapeHtml, iconSvg, safeUrl } from './html.ts';
import { inputName, hasMissingInput } from './model.ts';
import type { KeyItem, LoadedData } from './model.ts';
import { STATUS_ORDER, summarizeKeyStatuses } from './overview.ts';
import type { StatusSummary } from './overview.ts';
import { describeLinkClashes } from './search.ts';
import type { LinkClash } from './search.ts';
import {
    INPUT_LABELS,
    STATUS_LABELS,
    describeInputBanner,
    describeKeyNote,
    describeSide,
    getInputStatus,
    getKeyDisplay,
    isTroubleNote,
} from './status-wording.ts';
import type { KeyNote, SideDot } from './status-wording.ts';

// What a card needs besides the destination itself.
export interface CardContext {
    data: LoadedData;
    report: StatusReport | null;
    nowMs: number;
}

// ===== Pieces =====

// The platform's logo, so a card is recognised at a glance. Other kinds get none.
const PLATFORM_LOGOS: Record<string, { name: string; svg: string }> = {
    yt: {
        name: 'YouTube',
        svg: '<path fill="currentColor" d="M9.5 8v8l7-4z" />',
    },
    fb: {
        name: 'Facebook',
        svg: '<path fill="currentColor" d="M13.4 20v-7h2.3l.4-2.8h-2.7V8.5c0-.8.3-1.3 1.4-1.3h1.4V4.7c-.3 0-1.1-.1-2-.1-2.1 0-3.5 1.3-3.5 3.600v2.100H8.400V13h2.300v7z" />',
    },
    ig: {
        name: 'Instagram',
        svg: '<rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="12" cy="12" r="3.200" fill="none" stroke="currentColor" stroke-width="1.8" /><circle cx="16.200" cy="7.800" r="1" fill="currentColor" />',
    },
};

export function platformLogoHtml(platform: string): string {
    const logo = PLATFORM_LOGOS[platform];
    if (!logo) return '';
    return `<span class="platform-logo platform-logo-${escapeHtml(platform)}" title="${escapeHtml(logo.name)}" role="img" aria-label="${escapeHtml(logo.name)}"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">${logo.svg}</svg></span>`;
}

// Who last added or edited a destination, and when. Nothing for one made before this was
// recorded, or one still being saved.
export function renderLastEdit(
    key: Partial<Pick<KeyItem, 'updatedBy' | 'updatedAction' | 'updatedAt'>>,
): string {
    const when = key.updatedBy ? formatWhen(key.updatedAt ?? '') : '';
    if (!when) return '';
    const label = key.updatedAction === 'added' ? 'Added' : 'Edited';
    const text = `${label} by ${key.updatedBy}, ${when}`;
    return `<button type="button" class="dest-card-edit btn btn-ghost btn-square btn-xs shrink-0" title="${escapeHtml(text)}" aria-label="${escapeHtml(text)}">${iconSvg('info')}</button>`;
}

function renderClashWarning(clash: LinkClash): string {
    return `<p class="dest-card-warning" role="alert">${iconSvg('warning', 'h-3.5 w-3.5 shrink-0')}<span>${escapeHtml(clash.text)} Each destination needs its own link.</span></p>`;
}

// "Main" or "Backup" as plain words with a copy button right after. The address itself is
// not shown: hovering the word shows it. A link used by another destination too is red.
function renderLinkChip({
    label,
    value,
    duplicate = false,
    disabled = false,
    dot = null,
}: {
    label: string;
    value: string;
    duplicate?: boolean;
    disabled?: boolean;
    dot?: SideDot | null;
}): string {
    if (!value) return '';
    // Whether this stream is on: the same dot as an input's, before the word.
    const dotHtml = dot
        ? `<span class="input-dot input-dot-${dot.state} mr-1.5" title="${escapeHtml(dot.label)}" role="img" aria-label="${escapeHtml(dot.label)}"></span>`
        : '';
    const title = duplicate ? `${value}\nAlso used by another destination` : value;
    const copy = disabled
        ? ''
        : `<button type="button" class="btn btn-ghost btn-square btn-xs text-accent shrink-0" title="Copy the ${escapeHtml(label.toLowerCase())} link" aria-label="Copy the ${escapeHtml(label.toLowerCase())} link" data-action="copy-text" data-copy-value="${escapeHtml(value)}">${iconSvg('copy')}</button>`;
    return `<span class="dest-link">${dotHtml}<span class="dest-link-name ${duplicate ? 'text-error' : ''}" title="${escapeHtml(title)}">${escapeHtml(label)}</span>${copy}</span>`;
}

// The viewers' web page for the stream: a button that opens it in a new tab.
function renderWatchButton(href: string): string {
    if (!href) return '';
    return `<a href="${escapeHtml(href)}" class="dest-watch" target="_blank" rel="noopener noreferrer" title="Open the watch link in a new tab">Watch ${iconSvg('external', 'h-3 w-3')}</a>`;
}

// The coloured label that starts a card: Live, Unstable, Problem, Not set up yet...
export function keyStatusPillHtml(note: KeyNote | null, isPending = false): string {
    if (isPending) return '<span class="status-pill status-none">Saving</span>';
    if (!note) return '';
    const hover = isTroubleNote(note) ? '' : [note.detail, note.text].filter(Boolean).join(' ');
    const title = hover
        ? ` title="${escapeHtml(note.detail ? `${note.label} ${hover}` : hover)}"`
        : '';
    return `<span class="status-pill status-${note.state}"${title}>${escapeHtml(note.label)}</span>`;
}

// What the status means and what to try, in a sentence under the name. Trouble reads as
// trouble: red with a cross for an error, amber with a triangle for a warning.
export function keyNoteTextHtml(note: KeyNote | null): string {
    if (!note || !isTroubleNote(note) || (!note.text && !note.copy)) return '';
    const copy = note.copy
        ? `<button type="button" class="btn btn-ghost btn-square btn-xs text-accent shrink-0" title="Copy the error details to send to the streaming team" aria-label="Copy error details" data-action="copy-text" data-copy-value="${escapeHtml(note.copy)}">${iconSvg('copy')}</button>`
        : '';
    const icon =
        note.state === 'error'
            ? iconSvg('error', 'h-4 w-4 shrink-0')
            : note.state === 'warning'
              ? iconSvg('warning', 'h-4 w-4 shrink-0')
              : '';
    const tone = icon ? ` dest-card-note-${note.state}` : '';
    return `<p class="dest-card-note${tone}">${icon}<span class="dest-card-note-text">${escapeHtml(note.text)}</span>${copy}</p>`;
}

// ===== The input list and its banners =====

export function statusPillsHtml(summary: StatusSummary): string {
    return STATUS_ORDER.filter((status) => summary[status] > 0)
        .map(
            (status) =>
                `<span class="status-pill status-${status}" title="${escapeHtml(STATUS_LABELS[status])}">${summary[status]}</span>`,
        )
        .join('');
}

// A small coloured dot before an input's name: whether its signal is arriving.
export function inputDotHtml(
    inputId: string,
    report: StatusReport | null,
    nowMs = Date.now(),
): string {
    const input = getInputStatus(inputId, report, nowMs);
    if (!input) return '';
    const label = `Input: ${INPUT_LABELS[input.status] || input.status}`;
    return `<span class="input-dot input-dot-${input.status}" title="${escapeHtml(label)}" role="img" aria-label="${escapeHtml(label)}"></span>`;
}

// An input's name, in red with a cross when the input no longer exists.
export function inputLabelHtml(data: LoadedData, id: string): string {
    if (!hasMissingInput(data, id)) return escapeHtml(inputName(data, id));
    return `
        <span class="text-error inline-flex items-center justify-center gap-1" title="Input not found">
            ${iconSvg('error', 'h-4 w-4')}
            <span>${escapeHtml(id)}</span>
        </span>
    `;
}

export function inputBannerInnerHtml(info: { state: string; label: string; text: string }): string {
    return `<span class="status-pill status-${info.state}">${escapeHtml(info.label)}</span><span>${escapeHtml(info.text)}</span>`;
}

// The words for an input in trouble, or null while it is fine or bunryu is not reporting.
export function bannerFor(ctx: CardContext, inputId: string) {
    return inputId
        ? describeInputBanner(inputId, inputName(ctx.data, inputId), ctx.report, ctx.nowMs)
        : null;
}

// ===== A card =====

// A card: the platform, the status, the name and its copy button on top, then what the status
// means, then one row with the links and the edit buttons.
export function renderCard(key: KeyItem, eventKeys: KeyItem[], ctx: CardContext): string {
    const { data, report, nowMs } = ctx;
    const { tint, title: technicalTitle } = getKeyDisplay(key, report, nowMs);
    const isPending = Boolean(key.pending);
    const note = isPending ? null : describeKeyNote(key, report, nowMs, inputName(data, key.input));
    // Hovering gives owners bunryu's own report; everyone else the note.
    const seesTechnical = data.events.find((e) => e.id === key.event)?.can.seeTechnicalStatus;
    const statusTitle = seesTechnical
        ? technicalTitle
        : note
          ? [note.label, note.text].filter(Boolean).join(': ')
          : '';
    const actions = isPending
        ? '<span class="loading loading-dots loading-xs" title="Saving"></span>'
        : key.canChange
          ? `
                    <div class="flex justify-center gap-1">
                        <button type="button" class="btn btn-ghost btn-square btn-xs text-accent" title="Edit" aria-label="Edit key" data-action="edit-key-by-id">
                            ${iconSvg('pen')}
                        </button>
                        <button type="button" class="btn btn-ghost btn-square btn-xs text-error" title="Delete" aria-label="Delete key" data-action="delete-key-by-id">
                            ${iconSvg('trash')}
                        </button>
                    </div>
                `
          : '';
    // A link another destination of this event also uses, found across the whole event so a
    // filter never hides a clash.
    const clashes = isPending
        ? []
        : describeLinkClashes(key, eventKeys, (id) => inputName(data, id));
    const clashing = (label: 'Main' | 'Backup') =>
        clashes.some((clash) => clash.labels.includes(label));
    // One line of links: "Main" and "Backup" are just words (hover for the address), each with
    // its copy button; the watch link is a button that opens it in a new tab.
    const linksHtml = [
        renderLinkChip({
            label: 'Main',
            value: mainUrl(key),
            duplicate: clashing('Main'),
            disabled: isPending,
            dot: isPending ? null : describeSide(key, 'main', report, nowMs),
        }),
        renderLinkChip({
            label: 'Backup',
            value: backupUrl(key),
            duplicate: clashing('Backup'),
            disabled: isPending,
            dot: isPending ? null : describeSide(key, 'backup', report, nowMs),
        }),
        renderWatchButton(safeUrl(key.link)),
    ].join('');
    const nameCopyButton = isPending
        ? ''
        : `<button type="button" class="btn btn-ghost btn-square btn-xs text-accent shrink-0" title="Copy the name" aria-label="Copy the name" data-action="copy-text" data-copy-value="${escapeHtml(key.name)}">${iconSvg('copy')}</button>`;
    return `
                <article class="dest-card ${tint}" data-key-id="${escapeHtml(key.id)}" title="${escapeHtml(statusTitle)}">
                    <div class="dest-card-head">
                        ${platformLogoHtml(key.platform)}
                        ${keyStatusPillHtml(note, isPending)}
                        <h4 class="dest-card-name" title="${escapeHtml(key.name)}">${escapeHtml(key.name || '(unnamed)')}</h4>
                        ${nameCopyButton}
                    </div>
                    ${keyNoteTextHtml(note)}
                    ${clashes.map(renderClashWarning).join('')}
                    <div class="dest-card-links">
                        ${linksHtml}
                        <div class="dest-card-tools">
                            ${renderLastEdit(key)}
                            ${actions}
                        </div>
                    </div>
                    ${key.remarks ? `<p class="dest-card-remarks" title="${escapeHtml(key.remarks)}">${escapeHtml(key.remarks)}</p>` : ''}
                </article>`;
}

// Under All, or in a search, the destinations come from several inputs: one section per input,
// in the inputs' own order, each with its name and how many it holds. With a single input chosen
// there is nothing to separate, so its cards are shown as they are.
export function renderDestinationList(
    keys: KeyItem[],
    eventKeys: KeyItem[],
    grouped: boolean,
    ctx: CardContext,
): string {
    const cards = keys.map((key) => ({
        input: key.input,
        key,
        card: renderCard(key, eventKeys, ctx),
    }));
    if (!grouped) return `<div class="dest-grid">${cards.map((c) => c.card).join('')}</div>`;

    const sections: { input: string; cards: string[]; keys: KeyItem[] }[] = [];
    for (const { input, key, card } of cards) {
        const last = sections[sections.length - 1];
        if (last && last.input === input) {
            last.cards.push(card);
            last.keys.push(key);
        } else sections.push({ input, cards: [card], keys: [key] });
    }
    return sections
        .map(({ input, cards: inputCards, keys: inputKeys }) => {
            // An input in trouble says so at the top of its own section, as it does when chosen.
            const info = bannerFor(ctx, input);
            const banner = info
                ? `<div class="input-banner input-banner-${info.state}" role="status">${inputBannerInnerHtml(info)}</div>`
                : '';
            return `
        <section class="dest-section" data-input-id="${escapeHtml(input)}">
            <h3 class="dest-section-head">
                ${inputDotHtml(input, ctx.report, ctx.nowMs)}
                <span class="dest-section-name">${inputLabelHtml(ctx.data, input)}</span>
                <span class="dest-section-pills">${statusPillsHtml(summarizeKeyStatuses(inputKeys, ctx.report, ctx.nowMs))}</span>
                <span class="dest-section-count">${inputCards.length}</span>
            </h3>
            ${banner}
            <div class="dest-grid">${inputCards.join('')}</div>
        </section>`;
        })
        .join('');
}
