import { join, resolve } from "node:path";

export const runtimeRoot = Bun.isStandaloneExecutable
  ? join(import.meta.dir, "runtime")
  : resolve(import.meta.dir, "../build/runtime");
