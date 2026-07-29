# webactor

## 1.1.0

### Minor Changes

- [#15](https://github.com/AStaroverov/webactor/pull/15) [`529f588`](https://github.com/AStaroverov/webactor/commit/529f588d37934c621868c74399ea62688b9bfaba) Thanks [@AStaroverov](https://github.com/AStaroverov)! - Report a lost message instead of dropping it silently.

  A message that a transport refuses now produces a `messageerror` envelope carrying the transport's own error, so it stops being invisible. The report is routed to whoever was waiting for the message that failed: forward along its route when the envelope was already routed, such as a response or a channel handshake, and back along its checkpoints when it was still on its way out. Either way a pending `request` rejects with the real cause instead of retrying until its `abortSignal` fires. Transports implementing the platform `messageerror` event now feed it into the same channel, so a failed deserialization reaches the endpoint as well.

  Keep it distinct from `error`: an `error` envelope still means the endpoint itself died and is what supervisors act on, while `messageerror` says one message was lost and the endpoint is fine.

  New public surface: `EnvelopeType.MessageError`, the `MessageErrorEnvelope` type, and the `Reasons.Undeliverable` / `Reasons.Undeserializable` fallbacks.

  Also fixes a listener in an envelope emitter being able to swallow a whole dispatch: a throwing listener used to reject the internal dispatch promise as an unhandled rejection and skip every listener after it. It is now rethrown as an ordinary uncaught error, exactly like a throwing DOM event listener, and the remaining listeners still receive the envelope.
