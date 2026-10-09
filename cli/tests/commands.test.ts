import { expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";

const main = resolve(import.meta.dir, "../src/main.ts");
const mat = resolve(
  import.meta.dir,
  "../../mobgap/example_data/data/lab/HA/001/data.mat",
);
const cwa = resolve(
  import.meta.dir,
  "../../mobgap/example_data/data/ax6/example-610-steps.cwa",
);
async function cli(...args: string[]) {
  const child = Bun.spawn([process.execPath, main, ...args], {
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

test("help is available without preparing the scientific runtime", async () => {
  const result = await cli("--help");
  expect(result.code).toBe(0);
  expect(result.stdout).toContain("list-recordings");
  expect(result.stdout).toContain("run-pipeline");
  expect(result.stderr).not.toContain("Starting");
});

test("MATLAB recordings can be listed without participant measurements", async () => {
  const result = await cli("list-recordings", mat, "--json");
  expect(result.code).toBe(0);
  const index = JSON.parse(result.stdout);
  expect(index.rows.map((row: { index: unknown }) => row.index)).toEqual([
    { time_measure: "TimeMeasure1", test: "Test5", trial: "Trial1" },
    { time_measure: "TimeMeasure1", test: "Test5", trial: "Trial2" },
    { time_measure: "TimeMeasure1", test: "Test11", trial: "Trial1" },
  ]);
}, 60_000);

test("CWA listing uses the synchronization timezone without patient metadata", async () => {
  const result = await cli(
    "list-recordings",
    cwa,
    "--timezone",
    "Europe/Berlin",
    "--split",
    "file",
    "--json",
  );
  expect(result.code).toBe(0);
  const index = JSON.parse(result.stdout);
  expect(index.split).toBe("file");
  expect(
    index.rows.map(
      (row: { index: Record<string, string> }) => row.index.start_time,
    ),
  ).toEqual(["2012-03-27 11:14:57.500000+02:00"]);
}, 60_000);

test("missing CWA timezone fails before initializing WASM", async () => {
  const result = await cli("list-recordings", cwa);
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain("require --timezone");
  expect(result.stderr).not.toContain("Starting");
});

test("a selected MATLAB trial exports scientific results and all CSV tables", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "mobgap-cli-test-"));
  const output = resolve(directory, "results");
  try {
    const run = await cli(
      "run-pipeline",
      mat,
      "--cohort",
      "HA",
      "--participant-height",
      "1.75",
      "--sensor-height",
      "0.95",
      "--preset",
      "healthy",
      "--recording",
      "1",
      "--recording",
      "1",
      "--output",
      output,
    );
    expect(run.code).toBe(0);
    const summary = JSON.parse(
      readFileSync(resolve(output, "summary.json"), "utf8"),
    );
    expect(
      summary.recordings.map((row: { recording: number }) => row.recording),
    ).toEqual([1]);
    expect(summary.environment.id).toMatch(/^[a-f0-9]{64}$/);
    const resultPath = resolve(output, summary.recordings[0].result);
    const result = JSON.parse(readFileSync(resultPath, "utf8"));
    expect(result.summary).toMatchObject({
      samples: 1246,
      gaitSequences: 1,
      initialContacts: 11,
      walkingBouts: 1,
      strides: 9,
    });
    expect(
      Object.fromEntries(
        Object.entries(result.tables).map(([name, table]) => [
          name,
          (table as { rows: unknown[] }).rows.length,
        ]),
      ),
    ).toEqual({
      gait_sequences: 1,
      initial_contacts: 11,
      turns: 0,
      per_second_parameters: 7,
      raw_per_stride_parameters: 9,
      per_stride_parameters: 9,
      walking_bouts: 1,
      aggregated_parameters: 1,
    });
    const files = readdirSync(resolve(resultPath, ".."));
    expect(files.filter((file) => file.endsWith(".csv"))).toHaveLength(8);
    const csv = readFileSync(
      resolve(resultPath, "../healthy-initial_contacts.csv"),
      "utf8",
    );
    expect(csv.split("\r\n")).toHaveLength(12); // Header + 11 contacts.
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 60_000);

test("an existing output directory is preserved", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "mobgap-cli-existing-"));
  try {
    writeFileSync(resolve(directory, "keep.txt"), "previous results");
    const result = await cli(
      "run-pipeline",
      mat,
      "--cohort",
      "HA",
      "--participant-height",
      "1.75",
      "--sensor-height",
      "0.95",
      "--output",
      directory,
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).not.toContain("Starting");
    expect(readFileSync(resolve(directory, "keep.txt"), "utf8")).toBe(
      "previous results",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a CWA row failure is saved and exits nonzero", async () => {
  const directory = mkdtempSync(resolve(tmpdir(), "mobgap-cli-cwa-"));
  const output = resolve(directory, "results");
  try {
    // This real fixture has acceleration only, so the shared pipeline rejects it.
    const result = await cli(
      "run-pipeline",
      cwa,
      "--timezone",
      "Europe/Berlin",
      "--split",
      "file",
      "--participant-height",
      "1.75",
      "--sensor-height",
      "0.95",
      "--cohort",
      "PD",
      "--setting",
      "free-living",
      "--preset",
      "impaired",
      "--output",
      output,
    );
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("acceleration and gyroscope axes");
    const summary = JSON.parse(
      readFileSync(resolve(output, "summary.json"), "utf8"),
    );
    expect(summary.configuration.measurementCondition).toBe("free_living");
    expect(summary.recordings).toMatchObject([
      { recording: 1, status: "error" },
    ]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 60_000);

test("Ctrl+C stops WASM initialization and the worker exits", async () => {
  const child = Bun.spawn([process.execPath, main, "list-recordings", mat], {
    stdout: "pipe",
    stderr: "pipe",
  });
  try {
    const reader = child.stderr.getReader();
    let stderr = "";
    while (!stderr.includes("Starting")) {
      const next = await reader.read();
      if (next.done) throw new Error("CLI exited before initialization.");
      stderr += new TextDecoder().decode(next.value);
    }
    child.kill("SIGINT");
    expect(await child.exited).toBe(130);
    reader.releaseLock();
  } finally {
    child.kill();
  }
}, 10_000);
