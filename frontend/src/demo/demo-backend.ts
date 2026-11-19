// The backend of the demo site. It is the real thing: the server's own operations, running in
// the page against an in-memory store, so the demo cannot drift from what the server allows.

import { createMemoryStore } from '../../../supabase/functions/_shared/memory-store.ts';
import type { MemoryStore } from '../../../supabase/functions/_shared/memory-store.ts';
import { operations } from '../../../supabase/functions/_shared/operations.ts';
import type { Context } from '../../../supabase/functions/_shared/operations.ts';
import type { OperationName } from '../../../supabase/functions/_shared/types.ts';
import { operationNames } from '../api-client.ts';
import type { Backend } from '../api-client.ts';
import { DEMO_EMAIL, DEMO_HASH_SECRET, DEMO_SECRET, buildDemoState } from './demo-data.ts';

// A backend that runs the operations on `store` as whoever `context()` says, now.
export function backendFromOperations(store: MemoryStore, context: () => Context): Backend {
    const backend: Record<string, (input?: unknown) => Promise<unknown>> = {};
    for (const name of operationNames()) {
        backend[name] = (input) =>
            (operations[name as OperationName] as (...args: unknown[]) => Promise<unknown>)(
                store,
                context(),
                input,
            );
    }
    return backend as Backend;
}

export async function createDemoBackend(): Promise<Backend & { store: MemoryStore }> {
    const store = createMemoryStore(await buildDemoState());
    // The demo's bunryu is always reporting, however long the page stays open.
    const loadStatus = store.loadStatus.bind(store);
    store.loadStatus = async () => {
        const status = await loadStatus();
        const now = new Date().toISOString();
        return { ...status, instances: status.instances.map((i) => ({ ...i, lastSeenAt: now })) };
    };
    const backend = backendFromOperations(store, () => ({
        email: DEMO_EMAIL,
        isAppOwner: true,
        ownerEmails: [DEMO_EMAIL],
        hashSecret: DEMO_HASH_SECRET,
        secret: DEMO_SECRET,
        ingestUrl: 'https://demo.example.org/functions/v1/ingest',
        nowMs: Date.now(),
    }));
    return Object.assign(backend, { store });
}
