"use client";

import type { CSSProperties } from "react";
import { useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { PDFDocument } from "pdf-lib";
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
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileTextIcon, GripVerticalIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { downloadBytes } from "@/lib/download";
import { cn } from "@/lib/utils";

type UploadedPdf = {
  id: string;
  file: File;
};

function SortableFileRow({
  item,
  onRemove,
  disabled,
}: {
  item: UploadedPdf;
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-background px-3 py-2",
        isDragging && "opacity-70",
      )}
    >
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

      <FileTextIcon className="size-4 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{item.file.name}</div>
        <div className="text-xs text-muted-foreground">
          {(item.file.size / (1024 * 1024)).toFixed(2)} MB
        </div>
      </div>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => onRemove(item.id)}
        disabled={disabled}
        aria-label={`Remove ${item.file.name}`}
      >
        <Trash2Icon />
      </Button>
    </div>
  );
}

export function MergeTool() {
  const [items, setItems] = useState<UploadedPdf[]>([]);
  const [isMerging, setIsMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ids = useMemo(() => items.map((i) => i.id), [items]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setError(null);

    const next: UploadedPdf[] = acceptedFiles.map((file) => ({
      id: crypto.randomUUID(),
      file,
    }));

    setItems((prev) => [...prev, ...next]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      "application/pdf": [".pdf"],
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const merge = useCallback(async () => {
    setError(null);

    if (items.length < 2) {
      setError("Please add at least two PDF files to merge.");
      return;
    }

    try {
      setIsMerging(true);
      const out = await PDFDocument.create();

      for (const item of items) {
        const bytes = await item.file.arrayBuffer();
        const src = await PDFDocument.load(bytes);
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const page of pages) out.addPage(page);
      }

      const merged = await out.save();
      downloadBytes(merged, "merged-document.pdf", "application/pdf");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to merge PDFs.");
    } finally {
      setIsMerging(false);
    }
  }, [items]);

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "cursor-pointer rounded-lg border border-dashed bg-background px-4 py-6 text-center transition-colors",
          isDragActive && "border-zinc-400",
        )}
      >
        <input {...getInputProps()} />
        <div className="text-sm font-medium">Drop PDF files here</div>
        <div className="mt-1 text-xs text-muted-foreground">
          Or click to browse. You can upload multiple PDFs.
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Files</div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems([])}
            disabled={items.length === 0 || isMerging}
          >
            Clear
          </Button>
        </div>
        <Separator />

        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            Add PDFs to begin.
          </div>
        ) : (
          <ScrollArea className="h-64">
            <div className="space-y-2 pr-3">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={({ active, over }) => {
                  if (!over || active.id === over.id) return;
                  setItems((prev) => {
                    const oldIndex = prev.findIndex((x) => x.id === active.id);
                    const newIndex = prev.findIndex((x) => x.id === over.id);
                    return arrayMove(prev, oldIndex, newIndex);
                  });
                }}
              >
                <SortableContext items={ids} strategy={verticalListSortingStrategy}>
                  {items.map((item) => (
                    <SortableFileRow
                      key={item.id}
                      item={item}
                      onRemove={remove}
                      disabled={isMerging}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </ScrollArea>
        )}
      </div>

      {error ? <div className="text-sm text-destructive">{error}</div> : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          onClick={merge}
          disabled={items.length < 2 || isMerging}
        >
          {isMerging ? "Merging..." : "Merge Files"}
        </Button>
      </div>
    </div>
  );
}
