import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/lib/session";
import { Page, ErrorMessage } from "@/components/page";
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
  const completed = state.jobRows.filter(
    (row) => state.outcomes[row.id]?.result,
  );
  const row =
    completed.find((row) => row.id === search.result) ?? completed.at(-1);
  const result = row && state.outcomes[row.id]?.result;
  return (
    <Page title="Results">
      <ErrorMessage>{state.error}</ErrorMessage>
      <p>
        {completed.length} of {state.jobRows.length} selected rows completed.
      </p>
      {state.jobRows
        .filter((row) => state.outcomes[row.id]?.status !== "complete")
        .map((row) => (
          <p className="text-sm text-muted-foreground" key={row.id}>
            {row.label}: {state.outcomes[row.id]?.message || "Not completed"}
          </p>
        ))}
      {result && row ? (
        <>
          <Field className="max-w-lg">
            <FieldLabel htmlFor="completed-row">Completed row</FieldLabel>
            <Select
              value={row.id}
              onValueChange={(result) =>
                void navigate({
                  search: (previous) => ({ ...previous, result, page: 0 }),
                })
              }
            >
              <SelectTrigger id="completed-row">
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
            recordingLabel={row.label}
            downloadPrefix={`${state.files?.recording.name.replace(/\.[^.]+$/, "").slice(0, 64)}-${row.label.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 128)}`}
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
      <Link to="/select" className="text-sm text-primary underline">
        Back to row selection
      </Link>
    </Page>
  );
}
