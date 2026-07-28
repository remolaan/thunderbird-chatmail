# ChatView for Thunderbird — Project Guide

This doc is written so you can come back in a week, paste it (or just the
relevant section) back to Claude, and say "modify X" without re-explaining
the whole project.

---

## 1. What this is

A Thunderbird extension (WebExtension, Manifest V3) that takes a long,
quoted, signature-and-disclaimer-heavy email chain and re-renders it as
WhatsApp-style chat bubbles — one bubble per message, cleanest text only,
sender + timestamp, oldest at top.

There are **two separate things** in this project:

| Thing | What it is | How to run it |
|---|---|---|
| `preview.html` | A **static, standalone HTML file** — no Thunderbird needed. Shows what the chat view looks like using a real parsed sample. | Just open the file in any browser (double-click it, or drag into a browser tab). |
| `chatview-extension/` (the folder with `manifest.json`) | The **real Thunderbird extension** — actually parses whatever email you have open in Thunderbird. | Load it into Thunderbird as a temporary add-on (steps below). |

`preview.html` is a demo/mockup only — it does not talk to Thunderbird. The
actual extension is what you'd use day-to-day.

---

## 2. How to run the preview (`preview.html`)

1. Download `preview.html` (or find it in the outputs from Claude).
2. Double-click it, or open your browser and drag the file in, or
   `File → Open` and select it.
3. You'll see two tabs: **"Chat view (after)"** and **"Original (before)"**.
   Click between them to compare.

That's it — no install, no Thunderbird, nothing to configure. It's just a
frozen example so you can see the styling and layout before installing the
real thing.

To regenerate it with different sample text, see **Section 5, Recipe D**.

---

## 3. How to run the real extension in Thunderbird

1. Unzip `chatview-extension.zip` somewhere on disk (e.g. Desktop).
2. Open Thunderbird.
3. Go to **Tools → Developer Tools → Debug Add-ons**.
   (Depending on your Thunderbird version this may be under
   **Tools → Add-ons and Themes → gear icon ⚙ → Debug Add-ons**.)
4. Click **Load Temporary Add-on…**.
5. In the file picker, navigate into the unzipped `chatview-extension`
   folder and select **`manifest.json`**.
6. Open any email. Look at the message header toolbar (near the reply/
   forward/more icons) — there's a new chat-bubble icon.
7. Click it → the message pane is replaced with the chat view.
8. Click **"Show original"** at the top of the chat view to go back to
   normal — nothing is deleted, only hidden.

**Important:** "Load Temporary Add-on" only lasts until Thunderbird
restarts. You'll need to redo step 3–5 each time you reopen Thunderbird,
*unless* you install it permanently (next section).

### Installing permanently

1. Make sure everything you want is inside the `chatview-extension` folder,
   with `manifest.json` at the top level.
2. Zip the folder's *contents* (not the folder itself) so `manifest.json`
   is at the root of the zip.
3. In Thunderbird: **Add-ons Manager (Tools → Add-ons and Themes) → gear
   icon ⚙ → Install Add-on From File** → select your zip.
4. Thunderbird will likely warn it's from an unverified source — that's
   expected for a self-built extension; allow it.

---

## 4. Project map — what each file does

```
chatview-extension/
├── manifest.json        Extension config: permissions, toolbar button, which
│                         scripts load. This is the file you point Thunderbird
│                         at when loading the add-on.
├── background.js         Runs always in the background. Listens for the
│                         toolbar button click, fetches the currently open
│                         message's raw text via Thunderbird's API, calls the
│                         parser, then injects the chat view into the message
│                         pane.
├── parser.js             The actual "brain" — pure JavaScript, no Thunderbird
│                         APIs. Takes raw email text in, returns an array of
│                         { sender, email, date, body } message objects.
│                         THIS IS THE FILE YOU'LL EDIT MOST OFTEN.
├── content-script.js     Runs inside the message display window. Receives
│                         the parsed messages from background.js and builds
│                         the actual chat-bubble HTML/DOM, plus the
│                         "Show original" button.
├── chatview.css          All the visual styling (bubble colors, layout,
│                         WhatsApp-style look). Used by both the real
│                         extension and preview.html.
├── icons/                Toolbar button icons (16/32/64px).
└── README.md             Original quick-start notes.

preview.html              Standalone demo, not part of the extension proper.
                          Built by hand-running parser.js against a sample
                          email and embedding the output + chatview.css.
real-sample.txt           The actual sample email chain used to build the
                          preview and to test the parser.
```

### How data flows when you click the toolbar button

```
[You click toolbar button]
        ↓
background.js: messenger.messageDisplay.getDisplayedMessage()
        ↓
background.js: messenger.messages.getFull() → raw MIME, extracts text/plain
        ↓
background.js: ChatViewParser.parseChain(rawText)  ← parser.js
        ↓
background.js: injects chatview.css + content-script.js into the message tab
        ↓
background.js: sends { segments, myEmails } to content-script.js
        ↓
content-script.js: builds the bubble DOM, hides the original message,
                    shows the "Show original" toggle
```

---

## 5. Common modification recipes

For all of these: just paste the relevant recipe name + what you want
changed, and Claude can make the edit directly in `parser.js`,
`chatview.css`, etc.

### Recipe A — "Add a new disclaimer pattern it's not catching"

Open `parser.js`, find the `DISCLAIMER_STARTS` array (~line 37). Each entry
is a regex matching the *first line* of a boilerplate paragraph to delete.
Add a new line like:

```js
/your new disclaimer phrase here/i,
```

**To ask Claude:** paste the exact disclaimer paragraph text that isn't
being stripped, and say "add this to DISCLAIMER_STARTS in parser.js."

### Recipe B — "It's not detecting a sign-off/signature style my company uses"

Open `parser.js`, find `SIGNOFF_RE` (~line 52) — it matches lines like
"Regards," "Thanks," "Best," etc. Add more phrases to the alternation:

```js
const SIGNOFF_RE =
  /^(regards|best regards|thanks|thank you|thanks in advance|best|sincerely|warm regards|kind regards|cheers|YOUR_NEW_PHRASE)\s*,?\s*$/i;
```

**To ask Claude:** paste a sample signature block, say "extend SIGNOFF_RE
to catch this."

### Recipe C — "Change bubble colors / layout"

Everything visual lives in `chatview.css`. Key selectors:

- `.chatview-me .chatview-bubble` — your own messages (currently light
  green `#d9fdd3`)
- `.chatview-them .chatview-bubble` — everyone else's messages (currently
  white `#ffffff`)
- `.chatview-sender` — the sender name label color
- `.chatview-meta` — the timestamp text

**To ask Claude:** "change my bubble color to blue" or "make the sender
name bold and black instead of blue."

### Recipe D — "Regenerate preview.html with a different sample email"

Preview.html was built by:
1. Running `parser.js` against a `.txt` file of raw email content
   (`real-sample.txt`).
2. Turning the resulting segments into bubble `<div>`s.
3. Embedding those divs + `chatview.css` into a single HTML file with a
   tab toggle for before/after.

**To ask Claude:** paste a new raw email chain (like you did originally)
and say "regenerate preview.html with this instead."

### Recipe E — "Reformat the timestamp" (e.g. show `10:58 AM` instead of
`Mon, Jul 27, 2026 at 10:58 AM`)

This needs a small change in `parser.js` (or a post-processing step in
`content-script.js`) to actually parse the date string into a `Date` object
and reformat it with `toLocaleTimeString()`/`toLocaleDateString()`. Since
date formats vary a lot between email clients, this is a good one to hand to
Claude directly with 2-3 real examples of the date strings you're seeing.

### Recipe F — "Auto-enable chat view instead of manual toggle"

In `background.js`, the `messenger.messageDisplay.onMessageDisplayed`
listener currently just resets the toggle state. Change it to call
`enableChatView(tab)` automatically instead of waiting for a click — worth
doing once you trust the parser not to mangle messages you actually want to
read in original form.

### Recipe G — "It's mangling a specific real email"

Best format to hand back to Claude: paste the **raw plain-text body** of
that one email (View → Message Source, or copy-paste the body), plus a
one-line description of what looks wrong ("it's not splitting message 3 and
4" / "it left in a phone number" / etc.).

---

## 5.5 Changelog

**v0.1.1** — Fixed "Toggle chat view does nothing." Two bugs:
1. Content/CSS injection was using the generic `scripting.executeScript`/
   `insertCSS`, which targets the tab's outer document — not the embedded
   document a message is actually rendered in. Fixed by registering the
   content script via `messenger.scripting.messageDisplay.registerScripts()`
   at startup instead, which Thunderbird auto-injects into every opened
   message.
2. `background.js` used the Manifest V2 API names
   (`messageDisplay.getDisplayedMessage`, `onMessageDisplayed`), which don't
   exist in MV3 — the click handler was failing silently. Fixed to use
   `getDisplayedMessages()` (plural, returns a `MessageList`) and
   `onMessagesDisplayed`.

If toggle ever "does nothing" again: open **Tools → Developer Tools →
Error Console** (or the Debug Add-ons page's "Inspect" button) right after
clicking the button — any thrown error from `background.js` will show up
there and is the fastest way to diagnose it.

## 6. Known limitations (as of this build)

- Signature/disclaimer stripping is pattern-based, not AI-based — it will
  miss patterns it hasn't seen. Recipes A/B above are how you extend it.
- HTML-only emails (no `text/plain` part) get a crude tag-strip fallback in
  `background.js`'s `getRawText()` — no rich formatting, inline images, or
  attachments show up in chat view.
- "Me" vs "them" bubble side is decided by matching each segment's parsed
  sender email against your Thunderbird account identities
  (`messenger.accounts.list()`). If a segment has no detectable sender
  (usually the top/newest message), it's treated as "me."
- No settings/options page yet — all tuning happens by editing `parser.js`
  or `chatview.css` directly.

---

## 7. Quick reference — starting a new session with Claude

Paste this file (or just link back to the conversation if memory/history
is on), plus whichever Recipe applies, plus any raw email text involved.
That's enough context for a clean continuation.
