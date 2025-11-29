import { makeError, ErrorCode } from "@/types/errors.js";




export function extractSubmitUrl(text: string): string {

  const rx =
    /https?:\/\/[^\s"'`<>)]{4,}/gi;

  const matches = text.match(rx) || [];

  const submitFirst = [...matches].sort((a, b) => {
    const as = /submit/i.test(a) ? -1 : 0;
    const bs = /submit/i.test(b) ? -1 : 0;
    return as - bs;
  });

  const raw = submitFirst[0];
  if (!raw) {
    throw makeError(ErrorCode.PARSER_NO_URL, "No submission URL found in quiz text");
  }


  const cleaned = raw.replace(/[),.;\]]+$/g, "");
  try {
    const u = new URL(cleaned);
    if (!/^https?:$/.test(u.protocol)) throw new Error("bad protocol");
    return u.toString();
  } catch {
    throw makeError(ErrorCode.PARSER_NO_URL, "Invalid submission URL", { candidate: cleaned });
  }
}

export function extractResourceUrls(text: string, pageUrl: string): string[] {
  const rx = /(?:https?:\/\/)?[^\s"'`<>)]{4,}/gi;
  const matches = text.match(rx) || [];

  return matches
    .filter(url => !/submit/i.test(url))
    .map(url => url.replace(/[),.;\]]+$/g, ''))
    .map(url => {
      if (url.startsWith('http')) return url;
      try {
        return new URL(url, pageUrl).toString();
      } catch {
        return url;
      }
    })
    .filter(url => {
      try {
        const u = new URL(url);
        return /^https?:$/.test(u.protocol);
      } catch {
        return false;
      }
    });
}
