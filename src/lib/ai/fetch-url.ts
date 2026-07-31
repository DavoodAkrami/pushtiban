import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// ---------------------------------------------------------------------------
// Fetch a public web page and reduce it to plain text for ingestion.
//
// This runs a URL the *owner* supplies through our server, so it is a textbook
// SSRF sink: without the guards below, a business could point it at
// 169.254.169.254 or an internal host and read the response back out of the
// knowledge base. Every hop is validated, and redirects are followed by hand so
// each new location is validated too.
// ---------------------------------------------------------------------------

const MAX_REDIRECTS = 3;
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 10_000;

export type FetchUrlResult =
  | { ok: true; text: string; title: string }
  | { ok: false; error: string };

/** Private, loopback, link-local and other non-routable ranges. */
const isBlockedIpv4 = (ip: string): boolean => {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast + reserved
  return false;
};

const isBlockedIpv6 = (ip: string): boolean => {
  const v = ip.toLowerCase().replace(/^\[|\]$/g, "");
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("fe80") || v.startsWith("fc") || v.startsWith("fd")) return true;
  // IPv4-mapped (::ffff:10.0.0.1) inherits the IPv4 rules.
  const mapped = v.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedIpv4(mapped[1]);
  return false;
};

const isBlockedAddress = (ip: string): boolean =>
  isIP(ip) === 6 ? isBlockedIpv6(ip) : isBlockedIpv4(ip);

/** Validates scheme, port and every resolved address for one URL. */
const assertPublicUrl = async (raw: string): Promise<URL | null> => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Only the default web ports — no probing of internal services on odd ports.
  if (url.port && url.port !== "80" && url.port !== "443") return null;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost")) return null;
  if (host.endsWith(".internal") || host.endsWith(".local")) return null;

  // A literal IP is checked directly; a name is resolved and every A/AAAA
  // record must be public, so a DNS entry pointing inward is rejected.
  if (isIP(host)) {
    return isBlockedAddress(host) ? null : url;
  }

  try {
    const records = await lookup(host, { all: true });
    if (!records.length) return null;
    if (records.some((r) => isBlockedAddress(r.address))) return null;
  } catch {
    return null;
  }

  return url;
};

/** Strips scripts, styles and tags, leaving readable text. */
const htmlToText = (html: string): string =>
  html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const htmlTitle = (html: string): string => {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? htmlToText(match[1]).slice(0, 200).trim() : "";
};

/**
 * Fetches `rawUrl` and returns its readable text. Redirects are resolved
 * manually so each hop is re-validated — following them automatically would
 * let a public URL bounce the request to a private address.
 */
export const fetchUrlAsText = async (
  rawUrl: string
): Promise<FetchUrlResult> => {
  let current = rawUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const url = await assertPublicUrl(current);
    if (!url) {
      return {
        ok: false,
        error: "این نشانی قابل خواندن نیست؛ فقط آدرس‌های عمومی http و https پذیرفته می‌شوند.",
      };
    }

    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // Some sites serve a bare 403 without a UA.
          "user-agent": "PushtibanBot/1.0 (+knowledge ingest)",
          accept: "text/html,text/plain;q=0.9,*/*;q=0.1",
        },
      });
    } catch {
      return { ok: false, error: "دریافت صفحه ناموفق بود؛ نشانی را بررسی کنید." };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { ok: false, error: "صفحه به نشانی نامعتبری هدایت شد." };
      }
      current = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        error: `صفحه با خطای ${response.status} پاسخ داد.`,
      };
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!/text\/html|text\/plain|application\/xhtml/i.test(contentType)) {
      return {
        ok: false,
        error: "فقط صفحه‌های متنی و HTML قابل خواندن هستند.",
      };
    }

    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) {
      return { ok: false, error: "این صفحه بزرگ‌تر از حد مجاز است." };
    }

    const raw = await response.text();
    if (raw.length > MAX_BYTES) {
      return { ok: false, error: "این صفحه بزرگ‌تر از حد مجاز است." };
    }

    const text = htmlToText(raw);
    if (!text) {
      return { ok: false, error: "متنی در این صفحه پیدا نشد." };
    }

    return { ok: true, text, title: htmlTitle(raw) || url.hostname };
  }

  return { ok: false, error: "تعداد هدایت‌های صفحه بیش از حد مجاز است." };
};
