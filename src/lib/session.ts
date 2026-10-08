import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type {
  AnalysisResult,
  DatasetConfiguration,
  DatasetIndex,
  DatasetRow,
  InputFiles,
  PipelinePreset,
  ProcessEvent,
} from "./contracts";

export interface MetadataDraft {
  mode: "file" | "manual";
  cohort: string;
  participantHeight: string;
  sensorHeight: string;
  condition: "laboratory" | "free_living";
  timezone: string;
}
export interface Outcome {
  status: "queued" | "running" | "complete" | "error" | "cancelled";
  result?: AnalysisResult;
  message?: string;
}
export interface SessionState {
  files?: InputFiles;
  split: DatasetConfiguration["split"];
  draft: MetadataDraft;
  configuration?: DatasetConfiguration;
  index?: DatasetIndex;
  datasetId: string;
  preset: PipelinePreset;
  jobId: string;
  running: boolean;
  jobRows: DatasetRow[];
  outcomes: Record<string, Outcome>;
  error: string;
}
const initialDraft: MetadataDraft = {
  mode: "file",
  cohort: "",
  participantHeight: "",
  sensorHeight: "",
  condition: "laboratory",
  timezone: "",
};
export function createSession() {
  let state: SessionState = {
    split: "auto",
    draft: initialDraft,
    datasetId: "",
    preset: "auto",
    jobId: "",
    running: false,
    jobRows: [],
    outcomes: {},
    error: "",
  };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<SessionState>) => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    stage(
      files: InputFiles,
      split: SessionState["split"],
      preset: PipelinePreset = "auto",
      cohort = "",
    ) {
      const cwa = files.recording.name.toLowerCase().endsWith(".cwa");
      update({
        files,
        split,
        configuration: undefined,
        index: undefined,
        datasetId: crypto.randomUUID(),
        jobRows: [],
        outcomes: {},
        error: "",
        preset,
        draft: {
          ...initialDraft,
          cohort,
          mode: cwa ? "manual" : "file",
          condition: cwa ? "free_living" : "laboratory",
        },
      });
    },
    setSplit(split: SessionState["split"]) {
      update({
        split,
        configuration: state.configuration
          ? { ...state.configuration, split }
          : undefined,
        index: undefined,
        datasetId: crypto.randomUUID(),
        jobRows: [],
        outcomes: {},
        error: "",
      });
    },
    draft(value: MetadataDraft) {
      update({ draft: value, configuration: undefined, index: undefined });
    },
    metadata(metadata?: File) {
      update({
        files: { recording: state.files!.recording, metadata },
        configuration: undefined,
        index: undefined,
      });
    },
    configure(configuration: DatasetConfiguration, metadata?: File) {
      update({
        configuration,
        files: { recording: state.files!.recording, metadata },
        index: undefined,
        datasetId: crypto.randomUUID(),
        jobRows: [],
        outcomes: {},
        error: "",
      });
    },
    setIndex(index: DatasetIndex) {
      update({ index });
    },
    start(rows: DatasetRow[], preset: PipelinePreset) {
      const jobId = crypto.randomUUID();
      update({
        jobId,
        running: true,
        preset,
        jobRows: rows,
        outcomes: Object.fromEntries(
          rows.map((row) => [row.id, { status: "queued" }]),
        ),
        error: "",
      });
      return jobId;
    },
    event(event: ProcessEvent, jobId: string) {
      if (state.running && state.jobId === jobId)
        update({
          outcomes: {
            ...state.outcomes,
            [event.rowId]: {
              status: event.status,
              result: event.result,
              message: event.message,
            },
          },
        });
    },
    finish(error = "") {
      update({
        running: false,
        error,
        outcomes: Object.fromEntries(
          Object.entries(state.outcomes).map(([id, outcome]) => [
            id,
            outcome.status === "running" || outcome.status === "queued"
              ? { status: "cancelled", message: error || "Not completed" }
              : outcome,
          ]),
        ),
      });
    },
  };
}
export type Session = ReturnType<typeof createSession>;
export interface AppContext {
  session: Session;
  queryClient: QueryClient;
}
export function useSession(session: Session) {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
