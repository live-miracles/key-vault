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
