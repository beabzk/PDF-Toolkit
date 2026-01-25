let initPromise: Promise<void> | null = null;

export function ensurePdfJsWorker(workerSrc = "/pdf.worker.min.mjs") {
  if (typeof window === "undefined") return Promise.resolve();

  initPromise ??= import("react-pdf").then(({ pdfjs }) => {
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  });

  return initPromise;
}
