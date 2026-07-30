// ---------------------------------------------------------------------------
// Markdown → Telegram HTML.
//
// Models answer in Markdown (**bold**, bullet lists, links). Telegram renders
// none of that as plain text, and its own MarkdownV2 mode is too brittle to
// hand raw model output to (one unescaped "." rejects the whole message). So
// we convert to Telegram's HTML subset ourselves and escape everything else.
//
// Supported by Telegram HTML: b, i, u, s, code, pre, a, blockquote,
// tg-spoiler. NOT supported: headings and real lists — headings become bold
// lines and bullets become "• " prefixes.
// ---------------------------------------------------------------------------

export const TELEGRAM_MESSAGE_MAX_LENGTH = 4096;

/** Private-use sentinels around held fragments; models never emit these. */
const HOLD_OPEN = "\uE000";
const HOLD_CLOSE = "\uE001";
const HOLD_RE = new RegExp(`${HOLD_OPEN}(\\d+)${HOLD_CLOSE}`, "g");

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Only these schemes become links — never javascript: or data:. */
const SAFE_URL_RE = /^(?:https?:\/\/|tg:\/\/|mailto:)/i;

const emphasize = (value: string) =>
  value
    // Bold before italic so "**x**" is not read as an italic "*" pair.
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "<b>$1</b>")
    .replace(/__(?=\S)([\s\S]*?\S)__/g, "<b>$1</b>")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "<s>$1</s>")
    .replace(/(?<![*\w])\*(?=\S)([^*\n]*\S)\*(?![*\w])/g, "<i>$1</i>")
    .replace(/(?<![_\w])_(?=\S)([^_\n]*\S)_(?![_\w])/g, "<i>$1</i>");

/**
 * Convert a model-authored Markdown reply into the HTML subset Telegram
 * renders. The result is safe to send with `parse_mode: "HTML"`: every piece
 * of the original text is escaped, and only tags we generate survive.
 */
export const markdownToTelegramHtml = (markdown: string): string => {
  const held: string[] = [];
  const hold = (html: string) => {
    held.push(html);
    return `${HOLD_OPEN}${held.length - 1}${HOLD_CLOSE}`;
  };

  // Code first: its contents must not go through any other transform.
  const source = markdown
    .replace(/\r\n?/g, "\n")
    // Defensive: never let input text impersonate a held fragment.
    .replace(/[\uE000\uE001]/g, "")
    .replace(
      /```([a-zA-Z0-9_+#-]*)[ \t]*\n?([\s\S]*?)```/g,
      (_match, language: string, body: string) =>
        hold(
          `<pre><code${
            language ? ` class="language-${escapeHtml(language)}"` : ""
          }>${escapeHtml(body.replace(/\n+$/, ""))}</code></pre>`
        )
    )
    .replace(/`([^`\n]+)`/g, (_match, body: string) =>
      hold(`<code>${escapeHtml(body)}</code>`)
    );

  // Links are held whole so later emphasis passes cannot touch the href.
  const inline = (rawLine: string) => {
    const escaped = escapeHtml(rawLine);
    const linked = escaped.replace(
      /\[([^\]\n]*)\]\(\s*([^\s)]+)\s*\)/g,
      (match, label: string, url: string) => {
        if (!SAFE_URL_RE.test(url)) return match;
        const href = url.replace(/"/g, "&quot;");
        return hold(`<a href="${href}">${emphasize(label) || href}</a>`);
      }
    );
    return emphasize(linked);
  };

  const out: string[] = [];
  let quoted: string[] | null = null;
  const flushQuote = () => {
    if (!quoted) return;
    out.push(`<blockquote>${quoted.join("\n")}</blockquote>`);
    quoted = null;
  };

  for (const line of source.split("\n")) {
    // Block markers are matched on the raw line — escaping first would turn
    // a blockquote's ">" into "&gt;".
    const quote = line.match(/^ {0,3}>\s?(.*)$/);
    if (quote) {
      (quoted ??= []).push(inline(quote[1]));
      continue;
    }
    flushQuote();

    if (/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) continue; // rule

    const heading = line.match(/^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (heading) {
      out.push(`<b>${inline(heading[1])}</b>`);
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+][ \t]+(.*)$/);
    if (bullet) {
      out.push(`${bullet[1]}• ${inline(bullet[2])}`);
      continue;
    }

    out.push(inline(line));
  }
  flushQuote();

  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .replace(HOLD_RE, (_match, index: string) => held[Number(index)] ?? "");
};
