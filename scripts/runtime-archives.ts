import { createReadStream, statSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Connect, Plugin } from "vite";

// Vite treats .gz assets as HTTP-encoded content. These files are archives:
// preserve their original bytes for integrity checks and the runtime unpacker.
export function runtimeArchives(): Plugin {
  const serve =
    (directory: string, base: string): Connect.NextHandleFunction =>
    (request, response, next) => {
      const path = new URL(request.url ?? "/", "http://localhost").pathname;
      const prefix = `${base.replace(/\/$/, "")}/runtime/`;
      if (!path.startsWith(prefix) || !path.endsWith(".tar.gz")) return next();
      const root = resolve(directory, "runtime");
      const file = resolve(root, decodeURIComponent(path.slice(prefix.length)));
      if (!file.startsWith(root + sep)) {
        response.statusCode = 404;
        response.end();
        return;
      }
      try {
        const stat = statSync(file);
        response.setHeader("Content-Type", "application/gzip");
        response.setHeader("Content-Length", stat.size);
        if (request.method === "HEAD") response.end();
        else createReadStream(file).pipe(response);
      } catch {
        response.statusCode = 404;
        response.end();
      }
    };
  return {
    name: "runtime-archive-bytes",
    configureServer(server) {
      server.middlewares.use(
        serve(server.config.publicDir, server.config.base),
      );
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        serve(
          resolve(server.config.root, server.config.build.outDir),
          server.config.base,
        ),
      );
    },
  };
}
