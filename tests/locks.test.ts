import { describe, it, expect } from 'vitest';
import './locks';

import { locksProvider } from '../src/providers';
import { lock, onUnlock } from '../src/utils/Locks';

describe('Lock/Unlock System', () => {
    describe('lock function', () => {
        it('should acquire and release a lock', async () => {
            const lockKey = 'test-lock-1';
            
            const unlock = await lock(lockKey);
            
            expect(typeof unlock).toBe('function');
            
            // Release the lock
            unlock();
            
            // Should be able to acquire the same lock again
            const unlock2 = await lock(lockKey);
            expect(typeof unlock2).toBe('function');
            unlock2();
        });

        it('should handle multiple locks with different keys', async () => {
            const lockKey1 = 'test-lock-1';
            const lockKey2 = 'test-lock-2';
            
            const unlock1 = await lock(lockKey1);
            const unlock2 = await lock(lockKey2);
            
            expect(typeof unlock1).toBe('function');
            expect(typeof unlock2).toBe('function');
            
            unlock1();
            unlock2();
        });

        it('should queue multiple requests for the same lock', async () => {
            const lockKey = 'test-lock-queue';
            const executionOrder: number[] = [];
            
            // First lock
            const firstLockPromise = lock(lockKey).then((unlock) => {
                executionOrder.push(1);
                setTimeout(() => {
                    executionOrder.push(2);
                    unlock();
                }, 50);
            });
            
            // Second lock (should wait)
            const secondLockPromise = lock(lockKey).then((unlock) => {
                executionOrder.push(3);
                setTimeout(() => {
                    executionOrder.push(4);
                    unlock();
                }, 25);
            });
            
            // Third lock (should wait for second)
            const thirdLockPromise = lock(lockKey).then((unlock) => {
                executionOrder.push(5);
                unlock();
            });
            
            await Promise.all([firstLockPromise, secondLockPromise, thirdLockPromise]);
            
            expect(executionOrder).toEqual([1, 2, 3, 4, 5]);
        });

        it('should handle lock acquisition timing correctly', async () => {
            const lockKey = 'timing-test';
            let lock1Released = false;
            let lock2Acquired = false;
            
            // First lock
            const unlock1 = await lock(lockKey);
            
            // Start second lock request
            const lock2Promise = lock(lockKey).then((unlock2) => {
                lock2Acquired = true;
                expect(lock1Released).toBe(true); // Should only acquire after first is released
                unlock2();
            });
            
            // Release first lock after a delay
            setTimeout(() => {
                lock1Released = true;
                unlock1();
            }, 30);
            
            await lock2Promise;
            
            expect(lock2Acquired).toBe(true);
        });
    });

    describe('onUnlock function', () => {
        it('should resolve when lock becomes available', async () => {
            const lockKey = 'unlock-test';
            
            // Acquire lock first
            const unlock = await lock(lockKey);
            
            let unlockResolved = false;
            const onUnlockPromise = onUnlock(lockKey).then(() => {
                unlockResolved = true;
            });
            
            // Give onUnlock a moment to register
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(unlockResolved).toBe(false);
            
            // Release the lock
            unlock();
            
            await onUnlockPromise;
            expect(unlockResolved).toBe(true);
        });

        it('should handle AbortSignal', async () => {
            const lockKey = 'abort-test';
            const abortController = new AbortController();
            
            // Acquire lock to block onUnlock
            const unlock = await lock(lockKey);
            
            const onUnlockPromise = onUnlock(lockKey, abortController.signal);
            
            // Abort the signal
            abortController.abort();
            
            // onUnlock should reject due to abort
            await expect(onUnlockPromise).rejects.toThrow('The request was aborted');
            
            unlock();
        });

        it('should resolve immediately if lock is already available', async () => {
            const lockKey = 'immediate-test';
            // onUnlock should resolve immediately since no lock is held
            await onUnlock(lockKey);
        });
    });

    describe('complex scenarios', () => {
        it('should handle mixed lock and onUnlock operations', async () => {
            const lockKey = 'mixed-test';
            const events: string[] = [];
            
            // Start with a lock
            const unlock1Promise = lock(lockKey).then((unlock) => {
                events.push('lock1-acquired');
                return unlock;
            });
            
            // Queue an onUnlock
            onUnlock(lockKey).then(() => {
                events.push('onUnlock-resolved');
            });
            
            // Queue another lock
            const unlock2Promise = lock(lockKey).then((unlock) => {
                events.push('lock2-acquired');
                return unlock;
            });
            
            // Release first lock
            setTimeout(async() => {
                events.push('lock1-released');
                (await unlock1Promise)();
            }, 25);
            setTimeout(async() => {
                events.push('lock2-released');
                (await unlock2Promise)();
            }, 25);
            
            await onUnlock(lockKey);

            expect(events).toEqual([
                'lock1-acquired',
                'lock1-released',
                'onUnlock-resolved',
                'lock2-acquired',
                'lock2-released'
            ]);
        });

        it('should handle concurrent onUnlock requests', async () => {
            const lockKey = 'concurrent-unlock-test';
            
            // Acquire lock
            const unlock = await lock(lockKey);
            
            // Start multiple onUnlock requests
            const onUnlock1 = onUnlock(lockKey);
            const onUnlock2 = onUnlock(lockKey);
            const onUnlock3 = onUnlock(lockKey);
            
            // Release lock
            setTimeout(() => unlock(), 20);
            
            // All should resolve
            const results = await Promise.all([onUnlock1, onUnlock2, onUnlock3]);
            
            expect(results).toHaveLength(3);
        });

        it('should handle rapid lock/unlock cycles', async () => {
            const lockKey = 'rapid-test';
            const results: number[] = [];
            
            const promises = [];
            
            for (let i = 0; i < 5; i++) {
                promises.push(
                    lock(lockKey).then((unlock) => {
                        results.push(i);
                        setTimeout(() => unlock(), 5);
                    })
                );
            }
            
            await Promise.all(promises);
            
            expect(results).toEqual([0, 1, 2, 3, 4]);
        });
    });

    describe('error handling', () => {
        it('should handle lock manager errors gracefully', async () => {
            // Mock lock manager that throws errors
            const errorLockManager = {
                query: () => Promise.reject(new Error('Query failed')),
                request: () => Promise.reject(new Error('Request failed'))
            };
            
            locksProvider.delegate = errorLockManager as any;
            
            await expect(lock('error-test')).rejects.toThrow('Request failed');
            await expect(onUnlock('error-test')).rejects.toThrow('Request failed');
        });
    });
});