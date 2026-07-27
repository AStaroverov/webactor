# Chrome Web Store submission

Everything the listing form asks for, written out so an upload is copy-and-paste. Keep this file in
step with the manifest: if a permission changes, its justification here changes with it.

## Item

| Field             | Value                                                                        |
| ----------------- | ---------------------------------------------------------------------------- |
| Name              | webactor devtools                                                            |
| Category          | Developer Tools                                                              |
| Language          | English                                                                      |
| Visibility        | Public                                                                       |
| Distribution      | All regions                                                                  |
| Package           | `pnpm --filter webactor-devtools zip` → `webactor-devtools-<version>.zip`    |
| Privacy policy    | https://github.com/AStaroverov/actorr/blob/main/packages/devtools/PRIVACY.md |
| Homepage          | https://github.com/AStaroverov/actorr/tree/main/packages/devtools            |
| Support           | https://github.com/AStaroverov/actorr/issues                                 |

## Short description

> Inspect webactor apps in DevTools: the live actor graph across threads, every envelope, and the channels between them.

## Detailed description

> webactor devtools adds a **webactor** tab to Chrome DevTools showing the live actor graph of an
> application built with the webactor library: who exists, who is connected to whom, and every
> envelope that travels between them — including the actors living in dedicated and shared workers.
>
> **The graph.** One node per actor, retranslator and supervisor, laid out so that actors of the same
> thread settle together and cross-thread connections stand out as dashed edges. Nodes flash as they
> work: magenta when sending, cyan when receiving, red when an envelope was dropped by a route
> mismatch. Nothing is animated along the edges — real traffic is orders of magnitude faster than any
> animation, and a single envelope would appear in every segment of its chain at once.
>
> **The traffic.** Select an actor for its own history, or read every envelope in one global list,
> with time, both ends, type, size and a payload inspector. One filter narrows whichever list is open:
> bare words match the payload, peer names or envelope type, while `from:` `to:` `peer:` `type:`
> `thread:` and `dropped` narrow to one field.
>
> **The scope.** Large applications are mostly noise for the question at hand, so a regular expression
> over actor names plus a picker decide who is on the graph at all. Envelopes with one end outside the
> set are kept, since that is exactly the traffic crossing the boundary you drew.
>
> **Watched fields.** Press `+` next to any field of a payload to pin that field and its value: every
> envelope carrying it joins the watch list, the nodes on its route keep a bright ring and everything
> else fades back, so one family of envelopes is readable at a glance.
>
> **Channels.** Every `openChannel`/`supportChannel` pair appears as one row — both halves, the actor
> and thread each lives in, its state and its traffic — paired by the channel id even across a worker
> boundary. Closed and failed channels linger with their reason.
>
> **Nothing is injected until you say so.** A fresh install has no access to any site. Allow the one
> you are debugging from the toolbar icon, and withdraw it just as easily. Nothing is stored, nothing
> is sent anywhere: the data lives in your DevTools and dies with it.
>
> The extension is open source, and so is the library it inspects:
> https://github.com/AStaroverov/actorr

## Single purpose

> To show, inside Chrome DevTools, the actor graph and message flow of a web application built with
> the webactor library. Everything the extension does serves that one view: reading the events the
> library reports on a site the user has allowed, and drawing them in its panel.

## Permission justifications

**`scripting`**

> The extension registers its two content scripts for the origins the user has allowed, instead of
> declaring them statically for every site. One of them must run in the MAIN world at document_start,
> before the application's own code, because it installs the hook the webactor library looks for when
> it creates its first actor; a script injected later would miss the entire startup of the app.

**`activeTab`**

> The toolbar popup needs the origin of the tab in front of the user, so that it can ask for
> permission to exactly that one site. Without activeTab the extension would have to hold broad host
> access merely to read the current URL, which is what this design avoids.

**Host permissions (optional: `http://*/*`, `https://*/*`)**

> A debugger cannot know in advance which site it will be pointed at, so the pattern is broad — but
> nothing is granted at install time. Access is requested per origin, through Chrome's own prompt,
> when the developer allows the site they are debugging, and can be withdrawn from the same popup.
> On a site that was never allowed the extension runs no code at all.

**Remote code**

> No. Every line the extension runs is contained in the uploaded package; it loads no script, no
> stylesheet and no data from any network location, and makes no network requests of any kind.

## Data usage disclosures

Answer the certification form as follows.

| Category                       | Answer | Why                                                                     |
| ------------------------------ | ------ | ----------------------------------------------------------------------- |
| Personally identifiable info   | No     |                                                                         |
| Health information             | No     |                                                                         |
| Financial and payment info     | No     |                                                                         |
| Authentication information     | No     |                                                                         |
| Personal communications        | No     |                                                                         |
| Location                       | No     |                                                                         |
| Web history                    | No     |                                                                         |
| User activity                  | No     |                                                                         |
| **Website content**            | Yes    | Envelope payloads of the inspected app are read and shown in the panel. |

Alongside it:

> The extension handles website content only on sites the user has explicitly allowed, only for the
> duration of a DevTools session, and only to display it in its own panel. Nothing is stored and
> nothing is transmitted: the extension makes no network requests. Payload capture can be switched
> off in the panel, leaving only the shape and size of each message.

All three certifications hold: the data is **not** sold or transferred to third parties, is **not**
used for any purpose unrelated to the item's single purpose, and is **not** used to determine
creditworthiness or for lending.

## Assets

| Asset          | Requirement                | File                                         |
| -------------- | -------------------------- | -------------------------------------------- |
| Store icon     | 128×128 PNG                | `public/img/icon-128.png`                    |
| Screenshot     | 1280×800, 24-bit, no alpha | `assets/screenshot.png`                      |
| Icon source    | —                          | `assets/icon.png`                            |

A small promo tile (440×280) is optional and not made yet.

## Steps

1. Register at <https://chrome.google.com/webstore/devconsole> — one-off 5 USD fee, 2FA required on
   the Google account, and publisher contact email verified.
2. `pnpm --filter webactor-devtools zip`, then **New item** → upload the archive.
3. Fill the listing from the sections above, attach the icon and the screenshot.
4. Fill Privacy practices from the disclosures above, with the privacy policy URL.
5. Submit. Expect a slower review than usual: an extension that can be granted access to any site is
   reviewed by hand.

## After the first upload

- Bump the version in `packages/devtools/package.json` before every new archive — the manifest takes
  it from there, and the store refuses a version it has already accepted.
- To keep the unpacked build and the published item on the same extension id, copy the `key` field
  the console shows into `manifest.json`. Only worth doing if something starts depending on the id.
