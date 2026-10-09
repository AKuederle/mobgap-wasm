import { expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

test("the compiled executable lists and analyzes with no host runtime or project files", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "mobgap-cli-standalone-"));
  const executable = resolve(
    directory,
    process.platform === "win32" ? "mobgap.exe" : "mobgap",
  );
  copyFileSync(
    resolve(
      import.meta.dir,
      "../dist",
      process.platform === "win32" ? "mobgap.exe" : "mobgap",
    ),
    executable,
  );
  const fixtures = resolve(
    import.meta.dir,
    "../../mobgap/example_data/data/lab/HA/001",
  );
  copyFileSync(resolve(fixtures, "data.mat"), resolve(directory, "input.mat"));
  copyFileSync(
    resolve(fixtures, "infoForAlgo.mat"),
    resolve(directory, "metadata.mat"),
  );
  async function run(...args: string[]) {
    const child = Bun.spawn([executable, ...args], {
      cwd: directory,
      env: { PATH: "/no-host-runtime" },
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { stdout, stderr, code };
  }
  try {
    const listing = await run("list-recordings", "input.mat");
    expect(listing.code).toBe(0);
    expect(listing.stdout).toContain("TimeMeasure1");
    expect(listing.stdout).toContain("Test11");
    const analysis = await run(
      "run-pipeline",
      "input.mat",
      "--metadata",
      "metadata.mat",
      "--cohort",
      "HA",
      "--output",
      "results",
    );
    expect(analysis.code).toBe(0);
    const summary = JSON.parse(
      readFileSync(resolve(directory, "results/summary.json"), "utf8"),
    );
    expect(
      summary.recordings.map((row: { recording: number }) => row.recording),
    ).toEqual([1, 2, 3]);
    expect(
      summary.recordings.every(
        (row: { status: string }) => row.status === "complete",
      ),
    ).toBe(true);
    const result = JSON.parse(
      readFileSync(
        resolve(directory, "results", summary.recordings[0].result),
        "utf8",
      ),
    );
    expect(result.preset).toBe("healthy");
    expect(result.summary.samples).toBe(1246);
    const licenses = await run("--licenses");
    expect(licenses.code).toBe(0);
    expect(licenses.stdout).toContain("effect@4.0.2");
    expect(licenses.stderr).not.toContain("Starting");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 90_000);
