"use client";

import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: "left" | "right" | "center";
  render: (row: T, rowIndex: number) => ReactNode;
  footer?: ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  rowClassName?: (row: T) => string;
  maxHeight?: string;
}

export function DataTable<T>({ columns, rows, rowKey, rowClassName, maxHeight }: DataTableProps<T>) {
  const hasFooter = columns.some((c) => c.footer !== undefined);
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[var(--border-subtle)] shadow-sm">
      <div className="overflow-y-auto" style={{ maxHeight: maxHeight ?? "560px" }}>
        <table className="data-grid text-sm tabular-nums">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : "text-left"
                  }
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={rowKey(row)} className={rowClassName?.(row)}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left"
                    }
                  >
                    {col.render(row, i)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {hasFooter && (
            <tfoot>
              <tr className="font-semibold bg-[var(--brand-green-tint)]">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={
                      col.align === "right"
                        ? "text-right"
                        : col.align === "center"
                        ? "text-center"
                        : "text-left"
                    }
                  >
                    {col.footer}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
