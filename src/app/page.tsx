import { Suspense } from "react";

import { ToolTabs } from "@/components/tools/ToolTabs";

export default function Home() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading tools...</div>}>
      <ToolTabs />
    </Suspense>
  );
}
