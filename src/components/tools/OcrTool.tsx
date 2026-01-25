"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DownloadIcon, FileTextIcon, XIcon } from "lucide-react";
import { StandardFonts, rgb } from "pdf-lib";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToolLayout } from "@/components/tools/ToolLayout";
import { downloadBytes } from "@/lib/download";
import { loadPdfDocument } from "@/lib/pdf";
import { ensurePdfJsWorker } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";
import { useCancelableTask } from "@/hooks/useCancelableTask";

type QualityPreset = "fast" | "balanced" | "high";

type WordBox = {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
};

type TesseractModule = {
  createWorker: (
    langs: string,
    oem?: number,
    options?: { logger?: (m: unknown) => void },
  ) => Promise<{
    recognize: (image: unknown, options?: unknown, output?: unknown) => Promise<any>;
    setParameters: (params: Record<string, string>) => Promise<void>;
    terminate: () => Promise<void>;
  }>;
};

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

function scaleForQuality(quality: QualityPreset) {
  if (quality === "fast") return 2;
  if (quality === "high") return 4;
  return 3;
}

function flattenWordsFromBlocks(blocks: unknown): WordBox[] {
  const out: WordBox[] = [];
  const blocksAny = blocks as any;
  const blocksArr: any[] = Array.isArray(blocksAny) ? blocksAny : [];

  for (const b of blocksArr) {
    const paragraphs: any[] = Array.isArray(b?.paragraphs) ? b.paragraphs : [];
    for (const p of paragraphs) {
      const lines: any[] = Array.isArray(p?.lines) ? p.lines : [];
      for (const l of lines) {
        const words: any[] = Array.isArray(l?.words) ? l.words : [];
        for (const w of words) {
          const text = typeof w?.text === "string" ? w.text : "";
          const bbox = w?.bbox;
          if (!bbox || typeof bbox.x0 !== "number") continue;
          out.push({
            text,
            bbox: {
              x0: bbox.x0,
              y0: bbox.y0,
              x1: bbox.x1,
              y1: bbox.y1,
            },
          });
        }
      }
    }
  }

  return out;
}

export function OcrTool() {
  const [file, setFile] = useState<File | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageSpec, setPageSpec] = useState("");
  const [language, setLanguage] = useState("eng");
  const [quality, setQuality] = useState<QualityPreset>("balanced");
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

  const clear = useCallback(() => {
    setError(null);
    setFile(null);
    setNumPages(null);
    setPageSpec("");
    setLanguage("eng");
    setQuality("balanced");
    setBaseName("");
  }, []);

  const onPickFile = useCallback((next: File | null) => {
    setError(null);
    setFile(next);
    setNumPages(null);
    setPageSpec("");
    setBaseName(next ? defaultBaseName(next.name) : "");
  }, []);

  const canRun = !!file && !!workerReady && !task.isRunning;

  const effectivePageSpecPlaceholder = useMemo(() => {
    if (!numPages) return "e.g. 1-3,5,8-10";
    return `e.g. 1-${Math.min(3, numPages)},${Math.min(5, numPages)}`;
  }, [numPages]);

  const runOcr = useCallback(async () => {
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

        const sourceBytes = await file.arrayBuffer();
        throwIfAborted();

        const sourceDoc = await loadPdfDocument(sourceBytes);
        throwIfAborted();

        const { pdfjs } = await import("react-pdf");
        const pdfjsDoc = await pdfjs.getDocument({ data: sourceBytes }).promise;
        throwIfAborted();

        const pageCount = pdfjsDoc.numPages;
        const pagesSet = pageSpec.trim() ? parsePageSpec(pageSpec, pageCount) : new Set<number>();
        const pages = (pagesSet.size === 0
          ? Array.from({ length: pageCount }, (_, i) => i + 1)
          : Array.from(pagesSet).sort((a, b) => a - b));

        const effectiveBaseName = baseName.trim() || defaultBaseName(file.name);

        const { createWorker } = (await import("tesseract.js")) as unknown as TesseractModule;
        let currentPageIndex = 0;
        const worker = await createWorker(language, 1, {
          logger: (m: any) => {
            if (signal.aborted) return;
            const progress = typeof m?.progress === "number" ? m.progress : null;
            if (progress === null) return;
            const overall = ((currentPageIndex + progress) / Math.max(1, pages.length)) * 100;
            reportProgress(Math.max(0, Math.min(100, Math.round(overall))));
          },
        });

        try {
          const scale = scaleForQuality(quality);
          const dpi = Math.round(72 * scale);
          await worker.setParameters({ user_defined_dpi: String(dpi) });

          const font = await sourceDoc.embedFont(StandardFonts.Helvetica);

          for (let i = 0; i < pages.length; i += 1) {
            throwIfAborted();

            currentPageIndex = i;

            const pageNumber = pages[i];
            const pdfjsPage = await pdfjsDoc.getPage(pageNumber);
            throwIfAborted();

            const viewport = pdfjsPage.getViewport({ scale });
            const canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Failed to create canvas context.");

            await (pdfjsPage as any).render({ canvasContext: ctx, viewport, canvas }).promise;
            throwIfAborted();

            const recognizeResult = await worker.recognize(canvas, {}, { blocks: true });
            throwIfAborted();

            const words = flattenWordsFromBlocks(recognizeResult.data?.blocks);

            const outPage = sourceDoc.getPage(pageNumber - 1);
            const pageWidth = outPage.getWidth();
            const pageHeight = outPage.getHeight();

            const cw = canvas.width;
            const ch = canvas.height;

            for (const w of words) {
              const text = w.text.trim();
              if (!text) continue;

              const x0 = (w.bbox.x0 / cw) * pageWidth;
              const x1 = (w.bbox.x1 / cw) * pageWidth;
              const y0 = (w.bbox.y0 / ch) * pageHeight;
              const y1 = (w.bbox.y1 / ch) * pageHeight;

              const boxW = Math.max(0.1, x1 - x0);
              const boxH = Math.max(0.1, y1 - y0);

              let size = Math.max(4, boxH);
              const textWidth = font.widthOfTextAtSize(text, size);
              if (textWidth > 0) {
                const fitScale = boxW / textWidth;
                if (fitScale > 0 && fitScale < 1) size = Math.max(3, size * fitScale);
              }

              const x = x0;
              const y = pageHeight - y1;

              outPage.drawText(text, {
                x,
                y,
                size,
                font,
                color: rgb(0, 0, 0),
                opacity: 0,
                maxWidth: boxW,
              } as any);
            }

            canvas.width = 0;
            canvas.height = 0;

            reportProgress(Math.round(((i + 1) / pages.length) * 100));
          }

          const outBytes = await sourceDoc.save();
          throwIfAborted();
          downloadBytes(outBytes, `${effectiveBaseName}_ocr.pdf`, "application/pdf");
        } finally {
          await worker.terminate();
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to run OCR.");
    }
  }, [baseName, file, language, pageSpec, quality, task, workerReady]);

  return (
    <ToolLayout
      title="OCR (Searchable PDF)"
      description="Make scanned PDFs searchable by adding an invisible text layer."
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
        <>
          <Button type="button" onClick={runOcr} disabled={!canRun}>
            <DownloadIcon />
            {task.isRunning ? "Processing..." : "Run OCR & Download"}
          </Button>
          <Button type="button" variant="outline" onClick={task.cancel} disabled={!task.isRunning}>
            Cancel
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {!file ? (
          <label
            className={cn(
              "block cursor-pointer rounded-lg border border-dashed bg-background px-4 py-6 text-center transition-colors",
              task.isRunning && "pointer-events-none opacity-60",
            )}
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
            />
            <div className="text-sm font-medium">Choose a PDF</div>
            <div className="mt-1 text-xs text-muted-foreground">
              OCR runs locally in your browser.
            </div>
          </label>
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
                  Leave empty to OCR all pages.
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Language</div>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={task.isRunning}
                >
                  <option value="eng">English</option>
                  <option value="spa">Spanish</option>
                  <option value="fra">French</option>
                  <option value="deu">German</option>
                  <option value="ita">Italian</option>
                  <option value="por">Portuguese</option>
                  <option value="rus">Russian</option>
                  <option value="ara">Arabic</option>
                  <option value="hin">Hindi</option>
                  <option value="chi_sim">Chinese (Simplified)</option>
                  <option value="chi_tra">Chinese (Traditional)</option>
                  <option value="jpn">Japanese</option>
                  <option value="kor">Korean</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Quality</div>
                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as QualityPreset)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                  disabled={task.isRunning}
                >
                  <option value="fast">Fast</option>
                  <option value="balanced">Balanced</option>
                  <option value="high">High</option>
                </select>
                <div className="text-xs text-muted-foreground">
                  Higher quality uses more memory and CPU.
                </div>
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

            {!workerReady ? (
              <div className="text-sm text-muted-foreground">Initializing PDF renderer...</div>
            ) : null}
          </div>
        )}
      </div>
    </ToolLayout>
  );
}
