import { readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const directory = process.argv[2];
const tag = process.env.CLI_TAG;
const repository = process.env.GH_REPO;
if (!directory || !tag || !repository)
  throw new Error("Provide the archive directory, CLI_TAG and GH_REPO.");
const release = JSON.parse(
  execFileSync(
    "gh",
    ["api", `repos/${repository}/releases/tags/${encodeURIComponent(tag)}`],
    {
      encoding: "utf8",
    },
  ),
);
const existing = new Map(release.assets.map((asset) => [asset.name, asset]));
for (const name of readdirSync(directory)
  .filter((name) => name.endsWith(".tar.gz"))
  .sort()) {
  const asset = existing.get(name);
  if (asset?.state === "uploaded")
    console.log(`Keeping already uploaded ${name}.`);
  else {
    if (asset)
      execFileSync(
        "gh",
        [
          "api",
          `repos/${repository}/releases/assets/${asset.id}`,
          "--method",
          "DELETE",
        ],
        { stdio: "inherit" },
      );
    execFileSync("gh", ["release", "upload", tag, join(directory, name)], {
      stdio: "inherit",
    });
  }
}
