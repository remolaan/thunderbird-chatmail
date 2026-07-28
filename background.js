// Per-tab state: is chat view currently on?
const chatViewOn = new Map();
const parsedCache = new Map();

// ---------------------------------------------------------------------------
// Register the chat-view content script + CSS so Thunderbird injects them
// into every opened message's content document automatically.
// ---------------------------------------------------------------------------
async function registerMessageDisplayScripts() {
  try {
    await messenger.scripting.messageDisplay.registerScripts([
      {
        id: "chatview-content",
        js: [{ file: "content-script.js" }],
        css: [{ file: "chatview.css" }],
        runAt: "document_idle",
      },
    ]);
  } catch (err) {
    console.warn("ChatView: registerScripts skipped:", err && err.message);
  }
}
registerMessageDisplayScripts();

async function getRawText(messageId) {
  const full = await messenger.messages.getFull(messageId);
  let plain = null;
  let html = null;

  function walk(part) {
    if (!part) return;
    if (part.contentType && part.contentType.startsWith("text/plain") && part.body) {
      plain = plain || part.body;
    }
    if (part.contentType && part.contentType.startsWith("text/html") && part.body) {
      html = html || part.body;
    }
    if (part.parts) {
      for (const p of part.parts) walk(p);
    }
  }
  walk(full);

  if (plain) return plain;
  if (html) {
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
  }
  return "";
}

async function parseMessage(messageId) {
  if (parsedCache.has(messageId)) return parsedCache.get(messageId);
  const rawText = await getRawText(messageId);
  const segments = ChatViewParser.parseChain(rawText);
  parsedCache.set(messageId, segments);
  return segments;
}

async function getMyEmails() {
  const accounts = await messenger.accounts.list();
  const emails = [];
  for (const acct of accounts) {
    for (const id of acct.identities || []) {
      if (id.email) emails.push(id.email.toLowerCase());
    }
  }
  return emails;
}

async function getDisplayedMessage(tabId) {
  const list = await messenger.messageDisplay.getDisplayedMessages(tabId);
  if (!list || !list.messages || list.messages.length === 0) return null;
  return list.messages[0];
}

// ---------------------------------------------------------------------------
// Respond to content script queries (sent via runtime.sendMessage)
// ---------------------------------------------------------------------------
messenger.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === "chatview-init") {
    const tabId = sender.tab?.id;
    if (!tabId) return { active: false, tabId: null };
    const isOn = chatViewOn.get(tabId);
    if (!isOn) return { active: false, tabId };
    const msg = await getDisplayedMessage(tabId);
    if (!msg) return { active: false, tabId };
    const segments = await parseMessage(msg.id);
    const myEmails = await getMyEmails();
    return { active: true, tabId, segments, myEmails };
  }

  if (message.type === "chatview-fetch") {
    const tabId = sender.tab?.id;
    if (!tabId) return { active: false };
    const isOn = chatViewOn.get(tabId);
    if (!isOn) return { active: false };
    const msg = await getDisplayedMessage(tabId);
    if (!msg) return { active: false };
    const segments = await parseMessage(msg.id);
    const myEmails = await getMyEmails();
    return { active: true, segments, myEmails };
  }

  if (message.type === "chatview-user-restored") {
    const tabId = sender.tab?.id;
    if (tabId) {
      chatViewOn.set(tabId, false);
      messenger.messageDisplayAction.setTitle({ tabId, title: "Toggle Chat View" });
    }
  }

  return false;
});

// ---------------------------------------------------------------------------
// Toggle button in the message display toolbar
// ---------------------------------------------------------------------------
messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  const isOn = chatViewOn.get(tab.id);
  if (isOn) {
    chatViewOn.set(tab.id, false);
    messenger.messageDisplayAction.setTitle({ tabId: tab.id, title: "Toggle Chat View" });
    await messenger.storage.local.set({ [`chatview-cmd-${tab.id}`]: "restore" });
  } else {
    const msg = await getDisplayedMessage(tab.id);
    if (!msg) return;
    chatViewOn.set(tab.id, true);
    messenger.messageDisplayAction.setTitle({ tabId: tab.id, title: "Show Original" });
    await messenger.storage.local.set({ [`chatview-cmd-${tab.id}`]: "render" });
  }
});

// Reset state whenever a (potentially different) message is displayed
messenger.messageDisplay.onMessagesDisplayed.addListener((tab) => {
  chatViewOn.set(tab.id, false);
  messenger.messageDisplayAction.setTitle({ tabId: tab.id, title: "Toggle Chat View" });
});
