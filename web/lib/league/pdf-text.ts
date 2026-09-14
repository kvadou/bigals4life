import { join } from "node:path";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist/legacy/build/pdf.mjs";

GlobalWorkerOptions.workerSrc = join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs");

/** Extract text from the text-based BLS PDF without relying on a server binary. */
export async function extractPdfText(data: ArrayBuffer): Promise<string> {
  const document = await getDocument({ data: new Uint8Array(data) }).promise;
  if (document.numPages < 1 || document.numPages > 10) throw new Error("That PDF has an unexpected number of pages.");
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber++) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items.flatMap(item => "str" in item && "transform" in item && item.str.trim() ? [{
      text: item.str.trim(),
      x: item.transform[4],
      y: item.transform[5],
    }] : []).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: { y: number; items: { text: string; x: number }[] }[] = [];
    for (const item of items) {
      const line = lines.find(candidate => Math.abs(candidate.y - item.y) < 2.5);
      if (line) line.items.push(item);
      else lines.push({ y: item.y, items: [item] });
    }
    const pageLines = lines.map(line => line.items.sort((a, b) => a.x - b.x).map(item => item.text).join(" "));
    // PDF.js exposes the centered league title as many repeated fragments on a separate line.
    // Fold it into the date header so the existing BLS parser sees the same shape as pdftotext.
    if (/^\d{1,2}\/\d{1,2}\/\d{4}\s+Week\s+\d+\s+of\s+\d+\s+Page\s+\d+$/.test(pageLines[0] ?? "") && pageLines[1]?.includes("Thursday Men's Early")) {
      const match = pageLines[0].match(/^(.*?Page\s+\d+)$/);
      const season = pageLines[1].match(/Thursday Men's Early\s+\d{4}-\d{2}/)?.[0] ?? "";
      if (match && season) pageLines[0] = `${match[1].replace(/\s+Page\s+\d+$/, "")} ${season} Page`;
      pageLines.splice(1, 1);
    }
    pages.push(pageLines.join("\n"));
  }
  return pages.join("\n");
}
