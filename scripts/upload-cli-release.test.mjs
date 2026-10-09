import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

test("release retry preserves completed downloads and replaces failed uploads", () => {
  const directory = mkdtempSync(join(tmpdir(), "mobgap-release-"));
  try {
    const downloads = join(directory, "downloads");
    mkdirSync(downloads);
    for (const name of ["complete.tar.gz", "failed.tar.gz", "missing.tar.gz"])
      writeFileSync(join(downloads, name), "archive");
    const calls = join(directory, "calls.jsonl");
    writeFileSync(
      join(directory, "gh"),
      `#!${process.execPath}
const fs = require("node:fs");
const args = process.argv.slice(2);
if (args[0] === "api" && args.length === 2 || args[0] === "release" && args[1] === "view") {
  console.log(JSON.stringify({ assets: [
    { id: 1, name: "complete.tar.gz", state: "uploaded" },
    { id: 2, name: "failed.tar.gz", state: "starter" }
  ] }));
} else fs.appendFileSync(process.env.CALLS, JSON.stringify(args) + "\\n");
`,
      { mode: 0o755 },
    );
    execFileSync(
      process.execPath,
      [resolve("scripts/upload-cli-release.mjs"), downloads],
      {
        env: {
          ...process.env,
          PATH: directory,
          CLI_TAG: "v0.1.0",
          GH_REPO: "owner/repo",
          CALLS: calls,
        },
      },
    );
    assert.deepEqual(
      readFileSync(calls, "utf8").trim().split("\n").map(JSON.parse),
      [
        ["api", "repos/owner/repo/releases/assets/2", "--method", "DELETE"],
        ["release", "upload", "v0.1.0", join(downloads, "failed.tar.gz")],
        ["release", "upload", "v0.1.0", join(downloads, "missing.tar.gz")],
      ],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
