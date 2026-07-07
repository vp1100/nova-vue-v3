declare const nova: {
  extension: {
    identifier: string;
    name: string;
    version: string;
    path: string;
  };
  workspace: {
    path?: string | null;
    activeTextEditor?: TextEditor | null;
    textDocuments: TextDocument[];
    textEditors: TextEditor[];
    config: Configuration;
    contains(path: string): boolean;
    onDidAddTextEditor(callback: (editor: TextEditor) => void): Disposable;
    onDidOpenTextDocument(callback: (document: TextDocument) => void): Disposable;
    showErrorMessage(message: string): void;
    showInformativeMessage(message: string): void;
    showWarningMessage(message: string): void;
    showInputPalette(message: string, options: { placeholder?: string; value?: string }, callback: (value: string | null) => void): void;
    showChoicePalette(choices: string[], options: { placeholder?: string }, callback: (choice: string | null, index: number | null) => void): void;
    openFile(uri: string, options?: { line?: number; column?: number }): Promise<TextEditor | null>;
    openConfig(identifier?: string): void;
  };
  config: Configuration;
  path: {
    join(...parts: string[]): string;
  };
  fs: {
    F_OK: number;
    R_OK: number;
    X_OK: number;
    access(path: string, modes: number): boolean;
    open(path: string): File;
    watch(pattern: string | null, callback: (...args: unknown[]) => void): Disposable;
  };
  commands: {
    register(command: string, callback: (...args: unknown[]) => unknown): Disposable;
  };
  assistants: {
    registerColorAssistant(selector: string | { syntax: string } | Array<string | { syntax: string }>, object: ColorAssistant): Disposable;
  };
};

interface Disposable {
  dispose(): void;
}

interface File {
  read(): string;
  close(): void;
}

interface Configuration {
  get(key: string, coerce?: "string" | "number" | "array" | "boolean"): any;
  set(key: string, value: string | number | boolean | string[] | null | undefined): void;
  remove(key: string): void;
  onDidChange(key: string, callback: (newValue: unknown, oldValue: unknown) => void): Disposable;
}

interface TextDocument {
  readonly uri: string;
  readonly path?: string | null;
  readonly isRemote: boolean;
  readonly isDirty: boolean;
  readonly isUntitled: boolean;
  readonly length: number;
  readonly syntax?: string | null;
  onDidChangeSyntax(callback: (document: TextDocument, syntax?: string | null) => void): Disposable;
}

interface TextEditor {
  readonly document: TextDocument;
  selectedRange: Range;
  selectedRanges: Range[];
  readonly selectedText: string;
  getTextInRange(range: Range): string;
  edit(callback: (edit: TextEditorEdit) => void): Promise<void>;
  selectWordsContainingCursors(): void;
  scrollToCursorPosition(): void;
  onDidChange(callback: (editor: TextEditor) => void): Disposable;
  onDidStopChanging(callback: (editor: TextEditor) => void): Disposable;
  onDidSave(callback: (editor: TextEditor) => void): Disposable;
  onDidDestroy(callback: (editor: TextEditor) => void): Disposable;
}

interface TextEditorEdit {
  replace(range: Range, text: string): void;
  insert(position: number, text: string): void;
  delete(range: Range): void;
}

interface ColorAssistant {
  provideColors(editor: TextEditor, context: ColorInformationContext): ColorInformation[] | Promise<ColorInformation[]>;
}

interface ColorInformationContext {
  readonly candidates: ColorCandidate[];
}

interface ColorCandidate {
  readonly range: Range;
  readonly text: string;
}

declare const ColorFormat: {
  rgb: ColorFormat;
  hsl: ColorFormat;
  hsb: ColorFormat;
  displayP3: ColorFormat;
};

type ColorFormat = "rgb" | "hsl" | "hsb" | "p3";

declare class Color {
  constructor(format: ColorFormat, components: number[]);
  readonly format: ColorFormat;
  readonly components: number[];
  static rgb(red: number, green: number, blue: number, alpha?: number): Color;
  static hsl(hue: number, saturation: number, luminance: number, alpha?: number): Color;
  static hsb(hue: number, saturation: number, brightness: number, alpha?: number): Color;
  static displayP3(red: number, green: number, blue: number, alpha?: number): Color;
  convert(format: ColorFormat): Color;
}

declare class ColorInformation {
  constructor(range: Range, color: Color, kind?: string);
  color: Color;
  kind?: string;
  range: Range;
  usesFloats?: boolean;
}

declare class Range {
  constructor(start: number, end: number);
  readonly start: number;
  readonly end: number;
  readonly length: number;
}

declare const IssueSeverity: {
  Error: IssueSeverity;
  Warning: IssueSeverity;
  Hint: IssueSeverity;
  Info: IssueSeverity;
};

type IssueSeverity = number;

declare class Issue {
  constructor();
  code?: string | number | null;
  message: string;
  severity: IssueSeverity;
  source?: string | null;
  textRange?: Range | null;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

declare class IssueCollection {
  constructor(name?: string);
  readonly name: string;
  append(uri: string, issues: Issue[]): void;
  dispose(): void;
  clear(): void;
  has(uri: string): boolean;
  get(uri: string): Issue[];
  set(uri: string, issues: Issue[]): void;
  remove(uri: string): void;
}

declare class LanguageClient {
  constructor(identifier: string, name: string, serverOptions: unknown, clientOptions: unknown);
  readonly running: boolean;
  start(): void;
  stop(): void;
  onDidStop(callback: (error?: Error) => void): Disposable;
  onNotification(method: string, callback: (params: any) => void): void;
  onRequest(method: string, callback: (params: any) => unknown): void;
  sendNotification(method: string, params?: unknown): void;
  sendRequest(method: string, params?: unknown): Promise<unknown>;
}

interface ProcessOptions {
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stdio?: "pipe" | "ignore" | "jsonrpc" | Array<"pipe" | "ignore" | number>;
  shell?: boolean | string;
}

declare class Process {
  constructor(command: string, options?: ProcessOptions);
  readonly pid: number;
  start(): void;
  terminate(): void;
  kill(): void;
  onDidExit(callback: (status: number) => void): Disposable;
  request(methodName: string, params?: unknown): Promise<unknown>;
  notify(methodName: string, params?: unknown): void;
}
