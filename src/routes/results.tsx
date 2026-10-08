import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useSession } from "@/lib/session";
import { ErrorMessage } from "@/components/page";
import { ResultsPanel } from "@/components/results-panel";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { downloadResultsZip, filenamePart } from "@/lib/result-download";

export const Route = createFileRoute("/results")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { result?: string; table?: string; page?: number } => ({
    result: typeof search.result === "string" ? search.result : undefined,
    table: typeof search.table === "string" ? search.table : undefined,
    page:
      typeof search.page === "number" &&
      Number.isSafeInteger(search.page) &&
      search.page >= 0
        ? search.page
        : 0,
  }),
  component: ResultsPage,
});
function ResultsPage() {
  const { session } = Route.useRouteContext();
  const state = useSession(session);
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const filePrefix = filenamePart(
    state.files?.recording.name.replace(/\.[^.]+$/, "").slice(0, 64) ?? "mobgap",
  );
  const completed = state.jobRows.filter(
    (row) => state.outcomes[row.id]?.result,
  );
  const row = completed.find((row) => row.id === search.result) ?? completed[0];
  const result = row && state.outcomes[row.id]?.result;
  async function downloadAll() {
    setDownloading(true);
    setDownloadError("");
    try {
      await downloadResultsZip(
        completed.map((recording) => ({
          label: recording.label,
          result: state.outcomes[recording.id].result!,
        })),
        `${filePrefix}-results.zip`,
      );
    } catch (error) {
      console.error(error);
      setDownloadError("Could not download results. Please try again.");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <section aria-label="Results" className="flex min-w-0 flex-col gap-6">
      <ErrorMessage>{state.error || downloadError}</ErrorMessage>
      {state.jobRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <Table aria-label="Recording summary">
            <TableHeader>
              <TableRow>
                <TableHead>Recording</TableHead>
                <TableHead className="text-right">WBs</TableHead>
                <TableHead className="text-right">Strides</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.jobRows.map((recording) => {
                const outcome = state.outcomes[recording.id];
                return (
                  <TableRow
                    key={recording.id}
                    data-state={
                      recording.id === row?.id ? "selected" : undefined
                    }
                  >
                    <TableCell className="whitespace-normal">
                      {recording.label}
                      {!outcome?.result && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {outcome?.message || "Not completed"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {outcome?.result?.summary.walkingBouts ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {outcome?.result?.summary.strides ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <Button
            className="self-end"
            variant="outline"
            disabled={!completed.length || downloading}
            onClick={() => void downloadAll()}
          >
            {downloading ? "Preparing ZIP…" : "Download all"}
          </Button>
        </div>
      )}
      {result && row ? (
        <>
          <Field className="max-w-lg">
            <FieldLabel htmlFor="completed-recording">Recording</FieldLabel>
            <Select
              value={row.id}
              onValueChange={(result) =>
                void navigate({
                  search: (previous) => ({ ...previous, result, page: 0 }),
                })
              }
            >
              <SelectTrigger id="completed-recording">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {completed.map((row) => (
                    <SelectItem key={row.id} value={row.id}>
                      {row.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <ResultsPanel
            result={result}
            downloadPrefix={`${filePrefix}-${filenamePart(row.label)}`}
            selectedTable={search.table}
            page={search.page}
            onTableChange={(table) =>
              void navigate({
                search: (previous) => ({ ...previous, table, page: 0 }),
              })
            }
            onPageChange={(page) =>
              void navigate({ search: (previous) => ({ ...previous, page }) })
            }
          />
        </>
      ) : (
        <p>No results are available yet.</p>
      )}
    </section>
  );
}
