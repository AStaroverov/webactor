import { createRandomNumber } from './common';

const mapPointerToMap = new WeakMap<TPointer, number>();

type TPointer = object;
export function createPointerId(pointer: TPointer): number {
    if (!mapPointerToMap.has(pointer)) {
        mapPointerToMap.set(pointer, createRandomNumber());
    }
    return mapPointerToMap.get(pointer)!;
}
