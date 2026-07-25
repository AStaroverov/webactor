# webactor-devtools

A Chrome DevTools panel that shows the live actor graph of a [webactor](../webactor) application:
who is connected to whom, across every thread, and every envelope that travels between them.

## What you get

- **Graph** — one node per actor, retranslator, supervisor and thread port; edges are real
  `connectTransmitters` connections. Nodes are grouped into columns by thread, so a page with three
  workers reads as four columns. Cross-thread edges are dashed.
- **Message flow** — envelopes animate along the edge they travel on, coloured by envelope type
  (`message`, `close`, `error`). Undelivered envelopes (dropped by a route mismatch) are drawn in red.
- **Per-actor history** — select an actor to get its incoming/outgoing envelopes with timestamps,
  peers, payload size and a collapsible payload inspector.
- **Watch** — the second tab of the right pane is a filtered view of *all* traffic, showing where each
  envelope came from and where it went. Bare words match the payload, the peer names or the envelope
  type; `from:` `to:` `peer:` `type:` `thread:` narrow to one field and `dropped` keeps only envelopes
  a route mismatch threw away. Terms combine with AND, matching envelopes are drawn larger and ringed
  as they travel the graph, and clicking either endpoint jumps to that actor.
- **Lifecycle** — created / launched / closed state per node, plus a restart counter for supervisors.
- **Workers** — actors living in dedicated workers and shared workers appear in the same graph. No
  setup in the worker: the page-side recorder attaches a private `MessageChannel` over the
  connection the app already has, and the worker relays its events back.

## Install (unpacked)

```bash
pnpm --filter webactor-devtools build     # → packages/devtools/dist
```

Then in Chrome: `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
select `packages/devtools/dist`. Open DevTools on a page that uses webactor and pick the
**webactor** tab. Reload the page once after installing — the hook has to be in place before the
app creates its first actor.

For iterating on the panel itself use `pnpm --filter webactor-devtools dev` (esbuild watch) and hit
the reload button on the extension card.

## How it is wired

```
page (MAIN world)                     extension
  webactor recorder ──► __WEBACTOR_DEVTOOLS_HOOK__  (hook.js, document_start)
                              │ window.postMessage
                              ▼
                        content.js (ISOLATED world)
                              │ runtime port
                              ▼
                        background.js ──► panel.js  (per inspected tab)
```

`hook.js` only installs the sink; all recording lives in webactor itself
(`packages/webactor/src/devtools`). Without the extension the global hook is absent, the recorder
never activates and the instrumentation is a handful of `if (devtools.active)` checks.

Worker threads cannot be reached by content scripts, so they are attached from the page instead:
the active thread sends a `__webactor_devtools__` envelope carrying a transferred `MessagePort` over
an existing connection. That envelope type is not in any `connectTransmitters` type list, so the
application never sees it.

Relays form a **tree rooted at the page**, which matters for correctness:

- a thread holding a *local* sink (the extension hook, or `enableDevtools()`) is the root and never
  accepts an upstream;
- every other thread accepts exactly **one** upstream and may collect from many children, so chains
  `page → worker → worker` relay hop by hop;
- channel `MessagePort`s are excluded from bridging, so a channel never adds a second bridge between
  two threads;
- every relayed batch carries the threads it has visited and is refused if it comes back around.

Without those rules two threads holding two ports between them (an actor transport plus a channel)
could each end up relaying to the other, and the relayed batches would circulate forever.

## Using the recorder without the extension

```ts
import { enableDevtools, getDevtoolsSnapshot } from 'webactor';

const stop = enableDevtools((events) => console.log(events));
// …
console.log(getDevtoolsSnapshot()); // { thread, nodes, links, messages }
stop();
```

`setDevtoolsOptions({ capturePayload, maxMessages, previewDepth, flushInterval, maxBatch })` tunes
capture; `capturePayload: false` records only shape and size.

## Tests

```bash
pnpm --filter webactor-devtools test
```

- `tests/panel.spec.ts` drives the built panel with a stubbed `chrome` API: graph building,
  message list, direction filters, payload inspector, toolbar commands, canvas paint.
- `tests/extension.spec.ts` loads `dist` as a real unpacked extension and asserts the service
  worker registers, the MAIN-world hook lands before page scripts, the recorder auto-activates,
  and events reach the background worker.

Cross-thread capture is covered on the library side by
`packages/webactor/e2e/tests/devtools.spec.ts`.
