import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Page, ErrorMessage, RetryButton } from "@/components/page";
import { useSession } from "@/lib/session";
import { getRuntime } from "@/lib/runtime-resource";
import type { PipelinePreset } from "@/lib/contracts";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const Route = createFileRoute("/select")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { dataset?: string; rows?: string[]; preset?: PipelinePreset } => ({
    dataset: typeof search.dataset === "string" ? search.dataset : undefined,
    rows:
      Array.isArray(search.rows) &&
      search.rows.every((row) => typeof row === "string")
        ? (search.rows as string[])
        : undefined,
    preset:
      search.preset === "healthy" ||
      search.preset === "impaired" ||
      search.preset === "auto"
        ? (search.preset as PipelinePreset)
        : undefined,
  }),
  beforeLoad: ({ context, location, search }) => {
    const state = context.session.getSnapshot();
    if (!state.files) throw redirect({ to: "/dataset" });
    if (!state.configuration) throw redirect({ to: "/metadata" });
    if (!getRuntime(context.queryClient))
      throw redirect({
        to: "/runtime",
        search: { returnTo: "/select" + location.searchStr },
        replace: true,
      });
    if (search.dataset !== state.datasetId)
      throw redirect({
        to: "/select",
        search: { dataset: state.datasetId },
        replace: true,
      });
  },
  loader: async ({ context }) => {
    const state = context.session.getSnapshot();
    if (!state.index) {
      const index = await getRuntime(context.queryClient)!.loadIndex(
        state.files!,
        state.configuration!,
      );
      if (context.session.getSnapshot().datasetId === state.datasetId)
        context.session.setIndex(index);
    }
  },
  pendingMs: 0,
  pendingComponent: () => (
    <Page title="Preparing recording">
      <p role="status">Reading the available trials or days…</p>
    </Page>
  ),
  errorComponent: ({ error, reset }) => {
    console.error(error);
    return (
      <Page title="Could not prepare recording">
        <ErrorMessage>
          Check your recording and participant metadata, then try again.
        </ErrorMessage>
        <RetryButton reset={reset} />
      </Page>
    );
  },
  component: SelectionPage,
});
function SelectionPage() {
  const { session, queryClient } = Route.useRouteContext();
  const state = useSession(session);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/select" });
  const rows = state.index?.rows ?? [];
  const selected = new Set(
    search.rows === undefined ? rows.map((row) => row.id) : search.rows,
  );
  const preset = search.preset ?? state.preset;
  const setSelection = (value: Set<string>) =>
    void navigate({
      search: (previous) => ({ ...previous, rows: [...value] }),
    });
  function run() {
    const runtime = getRuntime(queryClient);
    if (!runtime) {
      void navigate({ to: "/runtime", search: { returnTo: "/select" } });
      return;
    }
    const chosen = rows.filter((row) => selected.has(row.id));
    if (!chosen.length || state.running) return;
    const jobId = session.start(chosen, preset);
    void navigate({ to: "/running", search: {} });
    void runtime
      .process(state.files!, state.configuration!, chosen, preset, (event) =>
        session.event(event, jobId),
      )
      .then(
        () => {
          if (
            !session.getSnapshot().running ||
            session.getSnapshot().jobId !== jobId
          )
            return;
          session.finish();
          void navigate({ to: "/results", search: {} });
        },
        (reason) => {
          console.error(reason);
          if (
            session.getSnapshot().running &&
            session.getSnapshot().jobId === jobId
          )
            session.finish("Analysis stopped. Please try again.");
        },
      );
  }
  return (
    <Page
      title="Select recordings"
      description={`${state.files?.recording.name} · ${rows.length} ${state.index?.split === "days" ? (rows.length === 1 ? "day" : "days") : rows.length === 1 ? "recording" : "recordings"}`}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span id="preset-label" className="text-sm font-medium">
            Walking preset
          </span>
          <ToggleGroup
            type="single"
            variant="outline"
            aria-labelledby="preset-label"
            value={preset}
            onValueChange={(value) => {
              if (value)
                void navigate({
                  search: (previous) => ({
                    ...previous,
                    preset: value as PipelinePreset,
                  }),
                });
            }}
          >
            <ToggleGroupItem value="auto">Auto</ToggleGroupItem>
            <ToggleGroupItem value="healthy">Healthy</ToggleGroupItem>
            <ToggleGroupItem value="impaired">Impaired</ToggleGroupItem>
          </ToggleGroup>
          <p className="text-xs text-muted-foreground">
            Auto selects the preset for your cohort.
          </p>
        </div>
        <Button disabled={!selected.size || !rows.length} onClick={run}>
          Run selected ({rows.filter((row) => selected.has(row.id)).length})
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <input
                type="checkbox"
                aria-label="Select all recordings"
                checked={
                  rows.length > 0 && rows.every((row) => selected.has(row.id))
                }
                onChange={(event) =>
                  setSelection(
                    new Set(
                      event.target.checked ? rows.map((row) => row.id) : [],
                    ),
                  )
                }
              />
            </TableHead>
            <TableHead>Trial or day</TableHead>
            {Object.keys(rows[0]?.index ?? {})
              .filter((key) => key !== "file_path")
              .map((key) => (
                <TableHead key={key}>{key.replaceAll("_", " ")}</TableHead>
              ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <input
                  type="checkbox"
                  aria-label={`Select ${row.label}`}
                  checked={selected.has(row.id)}
                  onChange={(event) => {
                    const next = new Set(selected);
                    if (event.target.checked) next.add(row.id);
                    else next.delete(row.id);
                    setSelection(next);
                  }}
                />
              </TableCell>
              <TableCell>{row.label}</TableCell>
              {Object.entries(row.index)
                .filter(([key]) => key !== "file_path")
                .map(([key, value]) => (
                  <TableCell key={key}>{value}</TableCell>
                ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && <p>No recordings were found in this dataset.</p>}
    </Page>
  );
}
