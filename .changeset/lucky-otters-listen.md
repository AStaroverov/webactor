---
'webactor': minor
---

Notice a worker that dies before its handshake answers.

A worker supervisor watches its worker's liveness through a lock whose key it learns from the handshake reply, so the watch can only be armed once that reply arrives. Before it did, the only detector was the worker's own `error` event. A worker that died quietly in that window — killed by the host, or closing itself — left the supervisor holding a dead worker forever: no restart, no error, nothing. A worker that came up but never answered was equally invisible.

`applyWorkerSupervisor` now accepts `getAbortSignal`, a factory consulted once per launch, so the handshake can be bounded the same way every other operation in the library is: `getAbortSignal: () => AbortSignal.timeout(2000)`. It is a factory rather than a plain signal because a supervisor relaunches, and one signal would already be spent by the second worker. Whatever the returned signal aborts with reaches `shouldRetry` as the reason, so an `AbortSignal.timeout` arrives as a `TimeoutError`.

Nothing changes when it is omitted. A deadline tight enough to be useful would misfire on a loaded machine, where a handshake legitimately takes hundreds of milliseconds, so the choice stays with the caller.

A handshake that fails for any reason other than the supervisor's own teardown now reaches the restart decision too. It previously became an unhandled rejection instead, which meant an undeliverable handshake was reported to nobody and restarted nothing.
