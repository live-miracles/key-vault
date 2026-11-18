// The loaded data and every change to it, in one place.
//
// A change is shown at once and sent to the server; if the server refuses it, the screen goes
// back to what it was and says why, in the server's own plain words. Changes are sent one after
// another, so going back is always to a state that really existed. A refresh from the server
// (the five-minute poll, the Refresh button) never replaces data while a change is on its way,
// since it would show the old state over the new one; it runs once the changes are done.
//
// Nothing here touches the page: the screens subscribe, and say how to show an error and the
// "Saving" badge. That keeps the rules testable with a fake backend.

import type { StatusReport } from '../../supabase/functions/_shared/status.ts';
import { ApiError } from '../../supabase/functions/_shared/types.ts';
import type { AppData } from '../../supabase/functions/_shared/types.ts';
import type { Backend } from './api-client.ts';
import { emptyData } from './model.ts';
import type { LoadedData } from './model.ts';

export interface StoreHooks {
    // Shows a refused change or a failed load, in words for the person.
    onError(message: string): void;
    // True while any change is waiting for the server.
    onBusy(busy: boolean): void;
}

// A stand-in id for an item that is saved but not yet answered by the server, which makes
// the real one. It only has to differ from every other id on the page.
export function newTempId(): string {
    const random = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    return 'new-' + random;
}

// What the listeners are told changed: the loaded data, or only bunryu's report.
export type ChangeKind = 'data' | 'status';

export type ChangeResult<R> = { ok: true; result: R } | { ok: false };

function messageOf(error: unknown): string {
    if (error instanceof ApiError) return error.message;
    console.error(error);
    return 'Something went wrong. Please try again.';
}

export class AppStore {
    data: LoadedData = emptyData();
    status: StatusReport | null = null;
    backend: Backend | null = null;

    #hooks: StoreHooks = { onError: () => {}, onBusy: () => {} };
    #listeners = new Set<(kind: ChangeKind) => void>();
    #waiting = 0;
    // How many changes have been started, to tell whether one began while data was loading.
    #changes = 0;
    #refreshWanted = false;
    #queue: Promise<unknown> = Promise.resolve();

    start(backend: Backend, hooks: Partial<StoreHooks> = {}) {
        this.backend = backend;
        this.#hooks = { onError: () => {}, onBusy: () => {}, ...hooks };
    }

    subscribe(listener: (kind: ChangeKind) => void): () => void {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    #notify(kind: ChangeKind = 'data') {
        for (const listener of this.#listeners) listener(kind);
    }

    get busy(): boolean {
        return this.#waiting > 0;
    }

    // Loads the data from the server. Skipped (and done later) while a change is on its way,
    // and dropped if a change started while it was loading. Returns whether it replaced the data.
    async refresh(): Promise<boolean> {
        if (!this.backend) return false;
        if (this.busy) {
            this.#refreshWanted = true;
            return false;
        }
        const changesBefore = this.#changes;
        let loaded: AppData;
        try {
            loaded = await this.backend.getAllData(undefined);
        } catch (error) {
            this.#hooks.onError(messageOf(error));
            return false;
        }
        // A change started while this was loading: what came back may be from before it.
        if (this.busy || this.#changes !== changesBefore) {
            // Load again once the changes are done (now, if none is still running).
            if (this.busy) this.#refreshWanted = true;
            else void this.refresh();
            return false;
        }
        this.data = loaded as LoadedData;
        this.#notify();
        return true;
    }

    // bunryu's report. A failed refresh keeps the last one: a short network problem must not
    // blank the colors.
    async refreshStatus(): Promise<boolean> {
        if (!this.backend) return false;
        try {
            this.status = await this.backend.getStatus(undefined);
        } catch (error) {
            console.error(error);
            return false;
        }
        this.#notify('status');
        return true;
    }

    // Shows a change (`apply`, on the data itself), sends it (`call`), then puts in the server's
    // answer (`commit`). If the call fails, the data goes back to what it was.
    change<R>(
        apply: (data: LoadedData) => void,
        call: () => Promise<R>,
        commit: (data: LoadedData, result: R) => void = () => {},
    ): Promise<ChangeResult<R>> {
        this.#changes++;
        if (this.#waiting++ === 0) this.#hooks.onBusy(true);

        const run = async (): Promise<ChangeResult<R>> => {
            const snapshot = structuredClone(this.data);
            apply(this.data);
            this.#notify();
            try {
                const result = await call();
                commit(this.data, result);
                this.#notify();
                return { ok: true, result };
            } catch (error) {
                this.data = snapshot;
                this.#notify();
                this.#hooks.onError(messageOf(error));
                return { ok: false };
            }
        };
        const task = this.#queue.then(run);
        this.#queue = task;
        return task.finally(() => {
            if (--this.#waiting > 0) return;
            this.#hooks.onBusy(false);
            if (this.#refreshWanted) {
                this.#refreshWanted = false;
                void this.refresh();
            }
        });
    }
}

export const app = new AppStore();
