export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const throwing = (message: string): never => {
    throw new Error(message);
};
