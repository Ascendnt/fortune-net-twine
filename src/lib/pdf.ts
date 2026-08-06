// PDF export for the PI/CI documents.
//
// This used to rasterise the document with html2canvas and wrap the bitmap in a jsPDF page. That
// approach has a hard quality ceiling: whatever the render scale, the result is a *picture* of the
// page. Text stops being text, so it blurs when zoomed, cannot be selected or searched, and hairline
// rules go soft. Raising the scale only traded blur for file size.
//
// The browser's own print pipeline renders the same DOM to real vector PDF: crisp at any zoom,
// selectable text, a fraction of the size. It is the output the Print button was already producing,
// and it is strictly better than anything the canvas route can reach. So "Download PDF" now goes
// through the same pipeline, with the document title set first because every major browser uses the
// title as the default filename in the Save-as-PDF dialog.
//
// The trade: the browser shows its print dialog rather than dropping a file straight into Downloads,
// and the user picks "Save as PDF" as the destination. That one extra click buys genuine vector
// quality, and it keeps Print and Download producing identical output instead of two documents that
// quietly differ.

/**
 * Opens the browser's print dialog with `filename` pre-set as the suggested PDF name.
 * Resolves once printing has been dispatched and the original title restored.
 */
export async function downloadElementAsPdf(elementId: string, filename: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Could not find document element "${elementId}" to export.`);

  // Browsers derive the default Save-as-PDF filename from document.title. Strip the extension:
  // the print dialog appends ".pdf" itself, so leaving it on produces "PI-33003.pdf.pdf".
  const previousTitle = document.title;
  document.title = filename.replace(/\.pdf$/i, "");

  const restore = () => {
    document.title = previousTitle;
  };

  // Chrome and Firefox fire afterprint once the dialog closes; Safari does not always, so the
  // timeout guarantees the tab title is never left renamed.
  window.addEventListener("afterprint", restore, { once: true });
  window.setTimeout(restore, 60_000);

  // Let the caller's "generating" state paint before the print dialog blocks the main thread.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  window.print();
}
