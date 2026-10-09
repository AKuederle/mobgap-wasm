import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Effect, Option } from "effect";
import { Argument, CliError, Command, Flag } from "effect/cli";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { filenamePart, tableCsv } from "../../src/lib/result-download";
import type {
  DatasetConfiguration,
  DatasetIndex,
  ProcessEvent,
} from "../../src/lib/contracts";
import { version } from "../package.json";
import type { RuntimeEnvironment, RuntimeMessage } from "./protocol";
import { runRuntime } from "./runtime";
import { runtimeRoot } from "./assets";

const userError = (cause: unknown) => new CliError.UserError({ cause });
const attempt = <A>(run: () => A) => Effect.try({ try: run, catch: userError });

const shared = {
  file: Argument.File("file", { mustExist: true }),
  format: Flag.Literals("format", ["auto", "mat", "cwa"]).pipe(
    Flag.withDefault("auto"),
  ),
  timezone: Flag.String("timezone").pipe(Flag.optional),
  split: Flag.Literals("split", ["auto", "days", "file"]).pipe(
    Flag.withDefault("auto"),
  ),
};

interface Input {
  file: string;
  format: "auto" | "mat" | "cwa";
  timezone: Option.Option<string>;
  split: "auto" | "days" | "file";
}

function configuration(input: Input): DatasetConfiguration {
  const format =
    input.format === "auto"
      ? extname(input.file).slice(1).toLowerCase()
      : input.format;
  if (format !== "mat" && format !== "cwa")
    throw new Error("Use a .mat or .cwa file, or specify --format.");
  const timezone = Option.getOrUndefined(input.timezone);
  if (format === "cwa" && !timezone)
    throw new Error(
      "CWA recordings require --timezone, the sensor synchronization timezone.",
    );
  if (timezone) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      throw new Error(`Unknown timezone: ${timezone}`);
    }
  }
  if (format === "mat" && (timezone || input.split !== "auto"))
    throw new Error("--timezone and --split apply only to CWA recordings.");
  return {
    format,
    timezone,
    split: input.split,
    cohort: "",
    measurementCondition: "laboratory",
  };
}

function printIndex(index: DatasetIndex) {
  const columns = [
    ...new Set(index.rows.flatMap((row) => Object.keys(row.index))),
  ];
  const rows = [
    ["#", ...columns],
    ...index.rows.map((row, number) => [
      String(number + 1),
      ...columns.map((column) => row.index[column] ?? ""),
    ]),
  ];
  const widths = columns.map((_, column) =>
    Math.max(...rows.map((row) => row[column + 1]!.length)),
  );
  const numberWidth = Math.max(1, String(index.rows.length).length);
  for (const row of rows)
    console.log(
      row
        .map((cell, column) =>
          cell.padEnd(column === 0 ? numberWidth : widths[column - 1]!),
        )
        .join("  ")
        .trimEnd(),
    );
}

const list = Command.make(
  "list-recordings",
  {
    ...shared,
    json: Flag.Boolean("json").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Print the dataset index as JSON instead of a table.",
      ),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      const config = yield* attempt(() => configuration(input));
      console.error("Starting the bundled WASM analysis tools…");
      yield* runRuntime(
        { command: "list", file: resolve(input.file), configuration: config },
        (message) => {
          if (message.type === "log") console.error(message.text);
          if (message.type === "index") {
            if (input.json) console.log(JSON.stringify(message.index, null, 2));
            else printIndex(message.index);
          }
        },
      ).pipe(Effect.mapError(userError));
    }),
).pipe(
  Command.withDescription(
    "List MATLAB trials or CWA recordings/days. No participant metadata is required.",
  ),
);

const positiveHeight = (name: string) =>
  Flag.Finite(name).pipe(
    Flag.filter(
      (value) => value > 0,
      () => "Height must be a positive finite number in metres.",
    ),
    Flag.withDescription("Height in metres."),
    Flag.optional,
  );

const run = Command.make(
  "run-pipeline",
  {
    ...shared,
    metadata: Flag.File("metadata", { mustExist: true }).pipe(Flag.optional),
    participantHeight: positiveHeight("participant-height"),
    sensorHeight: positiveHeight("sensor-height"),
    cohort: Flag.Literals("cohort", ["HA", "COPD", "CHF", "PD", "MS", "PFF"]),
    setting: Flag.Literals("setting", ["laboratory", "free-living"]).pipe(
      Flag.withDefault("laboratory"),
    ),
    preset: Flag.Literals("preset", ["auto", "healthy", "impaired"]).pipe(
      Flag.withDefault("auto"),
    ),
    recordings: Flag.Int("recording").pipe(
      Flag.filter(
        (value) => value > 0,
        () => "Recording numbers start at 1.",
      ),
      Flag.withDescription(
        "Row number from list-recordings; repeat to select multiple. Omit to run all rows.",
      ),
      Flag.atLeast(0),
    ),
    output: Flag.Directory("output", { mustExist: false }),
  },
  (input) =>
    Effect.gen(function* () {
      const config = yield* attempt(() => {
        const config = configuration(input);
        const metadata = Option.getOrUndefined(input.metadata);
        config.participantHeightM = Option.getOrUndefined(
          input.participantHeight,
        );
        config.sensorHeightM = Option.getOrUndefined(input.sensorHeight);
        config.cohort = input.cohort;
        config.measurementCondition =
          input.setting === "free-living" ? "free_living" : "laboratory";
        if (config.format === "cwa" && metadata)
          throw new Error("--metadata applies only to MATLAB recordings.");
        if (
          !metadata &&
          (config.participantHeightM === undefined ||
            config.sensorHeightM === undefined)
        ) {
          throw new Error(
            "Provide both --participant-height and --sensor-height, or a MATLAB --metadata file.",
          );
        }
        if (
          config.participantHeightM !== undefined &&
          config.sensorHeightM !== undefined &&
          config.sensorHeightM > config.participantHeightM
        ) {
          throw new Error("Sensor height must not exceed participant height.");
        }
        return config;
      });
      const output = resolve(input.output);
      // An exclusive directory prevents mixing new results with a previous run.
      yield* attempt(() => {
        mkdirSync(dirname(output), { recursive: true });
        mkdirSync(output, { recursive: false });
      });
      let index: DatasetIndex;
      let environment: RuntimeEnvironment;
      const outcomes: {
        recording: number;
        status: string;
        result?: string;
        summary?: unknown;
        message?: string;
      }[] = [];
      const summary = () =>
        writeFileSync(
          join(output, "summary.json"),
          JSON.stringify(
            {
              input: resolve(input.file),
              metadata: Option.map(input.metadata, resolve).pipe(
                Option.getOrUndefined,
              ),
              configuration: config,
              preset: input.preset,
              selectedRecordings: input.recordings.length
                ? [...new Set(input.recordings)].sort((a, b) => a - b)
                : index.rows.map((_, number) => number + 1),
              environment,
              recordings: outcomes,
            },
            null,
            2,
          ) + "\n",
        );
      const receive = (message: RuntimeMessage) => {
        if (message.type === "log") console.error(message.text);
        if (message.type === "index") {
          index = message.index;
          environment = message.environment;
          summary();
        }
        if (message.type !== "event") return;
        const event: ProcessEvent = message.event;
        const number =
          index.rows.findIndex((row) => row.id === event.rowId) + 1;
        console.error(
          `Recording ${number}: ${event.status}${event.message ? ` — ${event.message}` : ""}`,
        );
        if (event.status === "running") return;
        if (event.status === "complete") {
          const result = event.result!;
          const directory = `${number}-${filenamePart(index.rows[number - 1]!.label)}`;
          mkdirSync(join(output, directory));
          for (const [name, table] of Object.entries(result.tables))
            writeFileSync(
              join(output, directory, `${result.preset}-${name}.csv`),
              tableCsv(table),
            );
          writeFileSync(
            join(output, directory, "result.json"),
            JSON.stringify(result, null, 2) + "\n",
          );
          outcomes.push({
            recording: number,
            status: "complete",
            result: `${directory}/result.json`,
            summary: result.summary,
          });
        } else
          outcomes.push({
            recording: number,
            status: "error",
            message: event.message,
          });
        summary();
      };
      console.error("Starting the bundled WASM analysis tools…");
      yield* runRuntime(
        {
          command: "run",
          file: resolve(input.file),
          metadata: Option.map(input.metadata, resolve).pipe(
            Option.getOrUndefined,
          ),
          configuration: config,
          preset: input.preset,
          recordings: input.recordings,
        },
        receive,
      ).pipe(Effect.mapError(userError));
      console.log(`Results written to ${output}`);
      if (outcomes.some((row) => row.status === "error"))
        yield* Effect.fail(
          userError(
            "Some recordings failed. Completed results have been saved.",
          ),
        );
    }),
).pipe(
  Command.withDescription(
    "Run the full mobgap pipeline and export every result table as CSV.",
  ),
);

const command = Command.make(
  "mobgap",
  {
    licenses: Flag.Boolean("licenses").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Print bundled executable dependency notices."),
    ),
  },
  (input) =>
    Effect.gen(function* () {
      if (input.licenses)
        yield* attempt(() =>
          console.log(
            readFileSync(join(runtimeRoot, "THIRD_PARTY_NOTICES.txt"), "utf8"),
          ),
        );
    }),
).pipe(Command.withSubcommands([list, run]));
BunRuntime.runMain(
  Command.run(command, { version }).pipe(Effect.provide(BunServices.layer)),
);
