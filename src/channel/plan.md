# Channel Refactoring Plan: One-to-Many → One-to-One

## Current State Analysis
- Каналы поддерживают модель "один ко многим" (один opener может создать множество каналов)
- Используется `Map<string, Function>` для хранения множественных dispose функций
- Канал идентифицируется по `channelId` и `routePassed`

## Target State
- Каналы должны работать по модели "один к одному" (как request/response)
- Один вызов `openChannel` создает ровно один канал
- Один вызов `supportChannel` поддерживает ровно один канал

### New Interface Requirements
- `openChannel()` должен возвращать `Promise<EnvelopeTransmitter & { close(): void }>`
- `supportChannel()` должен возвращать `Promise<EnvelopeTransmitter & { close(): void }>`
- Результат расширяется методом `close()` для раннего закрытия канала
- Убираем callback-based API, переходим на Promise-based
- **Убираем createSubscribe** - заменяем на прямую работу с `addEventListener('message'/'messageerror')`

## Implementation Steps

### 1. Remove createSubscribe Pattern
- [ ] Replace `createSubscribe(transmitter)` calls with direct `transmitter.addEventListener('message', ...)`
- [ ] Add error handling with `transmitter.addEventListener('messageerror', ...)`
- [ ] Update filtering logic to work with native message events
- [ ] Remove createSubscribe imports from both factory files

### 2. Fix Type Errors and Naming
- [ ] Fix `OpenChanelContext` → `OpenChannelContext` in types.ts
- [ ] Fix `SupportChanelContext` → `SupportChannelContext` in types.ts  
- [ ] Fix `transmitter: T` → `transmitter: E` in supportChannelFactory.ts
- [ ] Update interface definitions to match actual usage

### 3. Refactor openChannelFactory to Promise-based
- [ ] Remove callback-based `onOpen` parameter
- [ ] Return `Promise<EnvelopeTransmitter & { close(): void }>`
- [ ] Remove `Map<string, Function>` for multiple dispose functions
- [ ] Remove `closeAllChannels()` function (not needed for one-to-one)
- [ ] Simplify to single channel handling:
  - Single `dispose` function instead of map
  - Single `channelId` handling
  - Direct close logic without iteration

### 4. Refactor supportChannelFactory to Promise-based
- [ ] Remove callback-based `onOpen` parameter  
- [ ] Return `Promise<EnvelopeTransmitter & { close(): void }>`
- [ ] Simplify to single channel handling
- [ ] Fix interface consistency

### 5. Update Type Definitions
- [ ] Remove old context interfaces (`OpenChannelContext`, `SupportChannelContext`)
- [ ] Create new return type: `ChannelTransmitter = EnvelopeTransmitter & { close(): void }`
- [ ] Update function signatures to return `Promise<ChannelTransmitter>`

### 6. Channel Lifecycle Simplification
- [ ] One opener → one supporter relationship
- [ ] Simplified handshake process
- [ ] Clear cleanup on channel close

### 7. Testing and Validation
- [ ] Ensure request/response pattern still works
- [ ] Verify single channel constraint
- [ ] Test error scenarios and cleanup

## Key Changes Summary
1. **Remove createSubscribe pattern** - replace with `addEventListener('message'/'messageerror')`
2. **Change to Promise-based API** - return `Promise<EnvelopeTransmitter & { close(): void }>`
3. **Remove callback-based onOpen** parameters
4. **Remove multi-channel support** from openChannelFactory
5. **Fix type errors** and naming inconsistencies  
6. **Simplify dispose logic** - single function instead of map
7. **Create unified return type** - `ChannelTransmitter` with close method
8. **Add error handling** - support for messageerror events
9. **Maintain request-like behavior** - one call, one result