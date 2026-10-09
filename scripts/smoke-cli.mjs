import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "mobgap-release-smoke-"));
const platform = process.platform === "win32" ? "windows" : process.platform;
const archive = join(
  root,
  "cli/dist/releases",
  `mobgap-${platform}-${process.arch}.tar.gz`,
);
try {
  execFileSync("tar", ["-xzf", archive, "-C", directory]);
  const executable = join(
    directory,
    process.platform === "win32" ? "mobgap.exe" : "mobgap",
  );
  const fixtures = join(root, "mobgap/example_data/data/lab/HA/001");
  copyFileSync(join(fixtures, "data.mat"), join(directory, "input.mat"));
  copyFileSync(
    join(fixtures, "infoForAlgo.mat"),
    join(directory, "metadata.mat"),
  );
  const run = (args) =>
    execFileSync(executable, args, {
      cwd: directory,
      encoding: "utf8",
      timeout: 180_000,
      env: { ...process.env, PATH: "", PYTHONHOME: "", PYTHONPATH: "" },
      stdio: ["ignore", "pipe", "inherit"],
    });
  assert.match(run(["--help"]), /list-recordings/);
  const index = JSON.parse(run(["list-recordings", "input.mat", "--json"]));
  assert.equal(index.rows.length, 3);
  run([
    "run-pipeline",
    "input.mat",
    "--metadata",
    "metadata.mat",
    "--cohort",
    "HA",
    "--recording",
    "1",
    "--output",
    "results",
  ]);
  const summary = JSON.parse(
    readFileSync(join(directory, "results/summary.json"), "utf8"),
  );
  assert.equal(summary.recordings[0].status, "complete");
  const result = JSON.parse(
    readFileSync(
      join(directory, "results", summary.recordings[0].result),
      "utf8",
    ),
  );
  assert.equal(result.summary.samples, 1246);
  assert.equal(result.summary.initialContacts, 11);
  assert.equal(result.preset, "healthy");
  assert.match(run(["--licenses"]), /effect@4\.0\.2/);
  console.log(
    `Verified ${platform}-${process.arch}: help, MATLAB index, full pipeline and notices.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
