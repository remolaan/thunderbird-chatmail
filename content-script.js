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
          `<div class="chatview-image"><img src="${img.dataUri}" /></div>`
      )
      .join("");
  }

  // Extract just the date part (without time) from a date string
  function extractDatePart(dateStr) {
    if (!dateStr) return "";
    // Try to match common date patterns
    const dayMonthYear = dateStr.match(
      /(\d{1,2}\/\d{1,2}\/\d{2,4})|(\w+,\s+\w+\s+\d{1,2},?\s+\d{4})|(\d{1,2}\s+\w+\s+\d{4})/
    );
    return dayMonthYear ? dayMonthYear[0] : dateStr.split(",")[0];
  }

  // Format a date string into a human-readable day label
  function formatDateLabel(dateStr) {
    if (!dateStr) return null;
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Try to parse the date
    const parsed = new Date(dateStr.replace(/(\d+)(st|nd|rd|th)/, "$1"));
    if (isNaN(parsed.getTime())) return null;

    if (
      parsed.getDate() === today.getDate() &&
      parsed.getMonth() === today.getMonth() &&
      parsed.getFullYear() === today.getFullYear()
    )
      return "Today";
    if (
      parsed.getDate() === yesterday.getDate() &&
      parsed.getMonth() === yesterday.getMonth() &&
      parsed.getFullYear() === yesterday.getFullYear()
    )
      return "Yesterday";

    return parsed.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function render(segments, myEmails) {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.id = "chatview-overlay";

    const list = document.createElement("div");
    list.className = "chatview-list";

    const ordered = [...segments].reverse();
    let lastSender = null;
    let lastDateKey = null;

    for (let idx = 0; idx < ordered.length; idx++) {
      const seg = ordered[idx];
      const isMe =
        !seg.sender ||
        (seg.email && myEmails.includes(seg.email.toLowerCase()));
      const showHeader = seg.sender !== lastSender;
      const isReply = !showHeader && idx > 0;
      lastSender = seg.sender;

      // Date separator
      const dateKey = extractDatePart(seg.date);
      if (dateKey && dateKey !== lastDateKey) {
        const label = formatDateLabel(seg.date) || dateKey;
        const sep = document.createElement("div");
        sep.className = "chatview-date-sep";
        sep.textContent = label;
        list.appendChild(sep);
        lastDateKey = dateKey;
      }

      const row = document.createElement("div");
      row.className =
        "chatview-row " +
        (isMe ? "chatview-me" : "chatview-them") +
        (isReply ? " chatview-reply" : "");

      const bubble = document.createElement("div");
      bubble.className = "chatview-bubble";

      let headerHtml = "";
      if (showHeader) {
        if (isMe) {
          headerHtml = `<div class="chatview-sender chatview-sender-me">You</div>`;
        } else {
          headerHtml = `<div class="chatview-avatar-row"><span class="chatview-avatar">${initials(seg.sender || "?")}</span><span class="chatview-sender">${escapeHtml(seg.sender || "Unknown")}</span></div>`;
        }
      } else if (isReply) {
        headerHtml = `<div class="chatview-reply-indicator">↪ Reply</div>`;
      }

      const imagesHtml = renderImages(seg.inlineImages);

      const metaHtml = seg.date
        ? `<div class="chatview-meta"><span class="chatview-meta-icon">🕐</span> ${escapeHtml(seg.date)}</div>`
        : "";

      bubble.innerHTML =
        headerHtml +
        `<div class="chatview-text">${bodyToHtml(seg.body)}</div>` +
        imagesHtml +
        metaHtml;

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
