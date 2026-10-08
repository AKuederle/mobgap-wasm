import type { AnalysisResult, DataTable } from "./contracts";

function csvCell(value: unknown): string {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function tableCsv(table: DataTable): string {
  return (
    "\ufeff" +
    [table.columns, ...table.rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const filenamePart = (value: string) =>
  value.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 128) || "recording";

export async function downloadResultsZip(
  recordings: { label: string; result: AnalysisResult }[],
  filename: string,
) {
  const { zip, strToU8 } = await import("fflate");
  const files: Record<string, Uint8Array> = {};
  recordings.forEach(({ label, result }, index) => {
    const directory = `${index + 1}-${filenamePart(label)}`;
    for (const [name, table] of Object.entries(result.tables)) {
      files[`${directory}/${result.preset}-${name}.csv`] = strToU8(
        tableCsv(table),
      );
    }
  });
  const archive = await new Promise<Uint8Array<ArrayBuffer>>(
    (resolve, reject) => {
      zip(files, { level: 6 }, (error, data) =>
        error ? reject(error) : resolve(data),
      );
    },
  );
  downloadBlob(new Blob([archive], { type: "application/zip" }), filename);
}
