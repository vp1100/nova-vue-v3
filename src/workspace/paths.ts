const IGNORED_WORKSPACE_SEGMENTS = new Set(["node_modules", ".git", "dist", "coverage", ".nuxt", ".output"]);

export function joinPath(...parts: string[]): string {
  return nova.path.join(...parts);
}

export function dirname(path: string): string {
  const normalized = path.replace(/\/+$/, "");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "/";
}

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
}

export function exists(path: string): boolean {
  try {
    return nova.fs.access(path, nova.fs.F_OK);
  } catch {
    return false;
  }
}

export function isReadable(path: string): boolean {
  try {
    return nova.fs.access(path, nova.fs.R_OK);
  } catch {
    return false;
  }
}

export function isExecutable(path: string): boolean {
  try {
    return nova.fs.access(path, nova.fs.X_OK);
  } catch {
    return false;
  }
}

export function containsPath(root: string, path: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function isIgnoredWorkspacePath(path: string | null | undefined): boolean {
  if (!path) {
    return false;
  }
  return path.split("/").some((segment) => IGNORED_WORKSPACE_SEGMENTS.has(segment));
}

export function workspaceContains(path: string | null | undefined): string {
  if (!path) {
    return "unknown";
  }
  try {
    return nova.workspace.contains(path) ? "yes" : "no";
  } catch {
    return "unknown";
  }
}

export function hasProjectMarker(path: string): boolean {
  return exists(joinPath(path, "package.json")) || exists(joinPath(path, "tsconfig.json")) || exists(joinPath(path, "jsconfig.json"));
}

export function nearestProjectRoot(filePath: string, workspaceRoot: string): string | null {
  let current = dirname(filePath);
  while (containsPath(workspaceRoot, current)) {
    if (hasProjectMarker(current)) {
      return current;
    }
    if (current === workspaceRoot) {
      break;
    }
    current = dirname(current);
  }
  return null;
}

export function nearestProjectRootsFromFile(filePath: string, workspaceRoot: string): string[] {
  const roots: string[] = [];
  let current = dirname(filePath);

  while (containsPath(workspaceRoot, current)) {
    if (hasProjectMarker(current) && !roots.includes(current)) {
      roots.push(current);
    }
    if (current === workspaceRoot) {
      break;
    }
    current = dirname(current);
  }

  return roots;
}

export function relativeWorkspacePath(path: string): string {
  const root = nova.workspace.path;
  if (root && containsPath(root, path)) {
    return path === root ? "." : path.slice(root.length + 1);
  }
  return path;
}
