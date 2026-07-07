export type ToolSource = "custom" | "workspace" | "bundled";

export interface ToolPath {
  path: string;
  source: ToolSource;
  kind: "script" | "executable";
}

export interface TypeScriptSdkPath {
  path: string;
  source: ToolSource;
}

export interface Toolchain {
  server: ToolPath | null;
  tsdk: TypeScriptSdkPath | null;
  errors: string[];
  hints: string[];
}

export interface ToolchainResolutionOptions {
  preferBundledTsdk?: boolean;
}
