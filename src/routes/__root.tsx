import {
  createRootRouteWithContext,
  Outlet,
  redirect,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import type { AppContext } from "@/lib/session";
import { useSession } from "@/lib/session";
import Stepper from "@/components/shadcn-space/stepper/stepper-01";
import { Page, ErrorMessage } from "@/components/page";

export const Route = createRootRouteWithContext<AppContext>()({
  beforeLoad: ({ context, location }) => {
    if (
      context.session.getSnapshot().running &&
      location.pathname !== "/running"
    ) {
      throw redirect({
        to: "/running",
        search: { blocked: true },
        replace: true,
      });
    }
  },
  component: AppShell,
  notFoundComponent: () => (
    <Page title="Page not found">
      <a href={import.meta.env.BASE_URL}>Start again</a>
    </Page>
  ),
  errorComponent: ({ reset }) => (
    <Page title="Unable to open this page">
      <ErrorMessage>Please try again.</ErrorMessage>
      <button onClick={reset}>Retry</button>
    </Page>
  ),
});
function AppShell() {
  const { session } = Route.useRouteContext();
  const state = useSession(session);
  const router = useRouter();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  useEffect(() => {
    if (!state.running) return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [state.running]);
  if (pathname === "/runtime")
    return (
      <main className="flex min-h-svh items-center justify-center bg-background px-6 py-12">
        <div className="w-full max-w-lg">
          <Outlet />
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="app-header">
        <span className="brand">mobgap WASM</span>
        <span className="text-sm text-muted-foreground">
          Your files stay on this device
        </span>
      </header>
      <Stepper
        pathname={pathname}
        state={state}
        onNavigate={(to) => void router.navigate({ to })}
      />
      <main id="main" className="py-8" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="app-footer">
        <span>Mobilise-D gait analysis</span>
        <span>Research use</span>
      </footer>
    </div>
  );
}
