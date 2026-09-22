import { robotsAllows } from "../robots";

const robotsCache = new Map<string, string>();

export function userAgent(contact: string | null): string {
  const mail = contact ? ` (+${contact})` : "";
  return `OffshoreAllianceMobilisation/1.0${mail}`;
}

export async function fetchText(
  url: string,
  opts: { contact?: string | null; timeoutMs?: number; accept?: string; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: boolean; status: number; text: string; error?: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 20_000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        accept: opts.accept ?? "text/html,application/xhtml+xml,application/xml,application/json",
        "user-agent": userAgent(opts.contact ?? null),
      },
      redirect: "follow",
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } catch (error) {
    return { ok: false, status: 0, text: "", error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchBuffer(
  url: string,
  opts: { contact?: string | null; timeoutMs?: number; fetchImpl?: typeof fetch } = {}
): Promise<{ ok: boolean; bytes: Buffer | null; error?: string }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? 25_000);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { "user-agent": userAgent(opts.contact ?? null) },
    });
    if (!response.ok) return { ok: false, bytes: null, error: `HTTP ${response.status}` };
    const bytes = Buffer.from(await response.arrayBuffer());
    return { ok: true, bytes };
  } catch (error) {
    return { ok: false, bytes: null, error: error instanceof Error ? error.message : String(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** Skip the fetch when robots.txt disallows the path. A failed robots fetch does not block. */
export async function allowedByRobots(url: string, contact: string | null, fetchImpl?: typeof fetch): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const robotsUrl = `${parsed.origin}/robots.txt`;
  let body = robotsCache.get(parsed.origin);
  if (body == null) {
    const result = await fetchText(robotsUrl, { contact, timeoutMs: 8_000, fetchImpl });
    body = result.ok ? result.text : "";
    robotsCache.set(parsed.origin, body);
  }
  if (!body.trim()) return true;
  return robotsAllows(body, parsed.pathname, userAgent(contact));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function pdfToText(bytes: Buffer): Promise<string> {
  const mod = await import("pdf-parse");
  const Parser = (mod as { PDFParse?: new (opts: { data: Buffer }) => { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> } }).PDFParse
    ?? (mod as { default?: { PDFParse?: new (opts: { data: Buffer }) => { getText: () => Promise<{ text?: string }>; destroy: () => Promise<void> } } }).default?.PDFParse;
  if (!Parser) throw new Error("pdf-parse PDFParse export missing");
  const parser = new Parser({ data: bytes });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}
