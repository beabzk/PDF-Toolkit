"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useDropzone } from "react-dropzone";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { DownloadIcon, FileTextIcon, XIcon } from "lucide-react";
import type { DocumentProps, PageProps } from "react-pdf";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToolLayout } from "@/components/tools/ToolLayout";
import { downloadBytes } from "@/lib/download";
import { loadPdfDocument } from "@/lib/pdf";
import { ensurePdfJsWorker } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";

const PdfDocument = dynamic<DocumentProps>(
  () => import("react-pdf").then((m) => m.Document),
  { ssr: false },
);

const PdfPage = dynamic<PageProps>(
  () => import("react-pdf").then((m) => m.Page),
  { ssr: false },
);

type OutputMode = "single" | "zip-pages" | "zip-ranges";

function defaultBaseName(fileName: string) {
  return fileName.replace(/\.pdf$/i, "");
}

function parsePageSpec(spec: string, maxPage: number) {
  const trimmed = spec.trim();
  if (!trimmed) return new Set<number>();

  const out = new Set<number>();
  const parts = trimmed
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

  for (const part of parts) {
    const rangeParts = part.split("-").map((x) => x.trim());
    if (rangeParts.length === 1) {
      const n = Number(rangeParts[0]);
      if (!Number.isInteger(n)) throw new Error(`Invalid page: ${part}`);
      if (n < 1 || n > maxPage) throw new Error(`Page out of range: ${part}`);
      out.add(n);
      continue;
    }

    if (rangeParts.length !== 2) throw new Error(`Invalid range: ${part}`);

    const start = Number(rangeParts[0]);
    const end = Number(rangeParts[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      throw new Error(`Invalid range: ${part}`);
    }
    if (start < 1 || end < 1 || start > maxPage || end > maxPage) {
      throw new Error(`Range out of bounds: ${part}`);
    }
    if (start > end) throw new Error(`Range start must be <= end: ${part}`);

    for (let p = start; p <= end; p += 1) out.add(p);
  }

  return out;
}

function pagesToRanges(pages: number[]) {
  const ranges: Array<{ start: number; end: number }> = [];
  if (pages.length === 0) return ranges;

  let start = pages[0];
  let prev = pages[0];
  for (let i = 1; i < pages.length; i += 1) {
    const cur = pages[i];
    if (cur === prev + 1) {
      prev = cur;
      continue;
    }

    ranges.push({ start, end: prev });
    start = cur;
    prev = cur;
  }

  ranges.push({ start, end: prev });
  return ranges;
}

export function SplitTool() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [selectedPages, setSelectedPages] = useState<Set<number>>(() => new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [pageSpec, setPageSpec] = useState("");
  const [outputMode, setOutputMode] = useState<OutputMode>("single");
  const [baseName, setBaseName] = useState("");

  useEffect(() => {
    let cancelled = false;

    void ensurePdfJsWorker()
      .then(() => {
        if (!cancelled) setWorkerReady(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to initialize PDF worker.");
      });

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
    setPageSpec("");
    setOutputMode("single");
    setBaseName(next ? defaultBaseName(next.name) : "");
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

  const applyPageSpec = useCallback(() => {
    setError(null);
    if (!numPages) {
      setError("Please wait for the PDF to load before applying a page range.");
      return;
    }

    try {
      const pages = parsePageSpec(pageSpec, numPages);
      if (pages.size === 0) {
        setError("Please enter at least one page.");
        return;
      }
      setSelectedPages(pages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid page selection.");
    }
  }, [numPages, pageSpec]);

  const selectAll = useCallback(() => {
    if (!numPages) return;
    setSelectedPages(new Set(Array.from({ length: numPages }, (_, i) => i + 1)));
  }, [numPages]);

  const selectNone = useCallback(() => {
    setSelectedPages(new Set());
  }, []);

  const invertSelection = useCallback(() => {
    if (!numPages) return;
    setSelectedPages((prev) => {
      const next = new Set<number>();
      for (let p = 1; p <= numPages; p += 1) {
        if (!prev.has(p)) next.add(p);
      }
      return next;
    });
  }, [numPages]);

  const selectOdd = useCallback(() => {
    if (!numPages) return;
    const next = new Set<number>();
    for (let p = 1; p <= numPages; p += 2) next.add(p);
    setSelectedPages(next);
  }, [numPages]);

  const selectEven = useCallback(() => {
    if (!numPages) return;
    const next = new Set<number>();
    for (let p = 2; p <= numPages; p += 2) next.add(p);
    setSelectedPages(next);
  }, [numPages]);

  const clear = useCallback(() => {
    setError(null);
    setFile(null);
    setNumPages(null);
    setSelectedPages(new Set());
    setPageSpec("");
    setOutputMode("single");
    setBaseName("");
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

    const effectiveBaseName = baseName.trim() || defaultBaseName(file.name);

    try {
      setIsExtracting(true);

      const sourceBytes = await file.arrayBuffer();
      const sourceDoc = await loadPdfDocument(sourceBytes);

      const indices = Array.from(selectedPages)
        .sort((a, b) => a - b)
        .map((p) => p - 1);

      if (outputMode === "single") {
        const out = await PDFDocument.create();
        const copied = await out.copyPages(sourceDoc, indices);
        for (const page of copied) out.addPage(page);
        const outBytes = await out.save();
        downloadBytes(
          outBytes,
          `${effectiveBaseName}_extracted.pdf`,
          "application/pdf",
        );
        return;
      }

      const zip = new JSZip();

      if (outputMode === "zip-pages") {
        for (const pageIndex of indices) {
          const out = await PDFDocument.create();
          const [page] = await out.copyPages(sourceDoc, [pageIndex]);
          out.addPage(page);
          const outBytes = await out.save();
          const pageNumber = pageIndex + 1;
          zip.file(`${effectiveBaseName}_p${pageNumber}.pdf`, outBytes);
        }

        const zipBytes = await zip.generateAsync({ type: "uint8array" });
        downloadBytes(zipBytes, `${effectiveBaseName}_pages.zip`, "application/zip");
        return;
      }

      const pageNumbersSorted = indices.map((i) => i + 1);
      const ranges = pagesToRanges(pageNumbersSorted);

      for (const r of ranges) {
        const out = await PDFDocument.create();
        const rangeIndices = Array.from(
          { length: r.end - r.start + 1 },
          (_, i) => r.start - 1 + i,
        );
        const copied = await out.copyPages(sourceDoc, rangeIndices);
        for (const page of copied) out.addPage(page);
        const outBytes = await out.save();
        zip.file(`${effectiveBaseName}_p${r.start}-${r.end}.pdf`, outBytes);
      }

      const zipBytes = await zip.generateAsync({ type: "uint8array" });
      downloadBytes(zipBytes, `${effectiveBaseName}_ranges.zip`, "application/zip");
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : outputMode === "single"
            ? "Failed to extract pages."
            : "Failed to split pages.";
      if (typeof message === "string" && message.toLowerCase().includes("encrypted")) {
        setError("This PDF appears to be encrypted and cannot be processed.");
      } else {
        setError(message);
      }
    } finally {
      setIsExtracting(false);
    }
  }, [baseName, file, outputMode, selectedPages]);

  const canApplySpec = !!file && !!pageSpec.trim() && !isExtracting;

  return (
    <ToolLayout
      title="Split PDF"
      description="Extract pages from a PDF file."
      error={error}
      headerActions={
        file ? (
          <Button type="button" variant="outline" size="sm" onClick={clear} disabled={isExtracting}>
            <XIcon />
            Clear
          </Button>
        ) : null
      }
      footer={
        file ? (
          <Button type="button" onClick={extract} disabled={!canExtract}>
            <DownloadIcon />
            {isExtracting
              ? "Processing..."
              : outputMode === "single"
                ? "Download PDF"
                : "Download ZIP"}
          </Button>
        ) : null
      }
    >
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
            </div>
            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Pages</div>
                <div className="flex gap-2">
                  <input
                    value={pageSpec}
                    onChange={(e) => setPageSpec(e.target.value)}
                    placeholder="e.g. 1-3,5,8-10"
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                    disabled={isExtracting}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={applyPageSpec}
                    disabled={!canApplySpec}
                  >
                    Apply
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Output</div>
                <select
                  value={outputMode}
                  onChange={(e) => setOutputMode(e.target.value as OutputMode)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={isExtracting}
                >
                  <option value="single">One PDF (selected pages)</option>
                  <option value="zip-pages">ZIP (one PDF per page)</option>
                  <option value="zip-ranges">ZIP (one PDF per range)</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Filename</div>
                <input
                  value={baseName}
                  onChange={(e) => setBaseName(e.target.value)}
                  placeholder={file ? defaultBaseName(file.name) : ""}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={isExtracting}
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Selection</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectAll}
                    disabled={!numPages || isExtracting}
                  >
                    Select all
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectNone}
                    disabled={selectedPages.size === 0 || isExtracting}
                  >
                    None
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={invertSelection}
                    disabled={!numPages || isExtracting}
                  >
                    Invert
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectOdd}
                    disabled={!numPages || isExtracting}
                  >
                    Odd
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={selectEven}
                    disabled={!numPages || isExtracting}
                  >
                    Even
                  </Button>
                </div>
              </div>
            </div>

            <div className="text-sm text-muted-foreground">
              Selected: <span className="text-foreground">{selectedCount}</span>
              {numPages ? (
                <>
                  {" "}
                  / {numPages}
                </>
              ) : null}
            </div>

            <ScrollArea className="h-[28rem]">
              <div className="pr-3">
                {workerReady ? (
                  <PdfDocument
                    file={file}
                    onLoadSuccess={({ numPages: nextNumPages }: { numPages: number }) => {
                      setNumPages(nextNumPages);
                    }}
                    onLoadError={(e: unknown) => {
                      setError(e instanceof Error ? e.message : "Failed to load the PDF.");
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
                                loading={<div className="h-[14rem] bg-muted" />}
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
    </ToolLayout>
  );
}
