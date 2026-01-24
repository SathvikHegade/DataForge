import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  radius?: string | number;
}

export function Skeleton({ width, height, radius, className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-muted/40",
        className
      )}
      style={{
        width,
        height,
        borderRadius: radius,
      }}
      {...props}
    />
  );
}
