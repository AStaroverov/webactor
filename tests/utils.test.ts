import { describe, expect, it } from 'vitest';

import { $Aborted, Reasons } from '../src/reason';
import { catchAbortToSymbol, isAbort, reasonToError, safeShouldRetry } from '../src/utils/common';
import {
    createRoute,
    extendRoute,
    getFirstRouteCheckpoint,
    getLastRouteCheckpoint,
    isRoutedEnvelope,
    reduceRoute,
    routeEndsWith,
} from '../src/utils/route';
import { createEnvelope } from '../src/envelope';

describe('route utils', () => {
    it('should create route from checkpoints', () => {
        expect(createRoute()).toBe('');
        expect(createRoute('a')).toBe('a');
        expect(createRoute('a', 'b', 'c')).toBe('a/b/c');
    });

    it('should extend and reduce route symmetrically', () => {
        const route = createRoute('id');
        const extended = extendRoute(route, 'a', 'b');

        expect(extended).toBe('id/a/b');
        expect(reduceRoute(extended, 'a', 'b')).toBe('id');
    });

    it('should get first checkpoint from multi-checkpoint route', () => {
        expect(getFirstRouteCheckpoint('id/a/b')).toBe('id');
    });

    it('should get first checkpoint from single-checkpoint route', () => {
        expect(getFirstRouteCheckpoint('id')).toBe('id');
    });

    it('should get last checkpoint from multi- and single-checkpoint routes', () => {
        expect(getLastRouteCheckpoint('id/a/b')).toBe('b');
        expect(getLastRouteCheckpoint('id')).toBe('id');
    });

    it('should check route ending', () => {
        expect(routeEndsWith('id/a/b', 'a', 'b')).toBe(true);
        expect(routeEndsWith('id/a/b', 'b', 'a')).toBe(false);
        expect(routeEndsWith('id/a/b', 'id', 'a')).toBe(false);
    });

    it('should detect routed envelopes', () => {
        const plain = createEnvelope('message', null);
        const routed = createEnvelope('message', null, undefined, { route: 'id/a/b' });

        expect(isRoutedEnvelope(plain)).toBe(false);
        expect(isRoutedEnvelope(routed)).toBe(true);
    });
});

describe('isAbort / catchAbortToSymbol', () => {
    it('should recognize abort reasons', () => {
        expect(isAbort(Reasons.Abort)).toBe(true);
        expect(isAbort(new Error(Reasons.Abort))).toBe(true);
        expect(isAbort(new Event('abort'))).toBe(true);
        expect(isAbort(new DOMException('The request was aborted', 'AbortError'))).toBe(true);
    });

    it('should not recognize other values as abort', () => {
        expect(isAbort(new Error('boom'))).toBe(false);
        expect(isAbort('boom')).toBe(false);
        expect(isAbort(null)).toBe(false);
        expect(isAbort(undefined)).toBe(false);
    });

    it('should convert abort rejections to $Aborted and rethrow the rest', async () => {
        await expect(catchAbortToSymbol(Reasons.Abort)).resolves.toBe($Aborted);
        await expect(catchAbortToSymbol(new DOMException('x', 'AbortError'))).resolves.toBe($Aborted);
        await expect(catchAbortToSymbol(new Error('boom'))).rejects.toThrow('boom');
    });
});

describe('safeShouldRetry', () => {
    it('should pass through sync and async results', async () => {
        await expect(safeShouldRetry(() => true, false)()).resolves.toBe(true);
        await expect(safeShouldRetry(async () => false, true)()).resolves.toBe(false);
    });

    it('should return fallback when shouldRetry throws or rejects', async () => {
        await expect(safeShouldRetry(() => { throw new Error('sync'); }, false)()).resolves.toBe(false);
        await expect(safeShouldRetry(() => Promise.reject(new Error('async')), true)()).resolves.toBe(true);
    });
});

describe('reasonToError', () => {
    it('should pass through Error instances', () => {
        const error = new Error('boom');
        expect(reasonToError(error, 'fallback')).toBe(error);
    });

    it('should build Error from message-like objects and strings', () => {
        expect(reasonToError({ message: 'from object' }, 'fallback').message).toBe('from object');
        expect(reasonToError('from string', 'fallback').message).toBe('from string');
    });

    it('should fall back and keep original reason as cause', () => {
        const error = reasonToError(42, 'fallback');
        expect(error.message).toBe('fallback');
        expect(error.cause).toBe(42);
    });
});
