---
'webactor': minor
---

Report a lost message instead of dropping it silently.

A message that a transport refuses now produces a `messageerror` envelope carrying the transport's own error, so it stops being invisible. When the failed envelope was routed — a response, a channel handshake — the report inherits that route and travels to whoever was waiting, and a pending `request` rejects with the real cause instead of retrying until its `abortSignal` fires. Transports implementing the platform `messageerror` event now feed it into the same channel, so a failed deserialization reaches the endpoint as well.

Keep it distinct from `error`: an `error` envelope still means the endpoint itself died and is what supervisors act on, while `messageerror` says one message was lost and the endpoint is fine.

New public surface: `EnvelopeType.MessageError`, the `MessageErrorEnvelope` type, and the `Reasons.Undeliverable` / `Reasons.Undeserializable` fallbacks.

Also fixes a listener in an envelope emitter being able to swallow a whole dispatch: a throwing listener used to reject the internal dispatch promise as an unhandled rejection and skip every listener after it. It is now rethrown as an ordinary uncaught error, exactly like a throwing DOM event listener, and the remaining listeners still receive the envelope.
