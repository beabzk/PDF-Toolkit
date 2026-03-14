"use client";

import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useDropzone } from "react-dropzone";
import { PDFDocument, degrees } from "pdf-lib";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DownloadIcon, FileTextIcon, GripVerticalIcon, RotateCcwIcon, RotateCwIcon, Trash2Icon, XIcon } from "lucide-react";
import type { DocumentProps, PageProps } from "react-pdf";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ToolLayout } from "@/components/tools/ToolLayout";
import { downloadBytes } from "@/lib/download";
import { loadPdfDocument } from "@/lib/pdf";
import { ensurePdfJsWorker } from "@/lib/pdfjs";
import { cn } from "@/lib/utils";
import { useCancelableTask } from "@/hooks/useCancelableTask";

const PdfDocument = dynamic<DocumentProps>(
  () => import("react-pdf").then((m) => m.Document),
  { ssr: false },
);

const PdfPage = dynamic<PageProps>(
  () => import("react-pdf").then((m) => m.Page),
  { ssr: false },
);

type Rotation = 0 | 90 | 180 | 270;

type PageItem = {
  id: string;
  pageNumber: number;
  rotation: Rotation;
};

function rotateValue(value: Rotation, delta: 90 | -90): Rotation {
  const next = (value + delta + 360) % 360;
  return next as Rotation;
}

function SortablePageTile({
  page,
  isSelected,
  onToggle,
  onRotateLeft,
  onRotateRight,
  onRemove,
  disabled,
}: {
  page: PageItem;
  isSelected: boolean;
  onToggle: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: page.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border bg-background p-2 shadow-xs",
        isSelected && "border-blue-500 ring-2 ring-blue-500/20",
        isDragging && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className={cn(
            "text-muted-foreground hover:text-foreground",
            disabled && "pointer-events-none opacity-50",
          )}
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVerticalIcon className="size-4" />
        </button>

        <div className="text-xs text-muted-foreground">Page {page.pageNumber}</div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onRotateLeft();
            }}
            disabled={disabled}
            aria-label="Rotate left"
          >
            <RotateCcwIcon className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onRotateRight();
            }}
            disabled={disabled}
            aria-label="Rotate right"
          >
            <RotateCwIcon className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            disabled={disabled}
            aria-label="Remove page"
          >
            <Trash2Icon className="size-3" />
          </Button>
        </div>
      </div>

      <button
        type="button"
        onClick={onToggle}
        disabled={disabled}
        aria-pressed={isSelected}
        className={cn(
          "mt-2 block w-full overflow-hidden rounded-md border bg-white text-left transition-colors dark:bg-black",
          isSelected ? "border-blue-500" : "border-border",
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <PdfPage
          pageNumber={page.pageNumber}
          rotate={page.rotation}
          width={180}
          renderTextLayer={false}
          renderAnnotationLayer={false}
          loading={<div className="h-[14rem] bg-muted" />}
        />
      </button>
    </div>
  );
}

export function OrganizeTool() {
  const [file, setFile] = useState<File | null>(null);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [pagesInitialized, setPagesInitialized] = useState(false);
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

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const next = acceptedFiles[0] ?? null;
    setError(null);
    setFile(next);
    setPages([]);
    setSelected(new Set());
    setPagesInitialized(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: task.isRunning,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  const ids = useMemo(() => pages.map((p) => p.id), [pages]);
  const selectedCount = selected.size;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const removeByIds = useCallback((idsToRemove: Set<string>) => {
    setPages((prev) => prev.filter((p) => !idsToRemove.has(p.id)));
    setSelected((prev) => {
      const next = new Set(prev);
      idsToRemove.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  const rotate = useCallback((id: string, delta: 90 | -90) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, rotation: rotateValue(p.rotation, delta) } : p)),
    );
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setFile(null);
    setPages([]);
    setSelected(new Set());
    setPagesInitialized(false);
  }, []);

  const exportPdf = useCallback(async () => {
    setError(null);

    if (!file) {
      setError("Please upload a PDF first.");
      return;
    }

    if (pages.length === 0) {
      setError("Please keep at least one page before exporting.");
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

        const source = await loadPdfDocument(bytes);
        throwIfAborted();

        const out = await PDFDocument.create();

        for (let i = 0; i < pages.length; i += 1) {
          const item = pages[i];
          const [copied] = await out.copyPages(source, [item.pageNumber - 1]);
          if (item.rotation !== 0) copied.setRotation(degrees(item.rotation));
          out.addPage(copied);

          reportProgress(Math.round(((i + 1) / pages.length) * 100));
          throwIfAborted();
        }

        const outBytes = await out.save();
        throwIfAborted();
        downloadBytes(outBytes, "organized.pdf", "application/pdf");
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to export PDF.");
    }
  }, [file, pages, task]);

  return (
    <ToolLayout
      title="Organize PDF"
      description="Reorder, rotate, and remove pages."
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
            <Button
              type="button"
              variant="outline"
              onClick={() => removeByIds(new Set(selected))}
              disabled={selectedCount === 0 || task.isRunning}
            >
              Remove Selected
            </Button>
            <Button type="button" onClick={exportPdf} disabled={!file || pages.length === 0 || task.isRunning}>
              <DownloadIcon />
              {task.isRunning ? "Processing..." : "Download PDF"}
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

            <div className="text-sm text-muted-foreground">
              Selected: <span className="text-foreground">{selectedCount}</span> / {pages.length}
            </div>

            <ScrollArea className="h-[28rem]">
              <div className="pr-3">
                {workerReady ? (
                  <PdfDocument
                    file={file}
                    onLoadSuccess={({ numPages }: { numPages: number }) => {
                      if (pagesInitialized) return;
                      setPages(
                        Array.from({ length: numPages }, (_, i) => ({
                          id: crypto.randomUUID(),
                          pageNumber: i + 1,
                          rotation: 0,
                        })),
                      );
                      setPagesInitialized(true);
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
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={({ active, over }) => {
                        if (!over || active.id === over.id) return;
                        setPages((prev) => {
                          const oldIndex = prev.findIndex((p) => p.id === active.id);
                          const newIndex = prev.findIndex((p) => p.id === over.id);
                          return arrayMove(prev, oldIndex, newIndex);
                        });
                      }}
                    >
                      <SortableContext items={ids} strategy={rectSortingStrategy}>
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                          {pages.map((page) => (
                            <SortablePageTile
                              key={page.id}
                              page={page}
                              isSelected={selected.has(page.id)}
                              onToggle={() => toggleSelect(page.id)}
                              onRotateLeft={() => rotate(page.id, -90)}
                              onRotateRight={() => rotate(page.id, 90)}
                              onRemove={() => removeByIds(new Set([page.id]))}
                              disabled={task.isRunning}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
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
