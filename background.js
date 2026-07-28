const chatViewOn = new Map();
const parsedCache = new Map();

async function registerMessageDisplayScripts() {
  try {
    await messenger.scripting.messageDisplay.registerScripts([
      {
        id: "chatview-content",
        js: ["content-script.js"],
        css: ["chatview.css"],
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
  const inlineImages = [];

  function walk(part) {
    if (!part) return;
    if (part.contentType && part.contentType.startsWith("text/plain") && part.body) {
      plain = plain || part.body;
    }
    if (part.contentType && part.contentType.startsWith("text/html") && part.body) {
      html = html || part.body;
    }
    if (part.contentType && part.contentType.startsWith("image/") && part.partName) {
      const rawCid = part.headers && part.headers["content-id"];
      if (rawCid) {
        const cidStr = Array.isArray(rawCid) ? rawCid[0] : rawCid;
        inlineImages.push({
          partName: part.partName,
          contentType: part.contentType,
          contentId: (cidStr + "").replace(/^</, "").replace(/>$/, "").trim(),
        });
      }
    }
    if (part.parts) {
      for (const p of part.parts) walk(p);
    }
  }
  walk(full);

  for (const img of inlineImages) {
    try {
      const file = await messenger.messages.getAttachmentFile(messageId, img.partName);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      img.dataUri = `data:${img.contentType};base64,${btoa(binary)}`;
    } catch (e) {
      console.warn("ChatView: failed to load image", img.partName, e);
    }
  }

  if (plain) return { plain, inlineImages };
  if (html) {
    const stripped = html
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
    return { plain: stripped, inlineImages };
  }
  return { plain: "", inlineImages: [] };
}

async function parseMessage(messageId) {
  if (parsedCache.has(messageId)) return parsedCache.get(messageId);
  const { plain, inlineImages } = await getRawText(messageId);
  const segments = ChatViewParser.parseChain(plain);
  if (inlineImages.length > 0 && segments.length > 0) {
    segments[0].inlineImages = inlineImages;
  }
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

async function buildRenderData(tabId) {
  try {
    const isOn = chatViewOn.get(tabId);
    if (!isOn) return { active: false };
    const msg = await getDisplayedMessage(tabId);
    if (!msg) return { active: false };
    const segments = await parseMessage(msg.id);
    const myEmails = await getMyEmails();
    return { active: true, segments, myEmails };
  } catch (e) {
    console.error("ChatView: buildRenderData error:", e);
    return { active: false };
  }
}

messenger.runtime.onMessage.addListener(async (message, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return false;

  if (message.type === "chatview-init") {
    const isOn = chatViewOn.get(tabId);
    if (!isOn) return { active: false, tabId };
    const data = await buildRenderData(tabId);
    return { ...data, tabId };
  }

  if (message.type === "chatview-poll") {
    return buildRenderData(tabId);
  }

  if (message.type === "chatview-user-restored") {
    chatViewOn.set(tabId, false);
    messenger.messageDisplayAction.setTitle({ tabId, title: "Toggle Chat View" });
    return {};
  }

  return false;
});

messenger.messageDisplayAction.onClicked.addListener(async (tab) => {
  const isOn = chatViewOn.get(tab.id);
  chatViewOn.set(tab.id, !isOn);
  messenger.messageDisplayAction.setTitle({
    tabId: tab.id,
    title: isOn ? "Toggle Chat View" : "Show Original",
  });
});
