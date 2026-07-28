(function () {
  if (window.__chatViewInstalled) return;
  window.__chatViewInstalled = true;

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

  function initials(name) {
    if (!name) return "?";
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[1] ? parts[1][0] : "")).toUpperCase();
  }

  function renderImages(images) {
    if (!images || images.length === 0) return "";
    return images
      .filter((img) => img.dataUri)
      .map(
        (img) =>
          `<div class="chatview-image"><img src="${img.dataUri}" alt="inline image" /></div>`
      )
      .join("");
  }

  function render(segments, myEmails) {
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
      const showHeader = seg.sender !== lastSender;
      lastSender = seg.sender;

      const row = document.createElement("div");
      row.className = "chatview-row " + (isMe ? "chatview-me" : "chatview-them");

      const bubble = document.createElement("div");
      bubble.className = "chatview-bubble";

      let headerHtml = "";
      if (showHeader) {
        if (isMe) {
          headerHtml = `<div class="chatview-sender chatview-sender-me">You</div>`;
        } else {
          headerHtml = `<div class="chatview-avatar">${initials(seg.sender || "?")}</div><div class="chatview-sender">${escapeHtml(seg.sender || "Unknown")}</div>`;
        }
      }

      const imagesHtml = renderImages(seg.inlineImages);

      bubble.innerHTML =
        headerHtml +
        `<div class="chatview-text">${bodyToHtml(seg.body)}</div>` +
        imagesHtml +
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

  browser.runtime.sendMessage({ type: "chatview-init" }).then((init) => {
    if (init && init.active) {
      render(init.segments, init.myEmails || []);
    }
  }).catch(() => {});

  let wasActive = false;
  setInterval(async () => {
    try {
      const res = await browser.runtime.sendMessage({ type: "chatview-poll" });
      if (res && res.active && !wasActive) {
        render(res.segments, res.myEmails || []);
      } else if (res && !res.active && wasActive) {
        restore();
      }
      wasActive = res ? res.active : false;
    } catch (e) {}
  }, 400);
})();
