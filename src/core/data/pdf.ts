import type { PdfData } from "@/types/data.js";

type PdfParsed = { text?: string };

export async function parsePdf(bytes: Uint8Array): Promise<PdfData> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const pdfParse = (await import('pdf-parse')).default as (buffer: Buffer) => Promise<PdfParsed>;
  const buf = Buffer.from(bytes);
  const res = await pdfParse(buf);
  const text = typeof res.text === "string" ? res.text : "";
  return { text };
}
