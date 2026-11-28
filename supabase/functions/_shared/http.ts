// How an operation's failure reaches the browser: a real HTTP status, and a body of
// { error: { code, message } } that the browser turns back into an ApiError. A success is the
// operation's result as plain JSON. Only erasable TypeScript syntax is used.

import { ApiError, HTTP_STATUS } from './types.ts';

// The operation a request is for: the last segment of the path, ".../api/addKey".
export function operationFrom(pathname: string): string {
    const last = pathname.split('/').filter(Boolean).pop() ?? '';
    try {
        return decodeURIComponent(last);
    } catch {
        // A malformed escape (".../api/%E0%A4%A") names no operation: "not found", not a crash.
        return '';
    }
}

// The request body as text, or null when it is larger than `maxBytes`. It stops reading as soon
// as the limit is passed, so a body sent without a Content-Length is never held whole.
export async function readBody(request: Request, maxBytes: number): Promise<string | null> {
    if (Number(request.headers.get('Content-Length') || 0) > maxBytes) return null;
    if (!request.body) return '';
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maxBytes) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}

export function errorResponse(error: unknown): {
    status: number;
    body: { error: { code: string; message: string } };
} {
    if (error instanceof ApiError) {
        return {
            status: HTTP_STATUS[error.code],
            body: { error: { code: error.code, message: error.message } },
        };
    }
    // Anything else is a fault on the server: say nothing about what it was.
    return {
        status: 500,
        body: { error: { code: 'unavailable', message: 'The request could not be completed.' } },
    };
}
