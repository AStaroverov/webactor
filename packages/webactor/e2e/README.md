# Load Test

Stress/load testing for the `webactor` library, driven by Playwright. The scenarios run in a real Chromium page against the library sources (`../../src` via vite alias), so no build step is needed.

## Scenarios

Scenarios come in two flavors: **in-page** (actors talk through the library's envelope emitters — microtask dispatch, no serialization; measures the library's logic) and **real transport** (messages cross real `MessageChannel` ports or worker thread boundaries — structured clone, macrotask delivery; measures the transport under load).

| Scenario | Transport | What it stresses | Success criteria |
| --- | --- | --- | --- |
| `actor-lifecycle` | in-page | 10 waves × 1000 actors: create, ping-pong messages, destroy | all replies delivered, creation > 2000 actors/sec |
| `channel-thrashing` | in-page | 200 actors, 5 rounds of chaotic `connectActors`/disconnect (600 created / 400 destroyed per round) | delivery count exactly matches live connections, zero after full disconnect |
| `message-flooding` | in-page | 10 producers × 20 consumers all-to-all, 10 bursts × 100 messages | zero lost deliveries, > 10k deliveries/sec |
| `port-flooding` | MessageChannel | same flooding topology, but every producer→consumer link goes through a real `MessageChannel` (200 channels) | zero lost deliveries, > 5k deliveries/sec |
| `worker-flooding` | worker threads | 8 dedicated workers, 5000 messages × 128B payload each, delivery verified via FIFO stats report | zero lost messages, > 5k messages/sec |
| `worker-chain` | worker threads | chain of 8 relay workers bridged with `connectTransmitters`, 200 messages traverse all hops; tracks `__checkpoints` growth per hop | all messages complete the chain, checkpoint route stays bounded |
| `worker-churn` | worker threads | 3 rounds × 8 dedicated workers spawned/killed, 100 echo round-trips each | every echo comes back, spawn-to-first-echo p95 < 10s |
| `channel-storm` | MessageChannel + Web Locks | 5 waves × 100 concurrent `openChannel`/`supportChannel` with echo exchange, then 200 opens aborted mid-handshake | every channel opens and echoes, every abort settles, zero `openChannel`/`supportChannel` locks left held |
| `actor-supervisor-storm` | in-page | 20 × `applyActorSupervisor`, each actor crashes itself 50 times (1000 restarts) | exact restart count, zero alive actors after storm, no relaunch after `close()` |
| `worker-supervisor-storm` | worker threads | 3 × `applyWorkerSupervisor` over a worker that throws on boot, 8 restarts each | exact spawn count, no respawn after `close()` |
| `memory-leak` | in-page | 6 cycles of actor churn with forced GC and heap measurement | post-GC heap growth < 8MB between first and last cycle |

One more case lives only in the Playwright suite (it needs several real tabs): **shared worker multi-tab** — 6 pages connect to one `SharedWorker` hub, flood it, verify every tab receives every broadcast, then half the tabs are killed abruptly and the survivors must keep exact delivery counts.

Each scenario returns a `ScenarioResult` with counters, timing summaries (avg/p95/max) and soft errors.

## Run

```bash
pnpm install
pnpm exec playwright install chromium

pnpm test          # headless run, metrics printed per scenario
pnpm test:headed   # same but with a visible browser
```

Playwright starts the vite dev server itself. Chromium is launched with `--js-flags=--expose-gc` and `--enable-precise-memory-info` so the memory scenario can force GC and read precise heap sizes.

## Interactive dashboard

```bash
pnpm dev
```

Open the printed URL — every scenario is available as a button, results are printed as JSON on the page. Scenarios are also scriptable from the browser console:

```js
await window.__loadTest.run('message-flooding', { producers: 50, bursts: 20 });
```

The same API is what the Playwright suite calls through `page.evaluate`, so any config override can be passed from a test too.
