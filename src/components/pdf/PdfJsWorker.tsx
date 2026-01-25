"use client";

import { useEffect } from "react";

export function PdfJsWorker() {
  useEffect(() => {
    void (async () => {
      const { pdfjs } = await import("react-pdf");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    })();
  }, []);

  return null;
}
