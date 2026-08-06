// One-click PDF download for the PI/CI document previews, alongside the browser's Print flow.
//
// The rule this file follows: photograph the document exactly as it is laid out on screen, then
// scale that picture proportionally onto the page. Nothing about the document's geometry is
// touched.
//
// Earlier versions rewrote the cloned sheet's width and padding to imitate the `print:` utility
// classes. That was the mistake. Changing width makes the document *reflow*, not scale: text
// re-wraps, columns redistribute, and anything sized in fixed pixels (the logo box, the type
// scale) lands at a different proportion to everything around it. The result reads as stretched
// or squashed even though every individual rule was "correct". Capturing at natural size and
// letting one uniform scale factor do the fitting keeps every proportion identical to the screen.
//
// Only two things are changed in the clone, and neither affects layout:
//   1. Colours are pinned to their already-resolved values (html2canvas cannot parse the
//      color-mix() that Tailwind v4 emits for every /opacity utility).
//   2. The letterhead PNG is re-encoded through the browser's own decoder (html2canvas's bundled
//      zlib fails on this particular file and hangs the export).
//
// Purely decorative nodes that the printout omits are removed, which is a visual match, not a
// layout change: the watermark is absolutely positioned and `.no-print` elements are outside the
// captured element anyway.

/**
 * Page geometry, mirrored from the `@page` rule in src/index.css so Ctrl+P and this export land on
 * the same paper with the same margins. CSS and this module cannot share a constant, so if you
 * change one, change the other.
 */
const PAGE_FORMAT = "a4";
const PAGE_MARGIN_MM = 14;

/**
 * Capture resolution. The document is rasterised at this multiple of CSS pixels before being
 * placed on the page, so it sets how sharp the text is: 3x puts an A4 page at roughly 288dpi.
 * Raising it further mostly grows the file.
 */
const CAPTURE_SCALE = 3;

export async function downloadElementAsPdf(elementId: string, filename: string): Promise<void> {
  const el = document.getElementById(elementId);
  if (!el) throw new Error(`Could not find document element "${elementId}" to export.`);

  const html2pdf = (await import("html2pdf.js")).default;

  // The canvas render is heavy, synchronous, main-thread work. Without yielding first, a "loading"
  // state set by the caller immediately before this call would never get painted before the freeze
  // hits. Two animation frames guarantees at least one paint.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  await html2pdf()
    .set({
      margin: PAGE_MARGIN_MM,
      filename,
      // Lossless. JPEG's chroma subsampling is tuned for photographs and visibly smears this kind
      // of content: small text and hairline rules on flat white.
      image: { type: "png", quality: 1 },
      html2canvas: {
        scale: CAPTURE_SCALE,
        useCORS: true,
        backgroundColor: "#ffffff",
        // No width, windowWidth, or style overrides anywhere in here. Every one of them causes a
        // reflow instead of a scale. See the note at the top of this file.
        onclone: (clonedDoc: Document) => {
          const clonedRoot = clonedDoc.getElementById(elementId);
          if (!clonedRoot) return;

          // This pass pairs original and cloned elements by index, so it must run while the two
          // trees still have identical shape. Any node removal has to come afterwards.
          const originalNodes = el.querySelectorAll<HTMLElement>("*");
          const clonedNodes = clonedRoot.querySelectorAll<HTMLElement>("*");

          clonedNodes.forEach((clone, i) => {
            const source = originalNodes[i];
            if (!source) return;
            const cs = window.getComputedStyle(source);

            // getComputedStyle always returns plain rgb()/rgba(), never color-mix().
            clone.style.backgroundColor = cs.backgroundColor;
            clone.style.backgroundImage = "none";
            clone.style.color = cs.color;
            clone.style.borderColor = cs.borderColor;

            if (source instanceof HTMLImageElement && clone instanceof HTMLImageElement && source.complete) {
              // Pin the box the browser actually computed. html2canvas infers image sizing less
              // faithfully than the browser, particularly with object-contain.
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
                // Same-origin bundled asset, so this shouldn't throw. If it ever does, keep the
                // original src rather than failing the whole export over a logo.
              }
            }
          });

          // Safe to remove now the walk is done. The watermark is absolutely positioned and
          // `.no-print` nodes sit outside the captured element, so neither shifts the layout.
          clonedDoc.querySelectorAll(".mesh-lattice, .no-print").forEach((n) => n.remove());

          clonedRoot.style.backgroundColor = "#ffffff";
          // Screen chrome on the sheet itself. The commercial invoice carries a rounded border and
          // drop shadow that print drops; none of these three affect layout, so neutralising them
          // is a colour change rather than a reflow. The border is made transparent rather than
          // removed, since removing it would shift the contents by a pixel.
          clonedRoot.style.boxShadow = "none";
          clonedRoot.style.borderRadius = "0";
          clonedRoot.style.borderColor = "transparent";
        },
      },
      jsPDF: { unit: "mm", format: PAGE_FORMAT, orientation: "portrait", compress: true },
      // Never split a table row or a block marked to stay whole across a page boundary.
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".break-inside-avoid"] },
    })
    .from(el)
    .save();
}
