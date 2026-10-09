import {
  closeSync,
  fstatSync,
  openSync,
  readFileSync,
  readSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { gunzipSync } from "node:zlib";
import { extract } from "tar-stream";
import type { RuntimeEnvironment } from "./protocol";
import { runtimeRoot } from "./assets";

interface KernelFS {
  mkdirTree(path: string): void;
  writeFile(path: string, bytes: Uint8Array): void;
  readFile(path: string): Uint8Array;
  symlink(target: string, path: string): void;
  mount(backend: unknown, options: unknown, path: string): void;
  unmount(path: string): void;
  filesystems: Record<string, unknown>;
}
export interface Kernel {
  FS: KernelFS;
  init_phase_1(
    prefix: string,
    version: number[],
    verbose: boolean,
  ): Promise<void>;
  init_phase_2(prefix: string, version: number[], verbose: boolean): void;
  exec(code: string): void;
}
type KernelFactory = (options: Record<string, unknown>) => Promise<Kernel>;

async function unpack(kernel: Kernel, path: string) {
  const archive = extract();
  const complete = new Promise<void>((resolve, reject) => {
    archive.on("error", reject);
    archive.on("finish", resolve);
    archive.on("entry", (header, stream, next) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const path = "/" + header.name.replace(/^\.\//, "");
        kernel.FS.mkdirTree(dirname(path));
        if (header.type === "directory") kernel.FS.mkdirTree(path);
        else if (header.type === "symlink")
          kernel.FS.symlink(header.linkname!, path);
        else if (header.type === "link")
          kernel.FS.writeFile(path, kernel.FS.readFile("/" + header.linkname!));
        else if (header.type === "file")
          kernel.FS.writeFile(path, Buffer.concat(chunks));
        else
          throw new Error(`Unsupported package archive entry: ${header.type}`);
        next();
      })().catch(reject);
    });
  });
  archive.end(gunzipSync(readFileSync(path)));
  await complete;
}

/** The browser-built loader uses fetch for assets; supply reads of embedded files. */
export async function initialize(
  output: (text: string) => void,
  warning: (text: string) => void,
): Promise<{ kernel: Kernel; environment: RuntimeEnvironment }> {
  const commonjs: { exports: unknown } = { exports: {} };
  const logger = {
    ...console,
    log: () => {},
    error: (...args: unknown[]) => warning(args.join(" ")),
  };
  new Function(
    "window",
    "fetch",
    "module",
    "exports",
    "console",
    readFileSync(join(runtimeRoot, "bin/xpython.js"), "utf8"),
  )(
    {},
    async (path: string) => new Response(readFileSync(path)),
    commonjs,
    commonjs.exports,
    logger,
  );
  const kernel = await (commonjs.exports as KernelFactory)({
    noInitialRun: true,
    wasmBinary: readFileSync(join(runtimeRoot, "bin/xpython.wasm")),
    locateFile: (name: string) =>
      join(runtimeRoot, name === "libxeus.so" ? name : `bin/${name}`),
    print: output,
    printErr: warning,
  });
  const metadata = JSON.parse(
    readFileSync(join(runtimeRoot, "empack_env_meta.json"), "utf8"),
  ) as {
    packages: { name: string; filename: string; version: string }[];
  };
  for (const pkg of metadata.packages)
    await unpack(kernel, join(runtimeRoot, "kernel_packages", pkg.filename));
  const pythonVersion = metadata.packages
    .find((pkg) => pkg.name === "python")!
    .version.split(".")
    .map(Number);
  await kernel.init_phase_1("/", pythonVersion, false);
  kernel.init_phase_2("/", pythonVersion, false);
  kernel.FS.writeFile(
    "/mobgap-app.zip",
    readFileSync(join(runtimeRoot, "bootstrap.zip")),
  );
  kernel.exec(
    "import sys, zipfile, json\nzipfile.ZipFile('/mobgap-app.zip').extractall('/mobgap-app')\nsys.path.insert(0, '/mobgap-app')\nimport mobgap_demo_api as api",
  );
  const environment = JSON.parse(
    readFileSync(join(runtimeRoot, "environment.json"), "utf8"),
  ) as RuntimeEnvironment;
  return { kernel, environment };
}

/** Blob-style ranges let the existing read-only WORKERFS backend read local FDs. */
class HostFile {
  readonly size: number;
  readonly lastModifiedDate: Date;
  constructor(readonly fd: number) {
    const stat = fstatSync(fd);
    if (!stat.isFile()) throw new Error("Input must be a regular file.");
    this.size = stat.size;
    this.lastModifiedDate = stat.mtime;
  }
  slice(start: number, end: number) {
    return {
      fd: this.fd,
      start,
      size: Math.max(0, Math.min(end, this.size) - start),
    };
  }
}
class HostReader {
  readAsArrayBuffer(range: ReturnType<HostFile["slice"]>) {
    const data = new Uint8Array(range.size);
    let offset = 0;
    while (offset < data.length) {
      const count = readSync(
        range.fd,
        data,
        offset,
        data.length - offset,
        range.start + offset,
      );
      if (!count)
        throw new Error("The input file changed while it was being read.");
      offset += count;
    }
    return data.buffer;
  }
}

export function mountInputs(kernel: Kernel, file: string, metadata?: string) {
  const descriptors: number[] = [];
  let mounted = false;
  const close = () => {
    if (mounted) kernel.FS.unmount("/mobgap-input");
    for (const fd of descriptors) closeSync(fd);
  };
  try {
    new Function(
      "globalThis",
      "FileReaderSync",
      readFileSync(join(runtimeRoot, "workerfs.js"), "utf8"),
    )({ Module: kernel }, HostReader);
    const blobs = [file, ...(metadata ? [metadata] : [])].map((path, index) => {
      const fd = openSync(path, "r");
      descriptors.push(fd);
      return {
        name: index === 0 ? "recording" : "metadata",
        data: new HostFile(fd),
      };
    });
    kernel.FS.mkdirTree("/mobgap-input");
    kernel.FS.mount(kernel.FS.filesystems.WORKERFS, { blobs }, "/mobgap-input");
    mounted = true;
    return {
      file: "/mobgap-input/recording",
      metadata: metadata ? "/mobgap-input/metadata" : undefined,
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}
