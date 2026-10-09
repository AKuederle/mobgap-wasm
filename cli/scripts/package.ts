import { mkdirSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const cli = resolve(import.meta.dir, "..");
const output = join(cli, "dist");
const releases = join(output, "releases");
mkdirSync(releases, { recursive: true });
const targets = readdirSync(output, { withFileTypes: true }).filter(
  (entry) =>
    entry.isDirectory() &&
    /^(linux|darwin|windows)-(x64|arm64)$/.test(entry.name),
);
if (!targets.length)
  throw new Error("Cross-compile first: npm run cli:build -- --all");
for (const { name } of targets) {
  const executable = name.startsWith("windows") ? "mobgap.exe" : "mobgap";
  const archive = join(releases, `mobgap-${name}.tar.gz`);
  const result = Bun.spawnSync(
    [
      "tar",
      "-czf",
      archive,
      "-C",
      join(output, name),
      executable,
      "THIRD_PARTY_NOTICES.txt",
      "-C",
      cli,
      "README.md",
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  if (result.exitCode !== 0) throw new Error(`Could not package ${name}.`);
  console.log(`Packaged ${archive}`);
}
