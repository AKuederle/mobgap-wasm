import { Effect } from "effect";
import type { RuntimeMessage, RuntimeRequest } from "./protocol";

/** Keep synchronous Python work off the CLI thread so Ctrl+C can terminate it. */
export function runRuntime(
  request: RuntimeRequest,
  receive: (message: RuntimeMessage) => void,
) {
  return Effect.scoped(
    Effect.gen(function* () {
      const worker = yield* Effect.acquireRelease(
        Effect.sync(() => new Worker(new URL("./worker.ts", import.meta.url))),
        (worker) => Effect.sync(() => worker.terminate()),
      );
      yield* Effect.callback<void, Error>((resume) => {
        worker.onmessage = (message: MessageEvent<RuntimeMessage>) => {
          try {
            if (message.data.type === "error")
              resume(Effect.fail(new Error(message.data.message)));
            else if (message.data.type === "done") resume(Effect.void);
            else receive(message.data);
          } catch (error) {
            resume(
              Effect.fail(
                error instanceof Error ? error : new Error(String(error)),
              ),
            );
          }
        };
        worker.onerror = (error) =>
          resume(Effect.fail(new Error(error.message)));
        worker.postMessage(request);
      });
    }),
  );
}
