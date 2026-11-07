import type { ReactNode } from "react";

export function ScreenContent({
  children,
}: {
  readonly children: ReactNode;
  readonly insetHorizontal?: boolean;
  readonly fitToContents?: boolean;
}) {
  return children;
}
