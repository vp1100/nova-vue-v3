import type { ExtensionConfig } from "@/config/types";

import { containsPath, isIgnoredWorkspacePath, nearestProjectRootsFromFile } from "@/workspace/paths";

export function workspacePath(): string | null {
  return nova.workspace.path ?? null;
}

export function activeDocumentPath(): string | null {
  return nova.workspace.activeTextEditor?.document.path ?? null;
}

export function openVueDocumentPaths(): string[] {
  return nova.workspace.textDocuments
    .filter((document) => document.syntax === "vue" && typeof document.path === "string" && !isIgnoredWorkspacePath(document.path))
    .map((document) => document.path as string);
}

export function toolchainRoots(config: ExtensionConfig): string[] {
  const roots: string[] = [];
  const root = workspacePath();
  if (!root) {
    return roots;
  }

  if (!config.workspaceDiscoveryEnabled) {
    return [root];
  }

  const activePath = activeDocumentPath();
  if (activePath && containsPath(root, activePath) && !isIgnoredWorkspacePath(activePath)) {
    for (const candidate of nearestProjectRootsFromFile(activePath, root)) {
      pushUnique(roots, candidate);
    }
  }

  for (const documentPath of openVueDocumentPaths()) {
    if (!containsPath(root, documentPath)) {
      continue;
    }
    for (const candidate of nearestProjectRootsFromFile(documentPath, root)) {
      pushUnique(roots, candidate);
    }
  }

  pushUnique(roots, root);
  return roots;
}

function pushUnique(paths: string[], path: string): void {
  if (!paths.includes(path)) {
    paths.push(path);
  }
}
