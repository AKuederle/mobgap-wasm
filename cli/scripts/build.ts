import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { RuntimeEnvironment } from "../src/protocol";

const root = resolve(import.meta.dir, "../..");
const cli = join(root, "cli");
if (Bun.version !== "1.4.2")
  throw new Error("Build with Bun 1.4.2 to pin the executable runtime.");
const assets = join(cli, "build/runtime");
const source = join(root, "public/runtime");
const kernelSource = join(source, "xeus/mobgap-browser");
const lockedPackages = JSON.parse(
  readFileSync(join(root, "runtime/packages.lock.json"), "utf8"),
).packages as RuntimeEnvironment["packages"];
const packages = lockedPackages.map(({ name, version, build }) => ({
  name,
  version,
  build,
}));
const metadata = JSON.parse(
  readFileSync(join(kernelSource, "empack_env_meta.json"), "utf8"),
);
const packageIds = (items: RuntimeEnvironment["packages"]) =>
  items
    .map((pkg) => `${pkg.name}=${pkg.version}=${pkg.build}`)
    .sort()
    .join("\n");
if (packageIds(metadata.packages) !== packageIds(packages))
  throw new Error(
    "Runtime packages differ from runtime/packages.lock.json. Run npm run runtime:prepare.",
  );
rmSync(assets, { recursive: true, force: true });
mkdirSync(assets, { recursive: true });
cpSync(kernelSource, assets, { recursive: true });
cpSync(join(source, "bootstrap.zip"), join(assets, "bootstrap.zip"));
cpSync(join(root, "runtime/workerfs/workerfs.js"), join(assets, "workerfs.js"));
cpSync(join(source, "licenses"), join(assets, "licenses"), { recursive: true });
cpSync(join(root, "LICENSE"), join(assets, "LICENSE"));
cpSync(join(root, "NOTICE"), join(assets, "NOTICE"));
// Include the complete notices of production dependencies, including transitive ones.
const visited = new Set<string>();
const notices = [
  readFileSync(join(root, "LICENSE"), "utf8"),
  readFileSync(join(root, "NOTICE"), "utf8"),
  readFileSync(join(cli, "licenses/Bun-1.4.2-LICENSE.md"), "utf8"),
];
function collectNotices(name: string) {
  if (visited.has(name)) return;
  visited.add(name);
  const directory = join(cli, "node_modules", name);
  const pkg = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
  const files = readdirSync(directory)
    .filter((file) => /^(license|licence|notice|copying)([.-]|$)/i.test(file))
    .sort();
  if (!files.length) throw new Error(`Dependency notice missing for ${name}.`);
  notices.push(
    `${name}@${pkg.version}\n\n${files.map((file) => readFileSync(join(directory, file), "utf8")).join("\n")}`,
  );
  for (const dependency of Object.keys(pkg.dependencies ?? {}).sort())
    collectNotices(dependency);
}
const cliPackage = JSON.parse(readFileSync(join(cli, "package.json"), "utf8"));
for (const name of Object.keys(cliPackage.dependencies).sort())
  collectNotices(name);
const noticeText = notices.join("\n\n" + "=".repeat(80) + "\n\n") + "\n";
writeFileSync(join(assets, "THIRD_PARTY_NOTICES.txt"), noticeText);
const digest = createHash("sha256");
function hashFiles(path: string, prefix = "") {
  for (const entry of readdirSync(path, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const name = prefix + entry.name;
    if (entry.isDirectory()) hashFiles(join(path, entry.name), name + "/");
    else
      digest.update(name + "\0").update(readFileSync(join(path, entry.name)));
  }
}
hashFiles(assets);
const git = Bun.spawnSync([
  "git",
  "-C",
  join(root, "mobgap"),
  "rev-parse",
  "HEAD",
]);
if (git.exitCode !== 0)
  throw new Error(
    "Could not identify the mobgap source revision. Initialize the submodule.",
  );
const environment: RuntimeEnvironment = {
  id: digest.digest("hex"),
  bun: Bun.version,
  mobgapRevision: git.stdout.toString().trim(),
  packages,
};
writeFileSync(
  join(assets, "environment.json"),
  JSON.stringify(environment, null, 2) + "\n",
);
mkdirSync(join(cli, "dist"), { recursive: true });
writeFileSync(join(cli, "dist/THIRD_PARTY_NOTICES.txt"), noticeText);
const result = await Bun.build({
  entrypoints: [join(cli, "src/main.ts"), join(cli, "src/worker.ts")],
  compile: {
    outfile: join(
      cli,
      `dist/mobgap${process.platform === "win32" ? ".exe" : ""}`,
    ),
    assets: [assets],
    autoloadDotenv: false,
    autoloadBunfig: false,
    autoloadPackageJson: false,
    autoloadTsconfig: false,
  },
});
if (!result.success)
  throw new AggregateError(result.logs, "CLI compilation failed.");
console.log(
  `Built the self-contained mobgap CLI with runtime ${environment.id}.`,
);
