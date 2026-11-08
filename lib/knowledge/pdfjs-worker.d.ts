// PDF.js ships no typings for its worker entry; only its WorkerMessageHandler export is used.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
