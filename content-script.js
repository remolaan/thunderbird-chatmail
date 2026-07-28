(function () {
  if (window.__chatViewInstalled) return;
  window.__chatViewInstalled = true;

  console.log("ChatView: content script loaded");

  let overlay = null;

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function bodyToHtml(body) {
    return body
      .split(/\n{2,}/)
      .map(
        (para) =>
          "<p>" + escapeHtml(para).replace(/\n/g, "<br>") + "</p>"
      )
      .join("");
  }

  function render(segments, myEmails) {
    console.log("ChatView: render called, segments:", segments.length);
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "chatview-overlay";

    const list = document.createElement("div");
    list.className = "chatview-list";

    const ordered = [...segments].reverse();

    let lastSender = null;
    for (const seg of ordered) {
      const isMe =
        !seg.sender ||
        (seg.email && myEmails.includes(seg.email.toLowerCase()));

      const row = document.createElement("div");
      row.className = "chatview-row " + (isMe ? "chatview-me" : "chatview-them");

      const showHeader = seg.sender !== lastSender;
      lastSender = seg.sender;

      const bubble = document.createElement("div");
      bubble.className = "chatview-bubble";

      let headerHtml = "";
      if (showHeader && !isMe) {
        headerHtml = `<div class="chatview-sender">${escapeHtml(
          seg.sender || "Unknown"
        )}</div>`;
      }

      bubble.innerHTML =
        headerHtml +
        `<div class="chatview-text">${bodyToHtml(seg.body)}</div>` +
        `<div class="chatview-meta">${escapeHtml(seg.date || "")}</div>`;

      row.appendChild(bubble);
      list.appendChild(row);
    }

    const toolbar = document.createElement("div");
    toolbar.className = "chatview-toolbar";
    toolbar.innerHTML = `<button id="chatview-show-original">Show original</button>`;

    overlay.appendChild(toolbar);
    overlay.appendChild(list);

    document.documentElement.appendChild(overlay);
    document.body.classList.add("chatview-hidden-body");

    document
      .getElementById("chatview-show-original")
      .addEventListener("click", () => {
        restore();
        browser.runtime.sendMessage({ type: "chatview-user-restored" }).catch(() => {});
      });
  }

  function restore() {
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    document.body.classList.remove("chatview-hidden-body");
  }

  // -----------------------------------------------------------------------
  // On initial load: ask background if chat view is already on
  // -----------------------------------------------------------------------
  browser.runtime.sendMessage({ type: "chatview-init" }).then((init) => {
    console.log("ChatView: init response:", JSON.stringify(init));
    if (init && init.active) {
      render(init.segments, init.myEmails || []);
    }
  }).catch((err) => {
    console.error("ChatView: init error:", err);
  });

  // -----------------------------------------------------------------------
  // Poll for state changes (toggle button clicks)
  // -----------------------------------------------------------------------
  let wasActive = false;
  setInterval(async () => {
    try {
      const res = await browser.runtime.sendMessage({ type: "chatview-poll" });
      console.log("ChatView: poll response:", JSON.stringify(res), "wasActive:", wasActive);
      if (res && res.active && !wasActive) {
        render(res.segments, res.myEmails || []);
      } else if (res && !res.active && wasActive) {
        restore();
      }
      wasActive = res ? res.active : false;
    } catch (e) {
      console.error("ChatView: poll error:", e);
    }
  }, 400);
})();
