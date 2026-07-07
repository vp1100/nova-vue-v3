import type { ExtensionConfig } from "@/config/types";
import type { TsserverBridge } from "@/tsserver/bridge";

export interface LanguageActionContext {
  ensureStarted(reason: string): void;
  client(): LanguageClient | null;
  tsserverBridge(): TsserverBridge | null;
  debugConfig(): ExtensionConfig | null;
  syncEditorWithTsserver(editor: TextEditor): Promise<void>;
  collectTypeScriptDiagnostics(file: string): Promise<unknown[]>;
  refreshCapabilities(): Promise<Record<string, unknown> | null>;
}
