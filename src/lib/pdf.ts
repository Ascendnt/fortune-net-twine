// One-click PDF download for the PI/CI document previews, on top of (not instead of) the
// existing browser Print flow — window.print() still works for "Save as PDF" via the print
// dialog, but this gives a direct .pdf file without opening it. Loaded dynamically so the
// ~200kb html2pdf.js bundle only ships to users who actually click "Download PDF".
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
      margin: 10,
      filename,
      image: { type: "jpeg", quality: 0.95 },
      html2canvas: {
        scale: 1.5,
        useCORS: true,
        backgroundColor: "#ffffff",
        // Two known html2canvas failure modes, both fixed in this one pass over the cloned DOM:
        //
        // 1. It can't parse the modern CSS color functions this app's Tailwind v4 build relies
        //    on — every "/opacity" utility (e.g. bg-pine-50/60) compiles to color-mix(), and the
        //    decorative .mesh-lattice watermark uses color-mix() directly in its gradient. Both
        //    crash html2canvas's color parser. Fix: ask the *browser* for each element's already-
        //    resolved color (getComputedStyle always returns plain rgb()/rgba(), never
        //    color-mix()) and pin that inline on the clone.
        //
        // 2. Its bundled PNG decoder chokes on the letterhead logo (observed in DevTools as a
        //    zlib "invalid distance code" error inside its own inflate implementation) — that's
        //    what was crashing/hanging the export. Fix: redraw the logo through the browser's own
        //    (fast, correct) image decoder onto a canvas and swap the clone's src to that data
        //    URL, so html2canvas never has to parse the original PNG bytes itself.
        onclone: (clonedDoc: Document) => {
          const clonedRoot = clonedDoc.getElementById(elementId);
          if (!clonedRoot) return;
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
          clonedRoot.style.backgroundColor = "#ffffff";
        },
      },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"], avoid: ["tr", ".break-inside-avoid"] },
    })
    .from(el)
    .save();
}
