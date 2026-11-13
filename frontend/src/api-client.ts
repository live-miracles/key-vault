// How the browser calls the `api` Edge Function (supabase/functions/api). Kept apart from
// the Supabase client so it can be tested with a fake fetch.

export interface BackendConfig {
    supabaseUrl: string;
    publishableKey: string;
}

export interface ApiAnswer {
    success: boolean;
    data?: any;
    error?: string;
}

export class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ApiError';
        this.status = status;
    }
}

export async function callApi(
    fetchImpl: typeof fetch,
    config: BackendConfig,
    accessToken: string,
    operation: string,
    args: unknown[],
): Promise<ApiAnswer> {
    const response = await fetchImpl(`${config.supabaseUrl}/functions/v1/api`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: config.publishableKey,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operation, args }),
    });

    let body: any = null;
    try {
        body = await response.json();
    } catch {
        // Not JSON (a gateway error page): reported by status below.
    }
    if (!response.ok) {
        throw new ApiError(
            body?.error || body?.message || `HTTP ${response.status}`,
            response.status,
        );
    }
    if (!body || typeof body.success !== 'boolean') {
        throw new ApiError('The server sent an unexpected answer.', response.status);
    }
    return body;
}
