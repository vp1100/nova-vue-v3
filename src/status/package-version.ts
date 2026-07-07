import type { ToolPath, TypeScriptSdkPath } from "@/toolchain/types";

import { joinPath } from "@/workspace/paths";
import { readTextFile } from "./environment";

export function formatVueLanguageServerVersion(server: ToolPath | null, projectRoot: string | null): string {
  if (server) {
    const version = packageVersion(serverPackageJsonPath(server, projectRoot));
    return version ? `${version} (${server.source})` : `unknown (${server.source})`;
  }

  const projectVersion = projectRoot ? packageVersion(joinPath(projectRoot, "node_modules", "@vue", "language-server", "package.json")) : null;
  if (projectVersion) {
    return `${projectVersion} (workspace available)`;
  }

  const bundledVersion = packageVersion(joinPath(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json"));
  return bundledVersion ? `${bundledVersion} (bundled available)` : "not resolved";
}

export function formatTypeScriptVersion(tsdk: TypeScriptSdkPath | null, projectRoot: string | null): string {
  if (tsdk) {
    const version = packageVersion(tsdkPackageJsonPath(tsdk, projectRoot));
    return version ? `${version} (${tsdk.source})` : `unknown (${tsdk.source})`;
  }

  const projectVersion = projectRoot ? packageVersion(joinPath(projectRoot, "node_modules", "typescript", "package.json")) : null;
  if (projectVersion) {
    return `${projectVersion} (workspace available)`;
  }

  const bundledVersion = packageVersion(joinPath(nova.extension.path, "Support", "server", "node_modules", "typescript", "package.json"));
  return bundledVersion ? `${bundledVersion} (bundled available)` : "not resolved";
}

function serverPackageJsonPath(server: ToolPath, projectRoot: string | null): string | null {
  const marker = "/node_modules/@vue/language-server/";
  const index = server.path.indexOf(marker);
  if (index >= 0) {
    return `${server.path.slice(0, index + marker.length - 1)}/package.json`;
  }
  if (server.source === "workspace" && projectRoot) {
    return joinPath(projectRoot, "node_modules", "@vue", "language-server", "package.json");
  }
  if (server.source === "bundled") {
    return joinPath(nova.extension.path, "Support", "server", "node_modules", "@vue", "language-server", "package.json");
  }
  return null;
}

function tsdkPackageJsonPath(tsdk: TypeScriptSdkPath, projectRoot: string | null): string | null {
  const marker = "/node_modules/typescript/lib";
  const index = tsdk.path.indexOf(marker);
  if (index >= 0) {
    return `${tsdk.path.slice(0, index + marker.length - 4)}/package.json`;
  }
  if (tsdk.source === "workspace" && projectRoot) {
    return joinPath(projectRoot, "node_modules", "typescript", "package.json");
  }
  if (tsdk.source === "bundled") {
    return joinPath(nova.extension.path, "Support", "server", "node_modules", "typescript", "package.json");
  }
  return null;
}

function packageVersion(packageJsonPath: string | null): string | null {
  if (!packageJsonPath) {
    return null;
  }
  const text = readTextFile(packageJsonPath);
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim() ? parsed.version : null;
  } catch {
    return null;
  }
}
