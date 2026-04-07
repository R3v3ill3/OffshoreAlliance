"use client";

import { useState, useMemo, useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search, Download } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { useDevice } from "@/contexts/device-context";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

export interface DataTableSelection<T> {
  rowId: (item: T) => string;
  selectedIds: ReadonlySet<string>;
  onToggleRow: (id: string, selected: boolean) => void;
  onToggleAllVisible: (visibleRowIds: string[], selected: boolean) => void;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchKeys?: string[];
  onRowClick?: (item: T) => void;
  pageSize?: number;
  loading?: boolean;
  selection?: DataTableSelection<T>;
  filterBar?: React.ReactNode;
  /** Expose the full filtered dataset (not just current page) for select-all-filtered. */
  onFilteredDataChange?: (data: T[]) => void;
}

const DEFAULT_PAGE_SIZE = 50;
const PERSISTED_PAGE_SIZES = new Set([20, 50, 100]);

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  searchPlaceholder = "Search...",
  searchKeys = [],
  onRowClick,
  pageSize: initialPageSize = DEFAULT_PAGE_SIZE,
  loading = false,
  selection,
  filterBar,
  onFilteredDataChange,
}: DataTableProps<T>) {
  const { isMobile } = useDevice();
  const pathname = usePathname();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const pageSizeStorageKey = `organising-db:rows-per-page:${pathname}`;

  useEffect(() => {
    const storedPageSize = window.localStorage.getItem(pageSizeStorageKey);
    if (!storedPageSize) return;

    const parsedPageSize = Number(storedPageSize);
    if (!PERSISTED_PAGE_SIZES.has(parsedPageSize)) return;

    setPageSize(parsedPageSize);
    setPage(0);
  }, [pageSizeStorageKey]);

  useEffect(() => {
    if (!PERSISTED_PAGE_SIZES.has(pageSize)) return;
    window.localStorage.setItem(pageSizeStorageKey, String(pageSize));
  }, [pageSize, pageSizeStorageKey]);

  const filtered = useMemo(() => {
    if (!search.trim()) return data;
    const lower = search.toLowerCase();
    return data.filter((item) =>
      searchKeys.some((key) => {
        const val = item[key];
        return val != null && String(val).toLowerCase().includes(lower);
      })
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  const visibleRowIds = useMemo(
    () => (selection ? paged.map((item) => selection.rowId(item)) : []),
    [paged, selection]
  );
  const allVisibleSelected =
    selection &&
    visibleRowIds.length > 0 &&
    visibleRowIds.every((id) => selection.selectedIds.has(id));
  const someVisibleSelected =
    selection && visibleRowIds.some((id) => selection.selectedIds.has(id));
  const colCount = columns.length + (selection ? 1 : 0);

  useEffect(() => {
    onFilteredDataChange?.(sorted);
  }, [sorted, onFilteredDataChange]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const exportCsv = () => {
    const headers = columns.map((col) => col.header);
    const rows = sorted.map((item) =>
      columns.map((col) => {
        const val = item[col.key];
        if (val == null) return "";
        return String(val).replace(/"/g, '""');
      })
    );
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "export.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative flex-1 w-full md:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-3">
          {sorted.length > 0 && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="h-8">
              <Download className="h-3.5 w-3.5 mr-1" />
              Export
            </Button>
          )}
          <span className="text-sm text-muted-foreground">
            {sorted.length} record{sorted.length !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {filterBar}

      {isMobile ? (
        // Mobile Card View
        <div className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <EurekaLoadingSpinner size="md" />
            </div>
          ) : paged.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No results found.
            </div>
          ) : (
            paged.map((item, i) => (
              <Card
                key={selection ? selection.rowId(item) : i}
                onClick={() => onRowClick?.(item)}
                className={onRowClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""}
              >
                <CardContent className="p-4 space-y-3">
                  {selection && (
                    <div
                      className="flex items-center gap-2 pb-2 border-b"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selection.selectedIds.has(selection.rowId(item))}
                        onCheckedChange={(c) =>
                          selection.onToggleRow(selection.rowId(item), c === true)
                        }
                        aria-label="Select row"
                      />
                      <span className="text-xs text-muted-foreground">Select</span>
                    </div>
                  )}
                  {/* First column is usually the "title" or main identifier */}
                  <div className="font-medium text-base border-b pb-2">
                    {columns[0].render
                      ? columns[0].render(item)
                      : (item[columns[0].key] as React.ReactNode) ?? "—"}
                  </div>
                  
                  {/* Remaining columns as key-value pairs */}
                  <div className="grid gap-2 text-sm">
                    {columns.slice(1).map((col) => (
                      <div key={col.key} className="flex flex-col gap-1">
                        <span className="text-muted-foreground text-xs uppercase tracking-wider font-semibold">
                          {col.header}
                        </span>
                        <div>
                          {col.render
                            ? col.render(item)
                            : (item[col.key] as React.ReactNode) ?? "—"}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : (
        // Desktop Table View
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                {selection && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={
                        allVisibleSelected
                          ? true
                          : someVisibleSelected
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={(c) =>
                        selection.onToggleAllVisible(visibleRowIds, c === true)
                      }
                      aria-label="Select all on this page"
                    />
                  </TableHead>
                )}
                {columns.map((col) => (
                  <TableHead key={col.key} className={col.className}>
                    {col.sortable !== false ? (
                      <button
                        onClick={() => handleSort(col.key)}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        {col.header}
                        <ArrowUpDown className="h-3 w-3" />
                      </button>
                    ) : (
                      col.header
                    )}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-24 text-center">
                    <EurekaLoadingSpinner size="md" />
                  </TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colCount} className="h-24 text-center">
                    No results found.
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((item, i) => (
                  <TableRow
                    key={selection ? selection.rowId(item) : i}
                    onClick={() => onRowClick?.(item)}
                    className={onRowClick ? "cursor-pointer" : ""}
                  >
                    {selection && (
                      <TableCell
                        className="w-10"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selection.selectedIds.has(selection.rowId(item))}
                          onCheckedChange={(c) =>
                            selection.onToggleRow(selection.rowId(item), c === true)
                          }
                          aria-label="Select row"
                        />
                      </TableCell>
                    )}
                    {columns.map((col) => (
                      <TableCell key={col.key} className={col.className}>
                        {col.render
                          ? col.render(item)
                          : (item[col.key] as React.ReactNode) ?? "—"}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground hidden md:inline">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              setPageSize(Number(v));
              setPage(0);
            }}
          >
            <SelectTrigger className="w-16 h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((s) => (
                <SelectItem key={s} value={String(s)}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground mr-2">
            Page {page + 1} of {Math.max(totalPages, 1)}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPage(0)}
            disabled={page === 0}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPage(page - 1)}
            disabled={page === 0}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages - 1}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setPage(totalPages - 1)}
            disabled={page >= totalPages - 1}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
