import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { createSession } from "./lib/session";
import { preloadCachedRuntime } from "./lib/runtime-resource";
import "./index.css";

const queryClient = new QueryClient();
const session = createSession();
const router = createRouter({
  basepath: import.meta.env.BASE_URL,
  routeTree,
  context: { queryClient, session },
  defaultPreload: false,
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
void preloadCachedRuntime(queryClient).catch(console.error);
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
