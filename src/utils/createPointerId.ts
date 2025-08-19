let index = 0;
function getIndex(): number {
  index += 1;
  return index;
}

const mapPointerToMap = new WeakMap<TPointer, number>();

type TPointer = object;
export function createPointerId(pointer: TPointer): number {
  if (!mapPointerToMap.has(pointer)) {
    mapPointerToMap.set(pointer, getIndex());
  }
  return mapPointerToMap.get(pointer)!;
}