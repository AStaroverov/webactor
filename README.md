# webactor

**Actor-model architecture for the browser.** One programming model for every boundary in your app — components, tabs, and Web Workers — built on plain message passing.

```ts
import { createActor, request, response } from 'webactor';

const math = createActor('math', (ctx) => {
  ctx.addEventListener('message', (e) => {
    if (e.data.type === 'sum') response(ctx, e, e.data.a + e.data.b);
  });
});

math.launch();

const res = await request(math, { type: 'sum', a: 2, b: 3 });
console.log(res.data); // 5
```

---

## Why actors, why now

For a decade the frontend default was one big shared-memory blob: a global store, synchronous function calls, everything reaching into everything. It works until the app gets big — then coupling, race conditions, and "who mutated this?" take over.

The backend solved this long ago by going **distributed**: small services that own their state and talk only through messages. That model is having a second life in the **AI era** — an app is increasingly a swarm of semi-independent units (agents, workers, streams, tabs) that run concurrently, fail independently, and must be supervised. Shared-memory thinking doesn't survive that. Message passing does.

The browser already ships the primitives for it — Web Workers, `SharedWorker`, `MessagePort`, `postMessage` — but they're low-level, inconsistent, and painful to wire up. **webactor is the missing layer on top:** it gives you one uniform actor model whether two units live in the same thread, two tabs, or two threads.

- **Isolated state.** Each actor owns its data. The only way in or out is a message. No shared mutable globals.
- **Location transparency.** The same `connect` / `request` / `channel` API works in-thread and across a Worker boundary. Move an actor into a worker without touching its logic.
- **Fault tolerance.** Supervisors restart crashed actors and dead workers — Erlang/OTP's "let it crash" on the client.
- **No shared-memory races.** Everything is a message, delivered asynchronously, one at a time.

If you believe the future of software is small units talking over messages, the web shouldn't be the exception.

---

## Install

```bash
npm install webactor
# or: pnpm add webactor
```

Zero runtime dependencies. Ships ESM + TypeScript types.

> Some features use browser APIs that need a polyfill outside the browser (Node/tests): the **Web Locks API** (`navigator.locks`) for channels & worker supervisors. See [documentation.md → Environments & providers](./documentation.md#environments--providers).

---

## Core idea in one picture

An **actor** is an isolated unit with a mailbox. You never call it — you send it an **envelope** (a typed message). Actors are wired together with **connections**. Once connected, three communication patterns cover almost everything:

| Pattern | Function | Use it for |
|---|---|---|
| **Fire-and-forget** | `postMessage` | events, notifications, state broadcasts |
| **Request / response** | `request` / `response` | "ask and await an answer", RPC-style calls |
| **Channel** | `openChannel` / `supportChannel` | a dedicated, disconnect-aware session between two actors |

The same three patterns work identically across a Worker boundary.

---

## 60-second tour

### Two actors talking

```ts
import { createActor, connectActors, ActorContext } from 'webactor';

// A stateful business actor — owns the counter, no one else can touch it.
const counter = createActor('counter', (ctx: ActorContext) => {
  let value = 0;
  ctx.addEventListener('message', (e) => {
    if (e.data.type === 'inc') value++;
    if (e.data.type === 'dec') value--;
    ctx.postMessage({ type: 'value', value }); // broadcast new state
  });
});

// A UI actor — renders, never owns business state.
const ui = createActor('ui', (ctx: ActorContext) => {
  ctx.addEventListener('message', (e) => {
    if (e.data.type === 'value') render(e.data.value);
  });
  document.querySelector('#inc')!.addEventListener('click', () =>
    ctx.postMessage({ type: 'inc' })
  );
});

const disconnect = connectActors(ui, counter);
ui.launch();
counter.launch();

// later: disconnect(); ui.close(); counter.close();
```

### Move an actor into a Worker — same code

`counter` doesn't care where it lives. Put it in a `SharedWorker` (shared across every tab) and connect the whole thing with a dense network:

```ts
// main.ts
import { createDenseNetwork } from 'webactor';
import { createUIActor } from './ui-actor';

const worker = new SharedWorker(new URL('./server.worker.ts', import.meta.url), { type: 'module' });
const network = createDenseNetwork(createUIActor(), worker); // auto-detects the worker
network.launch();
```

```ts
// server.worker.ts
import { createDenseNetwork, useContextMessagePort } from 'webactor';
import { createCounterActor } from './counter-actor';

createDenseNetwork(useContextMessagePort(), createCounterActor()).launch();
```

The UI actor's `request(...)` / `postMessage(...)` calls are unchanged. Routing across the thread boundary is automatic.

### Keep it alive — supervision

```ts
import { applyActorSupervisor, Reasons } from 'webactor';

const supervised = applyActorSupervisor(
  () => createCounterActor(),
  { shouldRetry: (reason) => reason !== Reasons.Close } // restart on crash, not on intentional close
);
supervised.launch(); // if the inner actor throws/closes unexpectedly, it's rebuilt
```

There's an `applyWorkerSupervisor` too — it detects a dead/crashed Worker (via the Web Locks API) and respawns it.

---

## What's in the box

- `createActor` / `createActorFactory` — build isolated units.
- `connectActors` / `connectActorToWorker` / `connectActorToMessagePort` — wire units across any boundary.
- `createDenseNetwork` — full-mesh several actors and workers at once.
- `createRetranslator` — a transparent relay node for building hub/bridge topologies.
- `request` / `response` — awaitable RPC with automatic back-routing across the mesh.
- `openChannel` / `supportChannel` — dedicated, disconnect-aware pipes (great for per-client sessions).
- `applyActorSupervisor` / `applyWorkerSupervisor` — "let it crash" restart strategies.
- `useContextMessagePort` / `onConnectMessagePort` — the Worker/`SharedWorker` side of the wire.
- Envelopes, transferables, pluggable providers (timers, locks, logger) for testing & non-browser runtimes.

Full API, internals, routing model, and patterns: **[documentation.md](./documentation.md)**.

---

## When to use it (and when not)

**Great fit**

- Apps with heavy `Worker` / `SharedWorker` use, or that want to move work off the main thread.
- Multi-tab coordination and real-time sync through a `SharedWorker`.
- Clear separation of UI ↔ domain logic, offline-first, or long-lived background processing.
- Anything that needs fault isolation and automatic restart of subsystems.

**Probably overkill**

- "Call one function in a worker and get a result." Reach for [Comlink](https://github.com/GoogleChromeLabs/comlink) — it's a thinner RPC wrapper.
- Small apps where a component tree + a state manager already fit comfortably.

webactor is a *model*, not just an RPC shim: you adopt actors, envelopes, and supervision. That's a real mental investment — worth it when the payoff (isolation, fault tolerance, location transparency) matters.

### vs. Comlink

| | webactor | Comlink |
|---|---|---|
| Model | Actor / message passing | Proxy-based RPC |
| In-thread + cross-worker with one API | ✅ | Worker-focused |
| Request/response | ✅ | ✅ (as proxied calls) |
| Fire-and-forget broadcasts | ✅ | Awkward |
| Dedicated sessions (channels) | ✅ | Manual |
| Supervision / restart | ✅ | ❌ |
| Multi-node topologies (mesh, relay) | ✅ | ❌ |
| Bundle / surface | Larger, opinionated | Tiny, minimal |

---

## Status

`1.0.0` · single-maintainer project · MIT-style usage. The API described here is exercised by the test suite (`npm test`). Feedback and issues welcome on the [repository](https://github.com/AStaroverov/actorr).
