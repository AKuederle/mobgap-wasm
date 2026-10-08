import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field, FieldLabel } from "@/components/ui/field";
import type { AnalysisResult } from "@/lib/contracts";

import { downloadBlob, tableCsv } from "@/lib/result-download";
const PAGE_SIZE = 25;
const labels: Record<string, string> = {
  walking_bouts: "Walking bouts",
  gait_sequences: "Gait sequences",
  initial_contacts: "Initial contacts",
  turns: "Turns",
  per_second_parameters: "Parameters per second",
  raw_per_stride_parameters: "Raw stride parameters",
  aggregated_parameters: "Aggregated parameters",
  per_stride_parameters: "Strides",
};
const tableLabel = (name: string) => labels[name];

const numericFormat = new Intl.NumberFormat("en", { maximumFractionDigits: 4 });
const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return numericFormat.format(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
export function ResultsPanel({
  result,
  downloadPrefix = "mobgap",
  selectedTable: requestedTable,
  onTableChange,
  page: requestedPage = 0,
  onPageChange,
}: {
  result: AnalysisResult;
  downloadPrefix?: string;
  selectedTable?: string;
  onTableChange: (table: string) => void;
  page?: number;
  onPageChange: (page: number) => void;
}) {
  const tableNames = Object.keys(result.tables);
  const defaultTable =
    tableNames.find((name) => name === "walking_bouts") ?? tableNames[0] ?? "";
  const selectedTable =
    requestedTable && tableNames.includes(requestedTable)
      ? requestedTable
      : defaultTable;
  const table = result.tables[selectedTable];
  const totalPages = table
    ? Math.max(1, Math.ceil(table.rows.length / PAGE_SIZE))
    : 1;
  const page = Math.min(requestedPage, totalPages - 1);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="results-table-section">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <Field className="w-full max-w-xs">
            <FieldLabel htmlFor="result-table">Result table</FieldLabel>
            <Select value={selectedTable} onValueChange={onTableChange}>
              <SelectTrigger id="result-table" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {tableNames.map((name) => (
                    <SelectItem key={name} value={name}>
                      {tableLabel(name)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button
            variant="outline"
            disabled={!table}
            onClick={() =>
              table &&
              downloadBlob(
                new Blob([tableCsv(table)], { type: "text/csv;charset=utf-8" }),
                `${downloadPrefix}-${result.preset}-${selectedTable}.csv`,
              )
            }
          >
            Download CSV
          </Button>
        </div>
        {table ? (
          <>
            <div className="mt-4 rounded-lg border">
              <Table aria-label={tableLabel(selectedTable)}>
                <TableHeader>
                  <TableRow>
                    {table.columns.map((column) => (
                      <TableHead key={column} title={column}>
                        {column.replace(/_+/g, " ")}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {table.rows
                    .slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
                    .map((row, i) => (
                      <TableRow key={page * PAGE_SIZE + i}>
                        {row.map((value, column) => (
                          <TableCell
                            className="max-w-72 tabular-nums"
                            key={column}
                          >
                            {cellText(value)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
              {table.rows.length === 0 ? (
                <p className="p-8 text-center text-sm text-muted-foreground">
                  No entries.
                </p>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
              <p>
                {table.rows.length.toLocaleString()}{" "}
                {table.rows.length === 1 ? "entry" : "entries"}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Previous page"
                  disabled={page === 0}
                  onClick={() => onPageChange(page - 1)}
                >
                  <ChevronLeft />
                </Button>
                <span className="tabular-nums">
                  {page + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Next page"
                  disabled={page + 1 >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This run did not return result tables.
          </p>
        )}
      </div>
    </div>
  );
}
