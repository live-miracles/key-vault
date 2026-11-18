// bunryu in the corner of the page: whether it is reporting, and for the app's owners the
// settings bunryu needs to be pointed at Key Vault.

import type { Backend } from './api-client.ts';
import { app } from './app.ts';
import { $, copyTextValue, showErrorAlert } from './dom.ts';
import { describeBunryu, listInstances } from './format.ts';
import { escapeHtml, iconSvg } from './html.ts';

export function renderBunryuStatus() {
    const el = document.getElementById('bunryu-status') as HTMLButtonElement | null;
    if (!el) return;
    const { state, text, title } = describeBunryu(app.status);
    el.hidden = state === 'unknown';
    // Owners can click through to the settings bunryu needs.
    const isOwner = app.data.isAppOwner;
    el.disabled = !isOwner;
    el.title = title + (isOwner ? ' (click for bunryu settings)' : '');
    $('#bunryu-status-text').textContent = text;
    $('#bunryu-dot').className =
        'h-2 w-2 rounded-full ' + (state === 'online' ? 'bg-success' : 'bg-base-content/30');
    renderInstances();
}

// Which bunryu servers have reported, by the Server Name typed in bunryu. Redrawn with every
// status report, so it stays current while the dialog is open.
function renderInstances() {
    const list = listInstances(app.status);
    const connected = list.filter((i) => i.online).length;
    $('#bunryu-instances-heading').textContent = `Connected bunryu (${connected})`;
    $('#bunryu-instances').innerHTML = list.length
        ? list
              .map(
                  (i) => `<li class="flex items-center gap-2 py-0.5">
                      <span class="h-2 w-2 shrink-0 rounded-full ${i.online ? 'bg-success' : 'bg-base-content/30'}"></span>
                      <span class="font-medium break-all">${escapeHtml(i.name)}</span>
                      <span class="text-base-content/60 ml-auto shrink-0">${i.online ? 'connected' : `last seen ${escapeHtml(i.seen)}`}</span>
                  </li>`,
              )
              .join('')
        : '<li class="text-base-content/60">No bunryu has reported yet.</li>';
}

// The settings are fetched when the dialog opens and dropped when it closes, so the secrets are
// not kept in the page while nobody is looking at them.
let settings: Awaited<ReturnType<Backend['getBunryuSettings']>> | null = null;
let revealed = false;
const MASK = '•'.repeat(12);

function renderBunryuSettings() {
    const rows: [string, string, string, boolean][] = settings
        ? [
              ['url', 'Link', settings.url, false],
              ['secret', 'Secret', settings.secret, true],
          ]
        : [];
    $('#bunryu-body').innerHTML = rows.length
        ? `<table class="table"><tbody>${rows
              .map(([field, label, value, secret]) => {
                  const shown = secret && !revealed ? MASK : value;
                  const reveal = secret
                      ? `<button type="button" class="btn btn-ghost btn-square btn-xs" title="${revealed ? 'Hide' : 'Show'} ${escapeHtml(label.toLowerCase())}" aria-label="${revealed ? 'Hide' : 'Show'} ${escapeHtml(label.toLowerCase())}" aria-pressed="${revealed}" data-action="toggle-bunryu-secrets">${iconSvg(revealed ? 'eye-off' : 'eye')}</button>`
                      : '';
                  return `<tr>
                      <th class="text-base-content/70 w-1/3 text-sm font-normal">${escapeHtml(label)}</th>
                      <td class="font-mono text-sm break-all">${escapeHtml(shown)}</td>
                      <td class="w-20"><div class="flex justify-end gap-1">${reveal}<button type="button" class="btn btn-ghost btn-square btn-xs" title="Copy" aria-label="Copy ${escapeHtml(label)}" data-action="copy-bunryu-value" data-field="${field}">${iconSvg('copy')}</button></div></td>
                  </tr>`;
              })
              .join('')}</tbody></table>`
        : '<span class="loading loading-dots"></span>';
}

export async function showBunryuModal() {
    if (!app.data.isAppOwner || !app.backend) return;
    const modal = $<HTMLDialogElement>('#bunryu-modal');
    settings = null;
    revealed = false;
    renderBunryuSettings();
    modal.showModal();
    try {
        settings = await app.backend.getBunryuSettings();
    } catch (error) {
        modal.close();
        showErrorAlert(error instanceof Error ? error.message : String(error));
        return;
    }
    renderBunryuSettings();
}

export function toggleBunryuSecrets() {
    revealed = !revealed;
    renderBunryuSettings();
}

export function copyBunryuValue(field: string | undefined) {
    if (settings && field && field in settings) {
        return copyTextValue(settings[field as keyof typeof settings]);
    }
}

export function initBunryuModal() {
    $('#bunryu-modal').addEventListener('close', () => {
        settings = null;
        revealed = false;
        renderBunryuSettings();
    });
}
