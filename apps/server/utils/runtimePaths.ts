import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export function findAppRoot(importMetaUrl: string): string {
  let currentDir = path.dirname(fileURLToPath(importMetaUrl));

  while (true) {
    if (fs.existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return path.dirname(fileURLToPath(importMetaUrl));
    }

    currentDir = parentDir;
  }
}

export function resolveFromAppRoot(importMetaUrl: string, ...segments: string[]): string {
  return path.resolve(findAppRoot(importMetaUrl), ...segments);
}
