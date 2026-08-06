// One-click PDF download for the PI/CI document previews, alongside the browser Print flow.
//
// The document is rasterised by html2canvas and placed into a jsPDF page. Two things decide whether
// the result matches what Print produces:
//
//  1. Resolution. The capture runs at 3x, so an A4 page lands at roughly 288dpi, and the image is
//     encoded as lossless PNG. JPEG was visibly worse here: its chroma subsampling is tuned for
//     photographs and smears exactly this kind of content, small text and hairline rules on flat
//     white.
//
//  2. Layout. This is what actually made the PDF look unlike the printout. html2canvas renders
//     SCREEN styles, so every `print:` variant the document relies on was being ignored, and the
//     decorative mesh watermark (hidden by `print:hidden`) was being captured. The clone is now
//     given the print layout by hand in onclone, so both routes render the same geometry.
//
// Note that a rasterised page can never be quite as sharp as the browser's own print-to-PDF, which
// emits real vector text. If the difference still matters, the next step is generating the PDF from
// the quotation data with jsPDF's text primitives rather than photographing the DOM.
/**
 * Page geometry, kept identical to the `@page` rule in src/index.css so that Ctrl+P and this
 * export produce the same document. If you change one, change the other: they are the two halves
 * of a single setting that CSS and JS cannot share.
 */
const PAGE_SIZE = "a4";
const PAGE_MARGIN_MM = 14;

/**
 * A4 content width in CSS pixels: the 210mm page less both margins, at the CSS reference 96dpi.
 * This is the width the browser lays the document out at when printing, so pinning the export
 * clone to it makes fixed-px sizes (the logo box, type sizes) occupy the same fraction of the
 * page in both routes.
 */
const A4_CONTENT_WIDTH_PX = Math.round(((210 - PAGE_MARGIN_MM * 2) / 25.4) * 96); // 688

export async function downloadElementAsPdf(elementId: string, filename: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Could not find document element "${elementId}" to export.`);

  const html2pdf = (await import("html2pdf.js")).default;

  // The canvas render below is heavy, synchronous, main-thread work — without yielding first,
  // a "loading" state set by the caller right before this call would never actually get painted
  // before the freeze hits. Two animation frames guarantees the browser has painted at least once.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  await html2pdf()
    .set({
      margin: PAGE_MARGIN_MM,
      filename,
      image: { type: "png", quality: 1 },
      html2canvas: {
        scale: 3,
        useCORS: true,
        backgroundColor: "#ffffff",
        // Deliberately no width/windowWidth override: pinning them to the document's own width
        // makes html2canvas lay the clone out as if the viewport were that narrow, tripping the
        // responsive breakpoints and rendering the page small in a corner of the sheet.
        onclone: (clonedDoc: Document) => {
          const clonedRoot = clonedDoc.getElementById(elementId);
          if (!clonedRoot) return;

          // ---- Match the print layout -------------------------------------------------------
          // The document carries `print:min-w-0 print:max-w-none print:w-full print:p-0` on its
          // inner sheet. Those only apply under the print media query, which html2canvas never
          // enters, so they are applied directly here instead.
          const sheet = clonedRoot.firstElementChild as HTMLElement | null;
          if (sheet) {
            sheet.style.minWidth = "0";
            sheet.style.maxWidth = "none";
            // NOT 100%. Under print, "full width" means the width of the A4 page; here it would
            // mean the width of the on-screen container, which is wider. Everything fixed in px
            // (the 56px logo box most visibly) would then shrink relative to the page. Pinning the
            // clone to the A4 content width makes px sizes land at the same proportion of the page
            // that Print gives them.
            sheet.style.width = `${A4_CONTENT_WIDTH_PX}px`;
            sheet.style.padding = "0";
          }
          clonedRoot.style.overflow = "visible";

          // ---- Work around two html2canvas defects ------------------------------------------
          //
          // ORDER MATTERS. The style pass below pairs original and cloned elements by index, so it
          // has to run while the two trees still match. Removing the watermark first shifted every
          // subsequent clone by one and handed each element another element's colors and sizing.
          //
          // 1. It can't parse the modern CSS color functions this app's Tailwind v4 build relies
          //    on — every "/opacity" utility (e.g. bg-pine-50/60) compiles to color-mix(), which
          //    crashes its color parser. Fix: ask the *browser* for each element's already-
          //    resolved color (getComputedStyle always returns plain rgb()/rgba()) and pin that
          //    inline on the clone.
          //
          // 2. Its bundled PNG decoder chokes on the letterhead logo (a zlib "invalid distance
          //    code" inside its own inflate implementation), which hung the export. Fix: redraw
          //    the logo through the browser's own image decoder onto a canvas and swap the src to
          //    that data URL, so html2canvas never parses the original PNG bytes.
          const originalNodes = el.querySelectorAll<HTMLElement>("*");
          const clonedNodes = clonedRoot.querySelectorAll<HTMLElement>("*");
          clonedNodes.forEach((clone, i) => {
            const source = originalNodes[i];
            if (!source) return;
            const cs = window.getComputedStyle(source);
            clone.style.backgroundColor = cs.backgroundColor;
            clone.style.backgroundImage = "none";
            clone.style.color = cs.color;
            clone.style.borderColor = cs.borderColor;

            if (source instanceof HTMLImageElement && clone instanceof HTMLImageElement && source.complete) {
              // Pin the box the browser actually gave this image. html2canvas resolves image
              // sizing less faithfully than the browser does, and the letterhead logo is sized by
              // utility classes with object-contain, so without this it can land far smaller than
              // it appears on screen.
              clone.style.width = cs.width;
              clone.style.height = cs.height;
              clone.style.objectFit = cs.objectFit;

              try {
                const canvas = document.createElement("canvas");
                canvas.width = source.naturalWidth || 1;
                canvas.height = source.naturalHeight || 1;
                const ctx = canvas.getContext("2d");
                if (ctx) {
                  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
                  clone.src = canvas.toDataURL("image/png");
                }
              } catch {
                // Same-origin bundled asset — this shouldn't throw, but if it ever does, leave
                // the original src rather than breaking the whole export over a logo image.
              }
            }
          });

          // Only now that the trees have been walked in step: drop the decorative watermark and
          // anything marked no-print, neither of which appears on the printout.
          clonedDoc.querySelectorAll(".mesh-lattice, .no-print").forEach((n) => n.remove());

          clonedRoot.style.backgroundColor = "#ffffff";
        },
      },
      jsPDF: { unit: "mm", format: PAGE_SIZE, orientation: "portrait", compress: true },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".break-inside-avoid"] },
    })
    .from(el)
    .save();
}
