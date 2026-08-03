// html2pdf.js ships no official TypeScript declarations — this is a minimal ambient module
// covering only the chained-builder API surface this app actually uses (src/lib/pdf.ts).
declare module "html2pdf.js" {
  interface Html2PdfImageOptions {
    type?: string;
    quality?: number;
  }
  interface Html2PdfOptions {
    margin?: number | [number, number, number, number];
    filename?: string;
    image?: Html2PdfImageOptions;
    html2canvas?: Record<string, unknown>;
    jsPDF?: Record<string, unknown>;
    pagebreak?: Record<string, unknown>;
  }
  interface Html2Pdf {
    set(options: Html2PdfOptions): Html2Pdf;
    from(element: HTMLElement): Html2Pdf;
    save(): Promise<void>;
  }
  function html2pdf(): Html2Pdf;
  export default html2pdf;
}
