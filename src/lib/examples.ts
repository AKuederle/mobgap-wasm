import type { InputFiles, PipelinePreset } from "./contracts";

const repository = "https://raw.githubusercontent.com/mobilise-d/mobgap/main/";
export interface Example {
  path: string;
  label: string;
  metadataPath?: string;
  cohort: string;
  preset: PipelinePreset;
}
export async function listExamples(signal: AbortSignal): Promise<Example[]> {
  const response = await fetch(
    repository + "src/mobgap/data/_example_data_registry.txt",
    { signal },
  );
  if (!response.ok) throw new Error("Example list unavailable");
  const paths = new Set(
    (await response.text())
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0]),
  );
  return [...paths].flatMap((path) => {
    const matlab = /^data\/lab\/([^/]+)\/([^/]+)\/data\.mat$/.exec(path);
    if (matlab) {
      const [, cohort, participant] = matlab;
      const metadataPath = path.replace(/data\.mat$/, "infoForAlgo.mat");
      return [
        {
          path,
          label: `${cohort} · Participant ${participant}`,
          cohort,
          preset: "auto" as const,
          metadataPath: paths.has(metadataPath) ? metadataPath : undefined,
        },
      ];
    }
    if (/^data\/[^?#]+\.cwa$/i.test(path) && !path.includes(".."))
      return [
        {
          path,
          label: path.split("/").at(-1)!,
          cohort: "",
          preset: "auto" as const,
        },
      ];
    return [];
  });
}
export async function loadExample(
  example: Example,
  signal: AbortSignal,
): Promise<InputFiles> {
  const download = async (path: string) => {
    const response = await fetch(repository + "example_data/" + path, {
      signal,
    });
    if (!response.ok) throw new Error("Example download failed");
    return new File([await response.blob()], path.split("/").at(-1)!);
  };
  const [recording, metadata] = await Promise.all([
    download(example.path),
    example.metadataPath ? download(example.metadataPath) : undefined,
  ]);
  return { recording, metadata };
}
