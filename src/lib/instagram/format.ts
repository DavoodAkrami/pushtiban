// ---------------------------------------------------------------------------
// Markdown → Instagram plain text.
//
// The Telegram counterpart of this file converts to an HTML subset because
// Telegram renders one. Instagram renders nothing: a direct message is plain
// text, and "**قیمت**" reaches the customer with the asterisks still on it.
//
// So the job here is the opposite one — strip the markup rather than translate
// it, while keeping everything the markup was carrying. A link is the case that
// matters: "[لیست قیمت](https://…)" must not become the bare word "لیست", or
// the customer loses the address entirely.
// ---------------------------------------------------------------------------

/** Instagram's cap on a single text message. Telegram's is 4096. */
export const INSTAGRAM_MESSAGE_MAX_LENGTH = 1_000;

const SAFE_URL_RE = /^(?:https?:\/\/|mailto:)/i;

/** Strip emphasis markers, leaving the words. */
const stripEmphasis = (value: string) =>
  value
    // Bold before italic, so "**x**" is not read as an italic "*" pair.
    .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, "$1")
    .replace(/__(?=\S)([\s\S]*?\S)__/g, "$1")
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, "$1")
    .replace(/(?<![*\w])\*(?=\S)([^*\n]*\S)\*(?![*\w])/g, "$1")
    .replace(/(?<![_\w])_(?=\S)([^_\n]*\S)_(?![_\w])/g, "$1");

/**
 * Convert a model-authored Markdown reply into the plain text Instagram shows.
 *
 * Headings become their own line, bullets get a «• » prefix, code fences lose
 * their backticks, and a link becomes «label — url» so the address survives.
 * A link whose label already *is* the url collapses back to just the url rather
 * than repeating it twice.
 */
export const markdownToPlainText = (markdown: string): string => {
  const source = markdown
    .replace(/\r\n?/g, "\n")
    // Fenced code: drop the fence and any language tag, keep the body.
    .replace(
      /```[a-zA-Z0-9_+#-]*[ \t]*\n?([\s\S]*?)```/g,
      (_match, body: string) => body.replace(/\n+$/, "")
    )
    .replace(/`([^`\n]+)`/g, "$1");

  const inline = (rawLine: string) =>
    stripEmphasis(
      rawLine.replace(
        /\[([^\]\n]*)\]\(\s*([^\s)]+)\s*\)/g,
        (match, label: string, url: string) => {
          if (!SAFE_URL_RE.test(url)) return match;
          const text = stripEmphasis(label).trim();
          return !text || text === url ? url : `${text} — ${url}`;
        }
      )
    );

  const out: string[] = [];

  for (const line of source.split("\n")) {
    // Blockquote markers carry no meaning without rendering; the words do.
    const quote = line.match(/^ {0,3}>\s?(.*)$/);
    if (quote) {
      out.push(inline(quote[1]));
      continue;
    }

    if (/^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/.test(line)) continue; // rule

    const heading = line.match(/^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/);
    if (heading) {
      out.push(inline(heading[1]));
      continue;
    }

    const bullet = line.match(/^(\s*)[-*+][ \t]+(.*)$/);
    if (bullet) {
      out.push(`${bullet[1]}• ${inline(bullet[2])}`);
      continue;
    }

    out.push(inline(line));
  }

  const text = out.join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // Truncate by code point, not by UTF-16 unit: Persian text is safe either
  // way, but an emoji cut in half is not.
  return Array.from(text).slice(0, INSTAGRAM_MESSAGE_MAX_LENGTH).join("");
};
