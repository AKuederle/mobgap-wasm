import { createFileRoute, Link } from "@tanstack/react-router";
import { useSession } from "@/lib/session";
import { cancelRuntime } from "@/lib/runtime-resource";
import { Page, ErrorMessage } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/running")({
  validateSearch: (search: Record<string, unknown>): { blocked?: boolean } => ({
    blocked: search.blocked === true ? true : undefined,
  }),
  component: RunningPage,
});
function RunningPage() {
  const { session, queryClient } = Route.useRouteContext();
  const state = useSession(session);
  const { blocked } = Route.useSearch();
  const processed = Object.values(state.outcomes).filter(
    (value) => value.status === "complete" || value.status === "error",
  ).length;
  return (
    <Page title={state.running ? "Analyzing recording" : "Analysis finished"}>
      {state.running && blocked && (
        <Alert>
          <AlertTitle>Analysis is running</AlertTitle>
          <AlertDescription>
            Cancel the run before continuing to another step.
          </AlertDescription>
        </Alert>
      )}
      <ErrorMessage>{state.error}</ErrorMessage>
      {state.jobRows.length > 0 ? (
        <>
          <p role="status">
            {processed} of {state.jobRows.length} rows processed.
          </p>
          <Progress
            aria-label="Rows processed"
            value={(processed / state.jobRows.length) * 100}
          />
          <ul className="divide-y">
            {state.jobRows.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap justify-between gap-3 py-4"
              >
                <span>{row.label}</span>
                <span className="text-sm text-muted-foreground">
                  {state.outcomes[row.id]?.message ||
                    {
                      queued: "Waiting",
                      running: "Analyzing…",
                      complete: "Complete",
                      error: "Could not analyze",
                      cancelled: "Cancelled",
                    }[state.outcomes[row.id]?.status ?? "queued"]}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>No analysis is running. Select rows to begin.</p>
      )}
      <div className="flex flex-wrap gap-3">
        {state.running ? (
          <Button
            variant="outline"
            onClick={() => {
              session.finish("");
              cancelRuntime(queryClient);
            }}
          >
            Cancel analysis
          </Button>
        ) : (
          <>
            <Button asChild variant="outline">
              <Link to="/select">Select rows</Link>
            </Button>
            {state.jobRows.length > 0 && (
              <Button asChild>
                <Link to="/results">View results</Link>
              </Button>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
