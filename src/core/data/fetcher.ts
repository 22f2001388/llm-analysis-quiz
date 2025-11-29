import { DATA } from "@/config/constants.js";
export async function download(url: string): Promise<import("@/types/data.js").Fetched> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), DATA.downloadTimeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: "follow" });
    if (!res.ok) throw new Error("FETCH_FAIL");
    const ct = res.headers.get("content-type") || "application/octet-stream";
    const buf = new Uint8Array(await res.arrayBuffer());
    const size = buf.byteLength;
    if (size > DATA.sizeLimitBytes) throw new Error("FETCH_TOO_LARGE");
    return { url: res.url || url, contentType: ct, size, data: buf };
  } finally {
    clearTimeout(t);
  }
}
