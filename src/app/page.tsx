import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MergeTool } from "@/components/tools/MergeTool";
import { OcrTool } from "@/components/tools/OcrTool";
import { SplitTool } from "@/components/tools/SplitTool";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Tabs defaultValue="merge" className="w-full">
        <TabsList className="w-full" variant="default">
          <TabsTrigger value="merge">Merge PDF</TabsTrigger>
          <TabsTrigger value="split">Split PDF</TabsTrigger>
          <TabsTrigger value="ocr">OCR</TabsTrigger>
        </TabsList>

        <TabsContent value="merge" className="mt-4">
          <MergeTool />
        </TabsContent>

        <TabsContent value="split" className="mt-4">
          <SplitTool />
        </TabsContent>

        <TabsContent value="ocr" className="mt-4">
          <OcrTool />
        </TabsContent>
      </Tabs>
    </div>
  );
}
