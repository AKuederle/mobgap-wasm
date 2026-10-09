import type {
  DatasetConfiguration,
  DatasetIndex,
  ProcessEvent,
  PipelinePreset,
} from "../../src/lib/contracts";

export interface RuntimeEnvironment {
  id: string;
  bun: string;
  mobgapRevision: string;
  packages: { name: string; version: string; build: string }[];
}

export interface RuntimeRequest {
  command: "list" | "run";
  file: string;
  metadata?: string;
  configuration: DatasetConfiguration;
  preset?: PipelinePreset;
  recordings?: readonly number[];
}

export type RuntimeMessage =
  | { type: "log"; text: string }
  | { type: "index"; index: DatasetIndex; environment: RuntimeEnvironment }
  | { type: "event"; event: ProcessEvent }
  | { type: "done" }
  | { type: "error"; message: string };
