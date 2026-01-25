import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MergeTool } from "@/components/tools/MergeTool";
import { SplitTool } from "@/components/tools/SplitTool";

export default function Home() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <Tabs defaultValue="merge" className="w-full">
        <TabsList className="w-full" variant="default">
          <TabsTrigger value="merge">Merge PDF</TabsTrigger>
          <TabsTrigger value="split">Split PDF</TabsTrigger>
        </TabsList>

        <TabsContent value="merge" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Merge PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <MergeTool />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="split" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Split PDF</CardTitle>
            </CardHeader>
            <CardContent>
              <SplitTool />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
