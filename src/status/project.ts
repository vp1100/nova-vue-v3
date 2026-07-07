import { containsPath, exists, isIgnoredWorkspacePath, joinPath, nearestProjectRoot } from "@/workspace/paths";

export interface ProjectStatus {
  lines: string[];
  projectRoot: string | null;
}

export function formatProjectStatus(): ProjectStatus {
  const root = nova.workspace.path ?? null;
  const vuePath = activeVuePath();
  if (!root) {
    return {
      lines: ["Workspace: none", "Vue project root: none"],
      projectRoot: null
    };
  }

  const projectRoot = vuePath && containsPath(root, vuePath) ? nearestProjectRoot(vuePath, root) ?? root : root;
  return {
    lines: [
      `Workspace: ${root}`,
      `Vue file: ${vuePath ?? "none"}`,
      `Vue project root: ${projectRoot}`,
      `Project package.json: ${exists(joinPath(projectRoot, "package.json")) ? "yes" : "no"}`,
      `Project tsconfig: ${exists(joinPath(projectRoot, "tsconfig.json")) ? "yes" : "no"}`,
      `Project jsconfig: ${exists(joinPath(projectRoot, "jsconfig.json")) ? "yes" : "no"}`,
      `Project Vue dependency: ${exists(joinPath(projectRoot, "node_modules", "vue", "package.json")) ? "yes" : "no"}`,
      `Project TypeScript dependency: ${exists(joinPath(projectRoot, "node_modules", "typescript", "package.json")) ? "yes" : "no"}`
    ],
    projectRoot
  };
}

function activeVuePath(): string | null {
  const active = nova.workspace.activeTextEditor?.document;
  if (active?.syntax === "vue" && typeof active.path === "string" && !isIgnoredWorkspacePath(active.path)) {
    return active.path;
  }
  const document = nova.workspace.textDocuments.find(
    (item) => item.syntax === "vue" && typeof item.path === "string" && !isIgnoredWorkspacePath(item.path)
  );
  return document?.path ?? null;
}
