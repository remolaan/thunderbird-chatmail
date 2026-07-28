/*
 * ChatView parser
 * Turns a raw plain-text email (which may contain a whole reply chain,
 * quoted with ">" or in "On ... wrote:" / Outlook "From:/Sent:/To:" style)
 * into an ordered array of { sender, date, body } objects, newest first
 * matching how Thunderbird shows the thread (top message = newest).
 *
 * This is intentionally heuristic. Email formatting in the wild is messy;
 * the goal is "good enough to be readable", not perfect parsing.
 */

(function (global) {

  // ---- boundary patterns that mark "here begins a quoted/older message" ----

  // "On Mon, Jul 27, 2026 at 10:58 AM Mohamed Zameer <zameer@ctsmith.lk> wrote:"
  const ON_WROTE_RE =
    /^\s*On\s+.{3,80}?\s+wrote:\s*$/i;

  // Outlook style block:
  // From: X <a@b.com>
  // Sent: ...
  // To: ...
  // [Cc: ...]
  // Subject: ...
  const OUTLOOK_HEADER_RE = /^\s*From:\s*.+$/i;

  // "-----Original Message-----"
  const ORIGINAL_MSG_RE = /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/i;

  const BOUNDARY_TEST = (line) =>
    ON_WROTE_RE.test(line) || ORIGINAL_MSG_RE.test(line) || OUTLOOK_HEADER_RE.test(line);

  // ---- noise: disclaimers / confidentiality boilerplate ----
  // Matched as "start of a paragraph to drop" - once matched, we drop lines
  // until the next blank line followed by non-noise content, or end of block.
  const DISCLAIMER_STARTS = [
    /confidentiality notice/i,
    /^disclaimer\s*:/i,
    /this (e-?mail|message|email) and any files transmitted with it are confidential/i,
    /is intended (only |solely )?for the use of the individual/i,
    /if you (have received|are not) the intended recipient/i,
    /this email originated from outside/i,
    /you don'?t often get email from/i,
    /caution:\s*external email/i,
    /although .* (has|have) taken reasonable precautions/i,
    /with effect from .* re-?branded/i,
  ];

  // ---- signature block detection ----
  // Common sign-offs after which contact-card lines usually follow.
  const SIGNOFF_RE =
    /^(regards|best regards|thanks|thank you|thanks in advance|best|sincerely|warm regards|kind regards|cheers)\s*,?\s*$/i;

  const CONTACT_LINE_RE =
    /^(mobile|phone|tel|address|email|web|www\.)/i;

  const SIG_DELIM_RE = /^--\s*$/;

  function splitLines(text) {
    return text.replace(/\r\n/g, "\n").split("\n");
  }

  // Remove disclaimer paragraphs anywhere in a block of lines.
  function stripDisclaimers(lines) {
    const out = [];
    let dropping = false;
    for (const line of lines) {
      if (!dropping && DISCLAIMER_STARTS.some((re) => re.test(line))) {
        dropping = true;
        continue;
      }
      if (dropping) {
        if (line.trim() === "") {
          dropping = false; // paragraph ended
        }
        continue;
      }
      out.push(line);
    }
    return out;
  }

  // Cut off a trailing signature block ("--", "Regards, Name" + contact lines).
  function stripSignature(lines) {
    // The explicit "--" delimiter is an unambiguous, standardized signature
    // separator (RFC-ish convention). If present anywhere, it always wins,
    // regardless of any sign-off phrase ("Regards,") that appears after it.
    for (let i = 0; i < lines.length; i++) {
      if (SIG_DELIM_RE.test(lines[i].trim())) {
        return lines.slice(0, i);
      }
    }

    // Otherwise, find the LAST plausible signature start so we don't
    // accidentally truncate a message that legitimately contains the word
    // "regards" mid-paragraph. We look from the bottom up for a sign-off
    // followed mostly by short contact-ish lines.
    let cut = lines.length;

    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (SIGNOFF_RE.test(line)) {
        // check that most of what follows looks like a contact card / name,
        // not further paragraph content
        const rest = lines.slice(i + 1).map((l) => l.trim()).filter(Boolean);
        const contactish = rest.filter(
          (l) => CONTACT_LINE_RE.test(l) || l.split(" ").length <= 4
        );
        if (rest.length === 0 || contactish.length >= rest.length * 0.6) {
          cut = i;
          break;
        }
      }
    }
    return lines.slice(0, cut);
  }

  function cleanBody(rawLines) {
    let lines = stripDisclaimers(rawLines);
    lines = stripSignature(lines);
    // collapse 3+ blank lines, trim
    const text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return text;
  }

  // Try to pull a sender name + date out of a boundary line, e.g.:
  // "On Mon, Jul 27, 2026 at 10:58 AM Mohamed Zameer <zameer@ctsmith.lk> wrote:"
  function parseOnWroteLine(line) {
    const m = line.match(
      /^\s*On\s+(.+?\bat\s+\d{1,2}:\d{2}\s*(?:AM|PM)?),?\s+([A-Z][^<>]+?)\s*<([^>]+)>\s*wrote:\s*$/i
    );
    if (m) {
      return { date: m[1].trim(), sender: m[2].trim(), email: m[3].trim() };
    }
    // fallback: no clean name/email split
    const m2 = line.match(/^\s*On\s+(.+?)\s+wrote:\s*$/i);
    if (m2) {
      return { date: m2[1].trim(), sender: null, email: null };
    }
    return { date: null, sender: null, email: null };
  }

  // Parse an Outlook-style header block starting at index i (line matching
  // OUTLOOK_HEADER_RE). Returns { sender, email, date, nextIndex }.
  function parseOutlookHeaderBlock(lines, i) {
    let sender = null, email = null, date = null;
    let j = i;
    for (; j < lines.length && j < i + 6; j++) {
      const l = lines[j];
      let m;
      if ((m = l.match(/^\s*From:\s*(.+)$/i))) {
        const fm = m[1].match(/^(.*?)<([^>]+)>/);
        if (fm) {
          sender = fm[1].trim();
          email = fm[2].trim();
        } else {
          sender = m[1].trim();
        }
      } else if ((m = l.match(/^\s*Sent:\s*(.+)$/i))) {
        date = m[1].trim();
      } else if (/^\s*(To|Cc|Subject):/i.test(l)) {
        continue;
      } else if (l.trim() === "") {
        j++;
        break;
      } else {
        break;
      }
    }
    return { sender, email, date, nextIndex: j };
  }

  /**
   * Split raw plain-text email content into an array of
   * { sender, email, date, body } segments, ordered newest-first
   * (matching the order they appear in the raw text, which for
   * top-posted chains is newest-first).
   */
  function parseChain(rawText) {
    const lines = splitLines(rawText || "");
    const segments = [];

    let currentMeta = { sender: null, email: null, date: null };
    let bodyLines = [];
    let i = 0;

    function pushSegment() {
      const body = cleanBody(bodyLines);
      if (body.trim() !== "") {
        segments.push({ ...currentMeta, body });
      }
      bodyLines = [];
    }

    while (i < lines.length) {
      const line = lines[i];

      if (ON_WROTE_RE.test(line)) {
        pushSegment();
        currentMeta = parseOnWroteLine(line);
        i++;
        continue;
      }

      if (ORIGINAL_MSG_RE.test(line)) {
        pushSegment();
        currentMeta = { sender: null, email: null, date: null };
        i++;
        continue;
      }

      if (OUTLOOK_HEADER_RE.test(line)) {
        pushSegment();
        const parsed = parseOutlookHeaderBlock(lines, i);
        currentMeta = {
          sender: parsed.sender,
          email: parsed.email,
          date: parsed.date,
        };
        i = parsed.nextIndex;
        continue;
      }

      // Strip a single leading ">" quote marker per level, if present,
      // so old deeply-nested quotes still read as normal text.
      const dequoted = line.replace(/^(\s*>)+\s?/, "");
      bodyLines.push(dequoted);
      i++;
    }
    pushSegment();

    return segments;
  }

  global.ChatViewParser = { parseChain };
})(typeof self !== "undefined" ? self : this);
