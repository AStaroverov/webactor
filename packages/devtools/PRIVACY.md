# Privacy policy — webactor devtools

Last updated: 27 July 2026

## The short version

webactor devtools collects nothing, stores nothing and sends nothing anywhere. It has no server, no
analytics, no telemetry and no account. Everything it shows exists only while you are looking at it.

## What the extension can see

Only on a site you have explicitly allowed. A fresh install has no access to any page: the manifest
declares no content script and no host permission, so until you allow an origin — from the toolbar
popup or from the bar inside the panel — the extension cannot read anything at all. Each grant covers
one origin and can be withdrawn at any time from the same popup, or from the extension's card in
`chrome://extensions`.

On an allowed page, the extension reads what the [webactor](https://github.com/AStaroverov/actorr)
library reports about itself:

- names, kinds and lifecycle of actors, supervisors and channels;
- which of them are connected, and in which thread each one lives;
- for each envelope: time, sender, receiver, type, size, and whether it was delivered;
- if payload capture is left on, a bounded preview of the envelope's payload.

It does not read the page's DOM, cookies, storage, form fields or network traffic. Pages that do not
use webactor produce nothing to read.

## Where that data goes

Page → the extension's content script → the extension's service worker → the DevTools panel you have
open. All of it is in memory, in your own browser. The extension makes no network requests of any
kind — there is no code in it that can.

Nothing is written to disk. Closing DevTools, closing the tab, or reloading the page discards
everything captured so far. The only thing that persists between sessions is the list of origins you
allowed, which Chrome itself stores as the extension's permissions.

## Payloads

Envelope payloads are the one place where your application's own data becomes visible, and it stays
on screen in your DevTools like any other debugger value. If you would rather not see it at all, turn
the **payloads** checkbox off in the panel toolbar: the recorder then keeps only the shape and the
size of each payload.

Because nothing leaves the machine, an allowed origin is still the boundary that matters — do not
allow sites whose data you are not entitled to look at.

## Data sharing

None. The extension does not sell data, does not transfer it to third parties, and does not use it
for anything beyond showing it to you in the panel. There are no third-party services involved at
runtime.

## Source

The extension is open source: <https://github.com/AStaroverov/actorr/tree/main/packages/devtools>.
Everything described here is verifiable in that code.

## Contact

Open an issue at <https://github.com/AStaroverov/actorr/issues>.
