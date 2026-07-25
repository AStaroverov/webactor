type SetIntervalFunction = (handler: () => void, timeout?: number, ...args: any[]) => number;
type ClearIntervalFunction = (handle: number) => void;

interface IntervalProvider {
    setInterval: SetIntervalFunction;
    clearInterval: ClearIntervalFunction;
    delegate:
        | {
              setInterval: SetIntervalFunction;
              clearInterval: ClearIntervalFunction;
          }
        | undefined;
}

export const intervalProvider: IntervalProvider = {
    // When accessing the delegate, use the variable rather than `this` so that
    // the functions can be called without being bound to the provider.
    setInterval(...args) {
        return (intervalProvider.delegate?.setInterval || setInterval)(...args);
    },
    clearInterval(handle) {
        return (intervalProvider.delegate?.clearInterval || clearInterval)(handle);
    },
    delegate: undefined,
};

type SetTimeoutFunction = (handler: () => void, timeout?: number, ...args: any[]) => number;
type ClearTimeoutFunction = (handle: number) => void;

interface TimeoutProvider {
    setTimeout: SetTimeoutFunction;
    clearTimeout: ClearTimeoutFunction;
    delegate:
        | {
              setTimeout: SetTimeoutFunction;
              clearTimeout: ClearTimeoutFunction;
          }
        | undefined;
}

export const timeoutProvider: TimeoutProvider = {
    // When accessing the delegate, use the variable rather than `this` so that
    // the functions can be called without being bound to the provider.
    setTimeout(...args) {
        return (timeoutProvider.delegate?.setTimeout || setTimeout)(...args);
    },
    clearTimeout(handle) {
        return (timeoutProvider.delegate?.clearTimeout || clearTimeout)(handle);
    },
    delegate: undefined,
};

type Logger = Pick<typeof console, 'warn' | 'error' | 'info'>;
export const loggerProvider: Logger & { delegate: undefined | Partial<Logger> } = {
    info(...args: any[]) {
        return (loggerProvider.delegate?.info || console.info)(...args);
    },
    warn(...args: any[]) {
        return (loggerProvider.delegate?.warn || console.warn)(...args);
    },
    error(...args: any[]) {
        return (loggerProvider.delegate?.error || console.error)(...args);
    },
    delegate: undefined,
};

export const locksProvider: LockManager & { delegate: undefined | LockManager } = {
    query() {
        const instance = locksProvider.delegate || navigator.locks;
        return instance.query();
    },
    request(a: any, b: any, c?: any) {
        const instance = locksProvider.delegate || navigator.locks;
        return c === undefined ? instance.request(a, b) : instance.request(a, b, c);
    },
    delegate: undefined,
};
