"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MergeTool } from "@/components/tools/MergeTool";
import { OrganizeTool } from "@/components/tools/OrganizeTool";
import { OcrTool } from "@/components/tools/OcrTool";
import { PdfToImagesTool } from "@/components/tools/PdfToImagesTool";
import { SplitTool } from "@/components/tools/SplitTool";

const TOOL_KEYS = ["merge", "organize", "split", "images", "ocr"] as const;
type ToolKey = (typeof TOOL_KEYS)[number];

function isToolKey(value: string | null): value is ToolKey {
  return value !== null && TOOL_KEYS.includes(value as ToolKey);
}

export function ToolTabs() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const value = useMemo<ToolKey>(() => {
    const fromUrl = searchParams.get("tool");
    return isToolKey(fromUrl) ? fromUrl : "merge";
  }, [searchParams]);

  const onValueChange = useCallback(
    (nextValue: string) => {
      if (!isToolKey(nextValue)) return;
      const params = new URLSearchParams(searchParams.toString());

      if (nextValue === "merge") {
        params.delete("tool");
      } else {
        params.set("tool", nextValue);
      }

      const query = params.toString();
      const nextUrl = query ? `${pathname}?${query}` : pathname;
      router.replace(nextUrl, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  return (
    <div className="mx-auto w-full max-w-3xl">
      <Tabs value={value} onValueChange={onValueChange} className="w-full">
        <TabsList className="w-full" variant="default">
          <TabsTrigger value="merge">Merge PDF</TabsTrigger>
          <TabsTrigger value="organize">Organize PDF</TabsTrigger>
          <TabsTrigger value="split">Split PDF</TabsTrigger>
          <TabsTrigger value="images">PDF to Images</TabsTrigger>
          <TabsTrigger value="ocr">OCR</TabsTrigger>
        </TabsList>

        <TabsContent value="merge" className="mt-4">
          <MergeTool />
        </TabsContent>

        <TabsContent value="organize" className="mt-4">
          <OrganizeTool />
        </TabsContent>

        <TabsContent value="split" className="mt-4">
          <SplitTool />
        </TabsContent>

        <TabsContent value="images" className="mt-4">
          <PdfToImagesTool />
        </TabsContent>

        <TabsContent value="ocr" className="mt-4">
          <OcrTool />
        </TabsContent>
      </Tabs>
    </div>
  );
}
