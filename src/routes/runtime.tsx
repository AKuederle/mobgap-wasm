import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { prepareRuntime, runtimeStateKey } from "@/lib/runtime-resource";
import type { RuntimeState } from "@/lib/runtime-resource";
import { Page, ErrorMessage } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

function internalDestination(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\/(select|metadata|dataset|results)(\?|$)/.test(value)
  )
    return "/select";
  return value;
}
export const Route = createFileRoute("/runtime")({
  validateSearch: (search: Record<string, unknown>) => ({
    returnTo: internalDestination(search.returnTo),
  }),
  component: RuntimePage,
});
function RuntimePage() {
  const { queryClient } = Route.useRouteContext();
  const { returnTo } = Route.useSearch();
  const router = useRouter();
  const { data: state } = useQuery<RuntimeState>({
    queryKey: runtimeStateKey,
    queryFn: () => ({ status: "idle" }),
    initialData: { status: "idle" },
    enabled: false,
  });
  useEffect(() => {
    let active = true;
    void prepareRuntime(queryClient)
      .then(() => {
        if (active) void router.navigate({ href: returnTo, replace: true });
      })
      .catch(console.error);
    return () => {
      active = false;
    };
  }, [queryClient, returnTo, router]);
  return (
    <Page
      title={
        state.status === "preparing"
          ? "Downloading analysis tools"
          : "Starting analysis tools"
      }
      description="Preparing the tools to process your recording on this device. Your files stay on this device."
    >
      <p role="status">{state.progress?.message ?? "Getting ready…"}</p>
      {state.progress?.percent !== undefined && (
        <Progress
          value={state.progress.percent}
          aria-label="Preparation progress"
        />
      )}
      <ErrorMessage>{state.error}</ErrorMessage>
      {state.status === "error" && (
        <Button
          className="self-start"
          onClick={() =>
            void prepareRuntime(queryClient)
              .then(() => router.navigate({ href: returnTo, replace: true }))
              .catch(console.error)
          }
        >
          Retry
        </Button>
      )}
    </Page>
  );
}
