/**
 * Counting the pages of a PDF without a PDF library.
 *
 * The layout check already measures the page count in the browser. This is a
 * second, independent count taken from the PDF file that is stored, so a PDF
 * that somehow printed onto two pages is caught. Chrome writes each page as a
 * `/Type /Page` object in plain text, which is all this needs.
 */

export function countPdfPages(bytes: Uint8Array): number | null {
  const text = new TextDecoder("latin1").decode(bytes);
  if (!text.startsWith("%PDF-")) return null;

  const pageObjects = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g)?.length ?? 0;
  if (pageObjects > 0) return pageObjects;

  const counts = [...text.matchAll(/\/Type\s*\/Pages\b[^>]*?\/Count\s+(\d+)/g)].map((match) =>
    Number(match[1]),
  );
  return counts.length ? Math.max(...counts) : null;
}
