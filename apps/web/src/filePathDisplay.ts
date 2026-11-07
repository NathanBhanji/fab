import { fileBasename } from "@fab/shared/path";
import { formatFilePathPosition, splitFilePathPosition } from "@fab/shared/fileLinks";

function normalizePathSeparators(path: string): string {
  return path.replaceAll("\\", "/");
}

function trimTrailingPathSeparators(path: string): string {
  return path.replace(/[\\/]+$/, "");
}

function stripRelativePrefixes(path: string): string {
  return path.replace(/^\.\/+/, "").replace(/^\/+/, "");
}

export function formatWorkspaceRelativePath(
  pathWithPosition: string,
  workspaceRoot: string | undefined,
): string {
  const position = splitFilePathPosition(pathWithPosition);
  const normalizedPath = normalizePathSeparators(position.path);

  let displayPath = normalizedPath;
  if (workspaceRoot) {
    const normalizedWorkspaceRoot = normalizePathSeparators(
      trimTrailingPathSeparators(workspaceRoot),
    );
    const workspaceLabel = fileBasename(normalizedWorkspaceRoot);

    if (normalizedPath === normalizedWorkspaceRoot) {
      displayPath = workspaceLabel;
    } else if (normalizedPath.startsWith(`${normalizedWorkspaceRoot}/`)) {
      const relativeSuffix = normalizedPath.slice(normalizedWorkspaceRoot.length + 1);
      displayPath = `${workspaceLabel}/${relativeSuffix}`;
    } else if (!normalizedPath.startsWith("/")) {
      const relativePath = stripRelativePrefixes(normalizedPath);
      displayPath = normalizedPath.startsWith(`${workspaceLabel}/`)
        ? normalizedPath
        : `${workspaceLabel}/${relativePath}`;
    }
  }

  return formatFilePathPosition({ ...position, path: displayPath });
}
