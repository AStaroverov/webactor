# Test Plan for src/index.ts Methods

## Core Actor Methods

### createActor (src/createActor.ts:70)
- **Unit Tests:**
  - Should create a mailbox with unique ID
  - Should bind event handlers correctly
  - Should handle message posting and dispatching
  - Should clean up resources on destroy
  - Should throw error for unsupported event types
  - Should add/remove event listeners properly
- **Integration Tests:**
  - Should integrate with message passing system

### connectActorToActor (src/connectActorToActor.ts:4)
- **Unit Tests:**
  - Should connect two actors bidirectionally
  - Should work with Actor and ActorContext types
- **Integration Tests:**
  - Should enable message/errors passing between connected actors
  - Should handle actor destruction gracefully

## Request/Response System

### request (src/request/request.ts:9)
- **Unit Tests:**
  - Should send request with generated ID
  - Should send request with custom ID
  - Should retry on specified interval (default 500ms)
  - Should resolve on successful response
  - Should reject on error events
  - Should reject on messageerror events
  - Should cleanup listeners on completion
  - Should clear retry interval on completion
  - Should handle AbortSignal cancellation
- **Edge Cases:**
  - Network failures during retry
  - Multiple rapid requests
  - Abort during retry cycle

### response (src/request/response.ts:4)
- **Unit Tests:**
  - Should send response with correct event structure
  - Should preserve request origin in response
  - Should generate new event ID for response
  - Should handle MessagePort in response data
  - Should set source property for MessagePort responses
- **Integration Tests:**
  - Should work with request function end-to-end

## Channel System

### openChannel (src/channel/openChannelFactory.ts:8)
- **Unit Tests:**
  - Should create channel with unique ID
  - Should send handshake after receiving MessagePort
  - Should throw error for invalid handshake response
  - Should handle AbortSignal cancellation
  - Should acquire and release locks properly
  - Should clean up on channel loss
  - Should bind port methods correctly
- **Integration Tests:**
  - Should work with supportChannel for full handshake
  - Should handle concurrent channel operations

### supportChannel (src/channel/supportChannelFactory.ts:9)
- **Unit Tests:**
  - Should create MessageChannel for communication
  - Should respond with MessageChannel port
  - Should wait for handshake confirmation
  - Should acquire and release locks properly
  - Should handle channel loss scenarios
  - Should clean up resources on close
- **Integration Tests:**
  - Should complete handshake with openChannel
  - Should handle lock conflicts gracefully

## Worker Integration

### Worker methods (from src/worker/index.ts exports)
- **connectActorToMessagePort:**
  - Should connect actor to MessagePort interface
  - Should handle message routing correctly
  - Should clean up on disconnection
- **connectActorToWorker:**
  - Should establish communication with Web Worker
  - Should handle worker termination gracefully
  - Should support SharedWorker and regular Worker
- **onConnectMessagePort:**
  - Should handle incoming MessagePort connections
  - Should establish bidirectional communication
  - Should manage connection lifecycle

## Test Categories by Priority

### P0 (Critical - Core Functionality)
1. createActor basic functionality
2. createActorFactory basic functionality  
3. request/response round-trip
4. Channel handshake (openChannel + supportChannel)

### P1 (Important - Error Handling)
1. Error propagation in request/response
2. AbortSignal handling
3. Resource cleanup on destruction
4. Lock management in channels

### P2 (Good to Have - Edge Cases)
1. Concurrent operations
2. Memory leak prevention
3. Performance under load
4. Worker integration scenarios

## Test Environment Requirements

### Mocks Needed:
- MessagePort/MessageChannel polyfills
- Web Worker environment simulation  
- AbortSignal/AbortController
- Timer functions (setInterval/clearInterval)
- Lock mechanism

### Test Data:
- Sample Message types
- Mock Actor constructors
- Error scenarios
- Timing test cases

## Coverage Goals
- **Unit Tests:** 90%+ line coverage for each exported function
- **Integration Tests:** Cover all major interaction patterns
- **Error Cases:** Test all error paths and edge conditions
- **Performance Tests:** Ensure no memory leaks or performance regressions