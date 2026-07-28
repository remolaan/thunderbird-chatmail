# ChatMail for Thunderbird

Transform email threads into clean, WhatsApp-style chat conversations. Strips signatures, disclaimers, quoted headers, and reply boilerplate — showing only the actual messages in chronological order with sender names and timestamps.

![preview](https://img.shields.io/badge/Thunderbird-128%2B-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## Features

- **Chat bubble view** — each message in a thread rendered as a speech bubble
- **Sent/received alignment** — your messages on the right, others on the left
- **Thread reconstruction** — splits long reply chains into individual messages, oldest at top
- **Signature stripping** — removes `--` delimited sig blocks and common sign-offs
- **Disclaimer removal** — strips confidentiality notices, "Caution: External Email" banners, and similar boilerplate
- **Quote collapsing** — strips `>` markers and `On ... wrote:` / `-----Original Message-----` headers
- **One-click toggle** — switch between chat view and original rendering per message
- **No data leaves your machine** — everything is parsed locally

## Installation

### Temporary (for testing)

1. Open Thunderbird → **Tools → Developer Tools → Debug Add-ons**
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from this project
4. Open any email and click the chat bubble icon in the message toolbar

### Permanent

1. Zip the contents of this folder (with `manifest.json` at the root)
2. Thunderbird → **Add-ons Manager → gear icon → Install Add-on From File**
3. Select the ZIP

## Usage

1. Select an email in your inbox
2. Click the chat bubble icon in the message header toolbar
3. The message pane switches to a chat view with all thread messages shown chronologically
4. Click **Show original** at the top to return to Thunderbird's normal rendering

The toggle state resets per message — each email starts in original view.

## How it works

```
Email selected → background.js fetches full message via messages.getFull()
  → parser.js splits the raw text into segments (one per email in the chain)
  → content-script.js renders segments as chat bubbles
  → signatures, disclaimers, and quoted headers are stripped automatically
```

## Project structure

```
thunderbird-chatmail/
├── manifest.json          Extension manifest (Manifest V3)
├── background.js          Message fetching, state management, toggle handler
├── parser.js              Email chain parser — splits, strips, cleans
├── content-script.js      Chat bubble DOM builder (injected into message pane)
├── chatview.css           WhatsApp-style styling
├── icons/                 Toolbar button icons (16/32/64px)
└── preview.html           Standalone demo (no Thunderbird needed)
```

## Development

### Loading after changes

1. Make your edits
2. In Thunderbird's **Debug Add-ons** page, click **Reload** next to ChatMail
3. Re-open the message and click the toggle

### Modifying the parser

Signature and disclaimer patterns are in `parser.js`:
- `DISCLAIMER_STARTS` — regex array matching boilerplate opening lines
- `SIGNOFF_RE` — regex matching sign-off phrases (Regards, Thanks, etc.)
- `SIG_DELIM_RE` — the `-- ` signature delimiter

### Preview without Thunderbird

Open `preview.html` in any browser — it shows a side-by-side comparison using real sample email data.

## License

MIT
