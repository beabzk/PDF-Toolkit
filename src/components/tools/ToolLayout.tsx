"use client";

import type { ReactNode } from "react";

import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function ToolLayout({
  title,
  description,
  headerActions,
  children,
  error,
  progress,
  progressLabel,
  footer,
  className,
}: {
  title: string;
  description?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  error?: string | null;
  progress?: number | null;
  progressLabel?: string;
  footer?: ReactNode;
  className?: string;
}) {
  const showProgress = typeof progress === "number";
  const showFooter = !!footer || !!error || showProgress;

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {headerActions ? <CardAction>{headerActions}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {showFooter ? (
        <CardFooter className="flex flex-col items-stretch gap-3">
          {showProgress ? (
            <div className="space-y-2">
              {progressLabel ? (
                <div className="text-xs text-muted-foreground">{progressLabel}</div>
              ) : null}
              <Progress value={progress ?? 0} />
            </div>
          ) : null}
          {error ? <div className="text-sm text-destructive">{error}</div> : null}
          {footer ? <div className="flex items-center justify-end gap-2">{footer}</div> : null}
        </CardFooter>
      ) : null}
    </Card>
  );
}
