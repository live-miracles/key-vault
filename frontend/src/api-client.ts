// How the browser calls the `api` Edge Function (supabase/functions/api). Kept apart from the
// Supabase client so it can be tested with a fake fetch.

import { ApiError } from '../../supabase/functions/_shared/types.ts';
import type {
    ApiErrorCode,
    OperationName,
    Operations,
} from '../../supabase/functions/_shared/types.ts';

export { ApiError };

export interface BackendConfig {
    supabaseUrl: string;
    publishableKey: string;
}

// One method per operation, each taking that operation's input and returning its result, or
// throwing an ApiError. The real site and the demo both provide this.
export type Backend = {
    [N in OperationName]: (input: Operations[N]['input']) => Promise<Operations[N]['output']>;
};

// Every operation, written out so a new one cannot be forgotten here: the type checker
// refuses an object that misses one.
const OPERATION_NAMES: Record<OperationName, true> = {
    getAllData: true,
    getStatus: true,
    getBunryuSettings: true,
    addEvent: true,
    editEvent: true,
    deleteEvent: true,
    addRole: true,
    editRole: true,
    deleteRole: true,
    addInput: true,
    editInput: true,
    reorderInputs: true,
    deleteInput: true,
    addKey: true,
    editKey: true,
    deleteKey: true,
};

export function operationNames(): OperationName[] {
    return Object.keys(OPERATION_NAMES) as OperationName[];
}

const CODES: ApiErrorCode[] = ['invalid', 'denied', 'not_found', 'conflict', 'unavailable'];

function codeForStatus(status: number): ApiErrorCode {
    if (status === 400) return 'invalid';
    if (status === 401 || status === 403) return 'denied';
    if (status === 404) return 'not_found';
    if (status === 409) return 'conflict';
    return 'unavailable';
}

// POST <supabase url>/functions/v1/api/<operation> with the input as the JSON body. A success
// is the result; a failure is an ApiError carrying the server's code and plain message.
export async function callApi(
    fetchImpl: typeof fetch,
    config: BackendConfig,
    accessToken: string,
    operation: string,
    input?: unknown,
): Promise<unknown> {
    let response: Response;
    try {
        response = await fetchImpl(`${config.supabaseUrl}/functions/v1/api/${operation}`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                apikey: config.publishableKey,
                'Content-Type': 'application/json',
            },
            body: input === undefined ? undefined : JSON.stringify(input),
        });
    } catch {
        throw new ApiError('unavailable', 'Could not reach the server. Check the connection.');
    }

    let body: any = null;
    try {
        body = await response.json();
    } catch {
        // Not JSON (a gateway error page): reported by status below.
    }
    if (!response.ok) {
        const error = body?.error;
        const code: ApiErrorCode = CODES.includes(error?.code)
            ? error.code
            : codeForStatus(response.status);
        throw new ApiError(
            code,
            (typeof error?.message === 'string' && error.message) ||
                `The server could not do that (HTTP ${response.status}).`,
        );
    }
    return body;
}

// The real backend: each operation is a call to the Edge Function with the signed-in user's
// token. `getToken` renews it when it is about to expire, and fails when nobody is signed in.
export function createHttpBackend(
    config: BackendConfig,
    getToken: () => Promise<string>,
    fetchImpl: typeof fetch = fetch,
): Backend {
    const backend: Record<string, (input?: unknown) => Promise<unknown>> = {};
    for (const name of operationNames()) {
        backend[name] = async (input) => callApi(fetchImpl, config, await getToken(), name, input);
    }
    return backend as Backend;
}
