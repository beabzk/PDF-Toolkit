"use client";

import { useEffect } from "react";
import { ensurePdfJsWorker } from "@/lib/pdfjs";

export function PdfJsWorker() {
  useEffect(() => {
    void ensurePdfJsWorker();
  }, []);

  return null;
}
