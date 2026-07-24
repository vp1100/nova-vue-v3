export function formatNovaVersion(): string {
  return nova.versionString.trim() || nova.version.join(".");
}

export function formatMacOSVersion(): string {
  return nova.systemVersion.join(".");
}

export function readTextFile(path: string): string | null {
  try {
    const file = nova.fs.open(path);
    try {
      return file.read();
    } finally {
      file.close();
    }
  } catch {
    return null;
  }
}
