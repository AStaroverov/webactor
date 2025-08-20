export function reasonToError(reason: unknown, fallback: string): Error {
    if (reason instanceof Error) {
        return reason;
    }
    if (reason != null && typeof reason === 'object' && 'message' in reason && typeof reason.message === 'string') {
        return new Error(reason.message);
    }
    if (typeof reason === 'string' ) {
        return new Error(reason);
    }
    return new Error(fallback, { cause: reason });
}
