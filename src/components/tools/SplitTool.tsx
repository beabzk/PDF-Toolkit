"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useDropzone } from "react-dropzone";
import { PDFDocument } from "pdf-lib";
import { DownloadIcon, FileTextIcon, XIcon } from "lucide-react";
import type { DocumentProps, PageProps } from "react-pdf";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

const PdfDocument = dynamic<DocumentProps>(
  () => import("react-pdf").then((m) => m.Document),
  { ssr: false },
);

const PdfPage = dynamic<PageProps>(
  () => import("react-pdf").then((m) => m.Page),
  { ssr: false },
);

function downloadBytes(bytes: Uint8Array, fileName: string) {
  const safeBytes = new Uint8Array(bytes);
  const blob = new Blob([safeBytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();

  URL.revokeObjectURL(url);
}

export function SplitTool() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerReady, setWorkerReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const { pdfjs } = await import("react-pdf");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        if (!cancelled) setWorkerReady(true);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to initialize PDF worker.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    const next = acceptedFiles[0] ?? null;
    setFile(next);
    setNumPages(null);
    setSelectedPages(new Set());
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  const selectedCount = selectedPages.size;
  const canExtract = !!file && selectedCount > 0 && !isExtracting;

  const pageNumbers = useMemo(() => {
    if (!numPages) return [];
    return Array.from({ length: numPages }, (_, i) => i + 1);
  }, [numPages]);

  const toggle = useCallback((pageNumber: number) => {
    setSelectedPages((prev) => {
      const next = new Set(prev);
      if (next.has(pageNumber)) next.delete(pageNumber);
      else next.add(pageNumber);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setFile(null);
    setNumPages(null);
    setSelectedPages(new Set());
  }, []);

  const extract = useCallback(async () => {
    setError(null);
    if (!file) {
      setError("Please upload a PDF first.");
      return;
    }

    if (selectedPages.size === 0) {
      setError("Please select at least one page.");
      return;
    }

    try {
      setIsExtracting(true);

      const sourceBytes = await file.arrayBuffer();
      const sourceDoc = await PDFDocument.load(sourceBytes);
      const out = await PDFDocument.create();

      const indices = Array.from(selectedPages)
        .sort((a, b) => a - b)
        .map((p) => p - 1);

      const copied = await out.copyPages(sourceDoc, indices);
      for (const page of copied) out.addPage(page);

      const outBytes = await out.save();
      downloadBytes(outBytes, "extracted-pages.pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to extract pages.");
    } finally {
      setIsExtracting(false);
    }
  }, [file, selectedPages]);

  return (
    <div className="space-y-4">
      {!file ? (
        <div
          {...getRootProps()}
          className={cn(
            "cursor-pointer rounded-lg border border-dashed bg-background px-4 py-6 text-center transition-colors",
            isDragActive && "border-zinc-400",
          )}
        >
          <input {...getInputProps()} />
          <div className="text-sm font-medium">Drop a PDF here</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Or click to browse. Single PDF only.
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileTextIcon className="size-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </div>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clear}
              disabled={isExtracting}
            >
              <XIcon />
              Clear
            </Button>
          </div>
          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Selected: <span className="text-foreground">{selectedCount}</span>
              {numPages ? (
                <>
                  {" "}
                  / {numPages}
                </>
              ) : null}
            </div>
            <Button type="button" onClick={extract} disabled={!canExtract}>
              <DownloadIcon />
              {isExtracting ? "Extracting..." : "Extract Selected Pages"}
            </Button>
          </div>

          {error ? <div className="text-sm text-destructive">{error}</div> : null}

          <ScrollArea className="h-[28rem]">
            <div className="pr-3">
              {workerReady ? (
                <PdfDocument
                  file={file}
                  onLoadSuccess={({ numPages: nextNumPages }: { numPages: number }) => {
                    setNumPages(nextNumPages);
                  }}
                  onLoadError={(e: unknown) => {
                    setError(
                      e instanceof Error ? e.message : "Failed to load the PDF.",
                    );
                  }}
                  loading={
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Loading PDF...
                    </div>
                  }
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {pageNumbers.map((pageNumber) => {
                      const isSelected = selectedPages.has(pageNumber);
                      return (
                        <button
                          key={pageNumber}
                          type="button"
                          onClick={() => toggle(pageNumber)}
                          aria-pressed={isSelected}
                          className={cn(
                            "group text-left",
                            isExtracting && "pointer-events-none opacity-60",
                          )}
                        >
                          <div
                            className={cn(
                              "overflow-hidden rounded-md border bg-white transition-colors dark:bg-black",
                              isSelected
                                ? "border-blue-500 ring-2 ring-blue-500/20"
                                : "border-border",
                            )}
                          >
                            <PdfPage
                              pageNumber={pageNumber}
                              width={180}
                              renderTextLayer={false}
                              renderAnnotationLayer={false}
                              loading={
                                <div className="h-[14rem] bg-muted" />
                              }
                            />
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            Page {pageNumber}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </PdfDocument>
              ) : (
                <div className="py-8 text-center text-sm text-muted-foreground">
                  Initializing PDF renderer...
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
}
