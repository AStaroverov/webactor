export function stringify<O, F>(obj: O, fallback: F): string | F {
    try {
        return JSON.stringify(obj, null, 2);
    } catch (err) {
        return fallback;
    }
}
