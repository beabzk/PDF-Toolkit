"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import JSZip from "jszip";
import { DownloadIcon, FileTextIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToolLayout } from "@/components/tools/ToolLayout";
import { downloadBytes } from "@/lib/download";
import { ensurePdfJsWorker } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";
import { useCancelableTask } from "@/hooks/useCancelableTask";

type OutputFormat = "png" | "jpeg";
type DpiPreset = "72" | "150" | "300" | "custom";

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

export function PdfToImagesTool() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageSpec, setPageSpec] = useState("");
  const [format, setFormat] = useState<OutputFormat>("png");
  const [dpiPreset, setDpiPreset] = useState<DpiPreset>("150");
  const [customDpi, setCustomDpi] = useState("300");
  const [baseName, setBaseName] = useState("");
  const [workerReady, setWorkerReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const task = useCancelableTask();

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

  useEffect(() => {
    if (!file) return;

    let cancelled = false;
    setError(null);

    void (async () => {
      try {
        const bytes = await file.arrayBuffer();
        const { pdfjs } = await import("react-pdf");
        const doc = await pdfjs.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        setNumPages(doc.numPages);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load the PDF.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [file]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);
    const next = acceptedFiles[0] ?? null;
    setFile(next);
    setNumPages(null);
    setPageSpec("");
    setFormat("png");
    setDpiPreset("150");
    setCustomDpi("300");
    setBaseName(next ? defaultBaseName(next.name) : "");
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/pdf": [".pdf"],
    },
    disabled: task.isRunning,
  });

  const effectiveDpi = useMemo(() => {
    if (dpiPreset !== "custom") return Number(dpiPreset);
    const parsed = Number(customDpi);
    if (!Number.isFinite(parsed) || parsed <= 0) return 150;
    return Math.min(1200, Math.max(36, Math.round(parsed)));
  }, [customDpi, dpiPreset]);

  const effectivePageSpecPlaceholder = useMemo(() => {
    if (!numPages) return "e.g. 1-3,5,8-10";
    return `e.g. 1-${Math.min(3, numPages)},${Math.min(5, numPages)}`;
  }, [numPages]);

  const clear = useCallback(() => {
    setError(null);
    setFile(null);
    setNumPages(null);
    setPageSpec("");
    setFormat("png");
    setDpiPreset("150");
    setCustomDpi("300");
    setBaseName("");
  }, []);

  const canRun = !!file && !!workerReady && !task.isRunning;

  const exportImages = useCallback(async () => {
    setError(null);

    if (!file) {
      setError("Please upload a PDF first.");
      return;
    }

    if (!workerReady) {
      setError("PDF renderer is not ready yet.");
      return;
    }

    try {
      await task.start(async ({ signal, reportProgress }) => {
        reportProgress(0);

        const throwIfAborted = () => {
          if (!signal.aborted) return;
          throw new DOMException("Aborted", "AbortError");
        };

        const bytes = await file.arrayBuffer();
        throwIfAborted();

        const { pdfjs } = await import("react-pdf");
        const pdfjsDoc = await pdfjs.getDocument({ data: bytes }).promise;
        throwIfAborted();

        const pageCount = pdfjsDoc.numPages;
        const pagesSet = pageSpec.trim() ? parsePageSpec(pageSpec, pageCount) : new Set<number>();
        const pages = (pagesSet.size === 0
          ? Array.from({ length: pageCount }, (_, i) => i + 1)
          : Array.from(pagesSet).sort((a, b) => a - b));

        if (pages.length === 0) {
          setError("Please select at least one page.");
          return;
        }

        const effectiveBaseName = baseName.trim() || defaultBaseName(file.name);
        const zip = new JSZip();
        const digits = String(pageCount).length;
        const ext = format === "png" ? "png" : "jpg";
        const mime = format === "png" ? "image/png" : "image/jpeg";

        for (let i = 0; i < pages.length; i += 1) {
          throwIfAborted();

          const pageNumber = pages[i];
          const pdfjsPage = await pdfjsDoc.getPage(pageNumber);
          const scale = effectiveDpi / 72;
          const viewport = pdfjsPage.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.floor(viewport.width));
          canvas.height = Math.max(1, Math.floor(viewport.height));

          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("Failed to create canvas context.");

          await (pdfjsPage as any).render({ canvasContext: ctx, viewport, canvas }).promise;
          throwIfAborted();

          const blob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob(
              (result) => {
                if (!result) reject(new Error("Failed to export image."));
                else resolve(result);
              },
              mime,
              0.92,
            );
          });

          const padded = String(pageNumber).padStart(digits, "0");
          zip.file(`${effectiveBaseName}_p${padded}.${ext}`, blob);

          canvas.width = 0;
          canvas.height = 0;

          reportProgress(Math.round(((i + 1) / pages.length) * 100));
        }

        const zipBytes = await zip.generateAsync({ type: "uint8array" });
        throwIfAborted();
        downloadBytes(zipBytes, `${effectiveBaseName}_images.zip`, "application/zip");
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export images.");
    }
  }, [baseName, file, format, pageSpec, task, workerReady, effectiveDpi]);

  return (
    <ToolLayout
      title="PDF to Images"
      description="Export PDF pages as PNG or JPEG images."
      error={error}
      progress={task.isRunning ? (task.progress ?? 0) : null}
      progressLabel={
        task.isRunning
          ? typeof task.progress === "number"
            ? `Progress: ${task.progress}%`
            : "Processing..."
          : undefined
      }
      headerActions={
        file ? (
          <Button type="button" variant="outline" size="sm" onClick={clear} disabled={task.isRunning}>
            <XIcon />
            Clear
          </Button>
        ) : null
      }
      footer={
        file ? (
          <>
            <Button type="button" onClick={exportImages} disabled={!canRun}>
              <DownloadIcon />
              {task.isRunning ? "Processing..." : "Download ZIP"}
            </Button>
            <Button type="button" variant="outline" onClick={task.cancel} disabled={!task.isRunning}>
              Cancel
            </Button>
          </>
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
            <div className="flex min-w-0 items-center gap-2">
              <FileTextIcon className="size-4 text-muted-foreground" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{file.name}</div>
                <div className="text-xs text-muted-foreground">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                  {typeof numPages === "number" ? ` · ${numPages} pages` : ""}
                </div>
              </div>
            </div>
            <Separator />

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Pages</div>
                <input
                  value={pageSpec}
                  onChange={(e) => setPageSpec(e.target.value)}
                  placeholder={effectivePageSpecPlaceholder}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={task.isRunning}
                />
                <div className="text-xs text-muted-foreground">
                  Leave empty to export all pages.
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Format</div>
                <select
                  value={format}
                  onChange={(e) => setFormat(e.target.value as OutputFormat)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={task.isRunning}
                >
                  <option value="png">PNG</option>
                  <option value="jpeg">JPEG</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">DPI</div>
                <select
                  value={dpiPreset}
                  onChange={(e) => setDpiPreset(e.target.value as DpiPreset)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={task.isRunning}
                >
                  <option value="72">72 DPI (Screen)</option>
                  <option value="150">150 DPI (Balanced)</option>
                  <option value="300">300 DPI (Print)</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Filename</div>
                <input
                  value={baseName}
                  onChange={(e) => setBaseName(e.target.value)}
                  placeholder={file ? defaultBaseName(file.name) : ""}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={task.isRunning}
                />
              </div>
            </div>

            {dpiPreset === "custom" ? (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Custom DPI</div>
                <input
                  value={customDpi}
                  onChange={(e) => setCustomDpi(e.target.value)}
                  placeholder="e.g. 600"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={task.isRunning}
                />
                <div className="text-xs text-muted-foreground">Valid range: 36 - 1200.</div>
              </div>
            ) : null}

            {!workerReady ? (
              <div className="text-sm text-muted-foreground">Initializing PDF renderer...</div>
            ) : null}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
