// The right-hand side of an event: the search box, the input banner and the destination cards,
// plus the small menu that copies a destination's links.

import { backupUrl, mainUrl } from '../../supabase/functions/_shared/platforms.ts';
import { actions, app } from './app.ts';
import { bannerFor, inputBannerInnerHtml, renderDestinationList } from './cards.ts';
import { $, confirmAction, copyTextValue } from './dom.ts';
import { escapeHtml, iconSvg } from './html.ts';
import { eventKeysOf, inputName, inputsOf } from './model.ts';
import { ALL_INPUTS } from './overview.ts';
import { hideRoleContextMenu } from './roles.ts';
import { matchesDestinationSearch } from './search.ts';
import { renderInputPanel } from './inputs.ts';

// What is typed in the search box above the destinations, and the event it was typed for.
let destinationSearch = '';
let destinationSearchEvent: string | null = null;

export function setDestinationSearch(value: string, render: () => void) {
    destinationSearch = String(value ?? '');
    render();
}

// Shows the search box only when there is something to search, and says what it found.
function renderDestinationSearch(total: number, shown: number) {
    const input = $<HTMLInputElement>('#destination-search');
    $('#destination-search-box').classList.toggle('hidden', total === 0);
    if (input.value !== destinationSearch) input.value = destinationSearch;
    $('#destination-search-clear').classList.toggle('hidden', !destinationSearch);
    $('#destination-search-status').textContent = destinationSearch.trim()
        ? `${shown} of ${total} destination${total === 1 ? '' : 's'} in all inputs`
        : '';
}

// When the chosen input is in trouble, say so above its destinations.
function renderInputBanner(inputId: string) {
    const banner = $('#input-banner');
    const info = bannerFor({ data: app.data, report: app.status, nowMs: Date.now() }, inputId);
    banner.className = banner.className.replace(/input-banner-\w+/g, '').trim();
    banner.classList.toggle('hidden', !info);
    if (!info) {
        banner.textContent = '';
        return;
    }
    banner.classList.add(`input-banner-${info.state}`);
    banner.innerHTML = inputBannerInnerHtml(info);
}

// With nothing to show, say what to do next instead of leaving a blank list.
function renderKeysEmptyState(isEmpty: boolean, eventId: string) {
    const event = app.data.events.find((e) => e.id === eventId);
    const canAdd = Boolean(event?.can.addKeys);
    $('#keys-empty').classList.toggle('hidden', !isEmpty);
    $('#key-cards').classList.toggle('hidden', isEmpty);
    // A destination needs an input, so an event with none starts by adding one.
    const noInputs = inputsOf(app.data, eventId).length === 0;
    const canAddInput = Boolean(event?.can.manageInputs);
    const button = $('#keys-empty-add');
    const addsInput = noInputs && canAddInput;
    button.classList.toggle('hidden', noInputs ? !canAddInput : !canAdd);
    button.dataset.action = addsInput ? 'add-input' : 'add-key';
    $('#keys-empty-add-label').textContent = addsInput
        ? 'Add your first input'
        : 'Add your first destination';
    $('#keys-empty-title').textContent = noInputs
        ? 'No inputs here yet'
        : 'No destinations here yet';
    $('#keys-empty-text').textContent = noInputs
        ? canAddInput
            ? 'An input is one feed of this event, for example “Hindi”. Add one for each feed, then add its destinations.'
            : 'An admin of this event needs to add its inputs before destinations can be added.'
        : canAdd
          ? 'Add a destination for each place you will go live, such as YouTube or Facebook. We will show you where to find the stream key.'
          : 'Nothing has been added for you to see yet.';
}

export function renderDestinations(eventId: string) {
    // A search belongs to the event it was typed in.
    if (destinationSearchEvent !== eventId) {
        destinationSearchEvent = eventId;
        destinationSearch = '';
    }
    const { data, status } = app;
    const eventKeys = eventKeysOf(data, eventId);
    // The left panel picks an input; the list shows only that input's destinations. Link
    // clashes are still checked against the whole event, so a filter never hides one.
    const input = renderInputPanel(eventId, eventKeys);
    const searching = destinationSearch.trim() !== '';
    // A search looks through the whole event, so a destination is found without first knowing
    // which input it is in. Under All or a search the cards come from several inputs, so each
    // section says which one it is.
    const grouped = searching || input === ALL_INPUTS;
    renderInputBanner(grouped ? '' : input);
    const keys = searching
        ? eventKeys.filter((k) =>
              matchesDestinationSearch(k, destinationSearch, inputName(data, k.input)),
          )
        : input && input !== ALL_INPUTS
          ? eventKeys.filter((k) => k.input === input)
          : eventKeys;
    renderDestinationSearch(eventKeys.length, keys.length);

    // A search with no match is not an empty input: say so, and do not offer to add one.
    const noMatch = searching && keys.length === 0;
    renderKeysEmptyState(keys.length === 0 && !noMatch, eventId);
    $('#keys-no-match').classList.toggle('hidden', !noMatch);
    if (noMatch) {
        $('#key-cards').classList.add('hidden');
        $('#keys-no-match-text').textContent =
            `Nothing matches “${destinationSearch.trim()}”. Try part of the name, the platform, the input or the stream key.`;
    }

    $('#key-cards').innerHTML = renderDestinationList(keys, eventKeys, grouped, {
        data,
        report: status,
        nowMs: Date.now(),
    });
    for (const card of document.querySelectorAll<HTMLElement>('#key-cards [data-key-id]')) {
        card.addEventListener('dblclick', (event) => {
            if ((event.target as Element).closest('button, a, input, select, textarea')) return;
            showLinksMenu(event, card.dataset.keyId);
        });
    }
}

export async function deleteKeyById(keyId: string | undefined) {
    const key = app.data.keys.find((k) => k.id === keyId);
    if (!key) return;
    if (!(await confirmAction(`Delete the destination "${key.name}"? This cannot be undone.`)))
        return;
    await actions.removeKey(key.id);
}

// ===== The menu that copies a destination's links (double-click a card) =====

let menuKeyId: string | null = null;

export function hideLinksMenu() {
    $('#key-links-menu')?.classList.add('hidden');
}

function showLinksMenu(event: MouseEvent, keyId: string | undefined) {
    event.preventDefault();
    const key = app.data.keys.find((k) => k.id === keyId);
    if (!key || key.pending) return hideLinksMenu();

    menuKeyId = key.id;
    hideRoleContextMenu();

    const copyActions = [
        { type: 'main', label: 'Main', url: mainUrl(key) },
        { type: 'backup', label: 'Backup', url: backupUrl(key) },
    ]
        .filter((action) => action.url)
        .map(
            (action) => `
                <li>
                    <button type="button" data-action="copy-selected-key-url" data-action-type="${escapeHtml(action.type)}">
                        ${iconSvg('copy')}
                        <span>${escapeHtml(action.label)}</span>
                    </button>
                </li>
            `,
        );
    if (!copyActions.length) return hideLinksMenu();
    $('#key-links-menu-options').innerHTML = copyActions.join('');

    const menu = $('#key-links-menu');
    menu.classList.remove('hidden');
    const rect = menu.getBoundingClientRect();
    const margin = 8;
    let x = event.clientX;
    let y = event.clientY - rect.height / 2;
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - margin;
    if (y < margin || y + rect.height > window.innerHeight - margin) {
        if (event.clientY + rect.height + margin <= window.innerHeight) y = event.clientY;
        else if (event.clientY - rect.height - margin >= 0) y = event.clientY - rect.height;
        else y = Math.min(window.innerHeight - rect.height - margin, Math.max(margin, y));
    }
    menu.style.left = `${Math.max(margin, x)}px`;
    menu.style.top = `${Math.max(margin, y)}px`;
}

export async function copySelectedKeyUrl(type: string | undefined) {
    hideLinksMenu();
    const key = app.data.keys.find((k) => k.id === menuKeyId);
    if (!key) return;
    const url = type === 'backup' ? backupUrl(key) : mainUrl(key);
    if (!url) return;
    await copyTextValue(JSON.stringify({ name: key.name, url }));
}
