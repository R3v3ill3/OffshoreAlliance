"use client";

import { useState, useMemo } from "react";
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
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowUpDown, Search } from "lucide-react";
import { EurekaLoadingSpinner } from "@/components/ui/eureka-loading";
import { useDevice } from "@/contexts/device-context";
import { Card, CardContent } from "@/components/ui/card";

export interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  sortable?: boolean;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  searchKeys?: string[];
  onRowClick?: (item: T) => void;
  pageSize?: number;
  loading?: boolean;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  searchPlaceholder = "Search...",
  searchKeys = [],
  onRowClick,
  pageSize: initialPageSize = 20,
  loading = false,
}: DataTableProps<T>) {
  const { isMobile } = useDevice();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

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

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
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
        <div className="text-sm text-muted-foreground">
          {sorted.length} record{sorted.length !== 1 ? "s" : ""}
        </div>
      </div>

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
                key={i}
                onClick={() => onRowClick?.(item)}
                className={onRowClick ? "cursor-pointer active:scale-[0.98] transition-transform" : ""}
              >
                <CardContent className="p-4 space-y-3">
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
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    <EurekaLoadingSpinner size="md" />
                  </TableCell>
                </TableRow>
              ) : paged.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    No results found.
                  </TableCell>
                </TableRow>
              ) : (
                paged.map((item, i) => (
                  <TableRow
                    key={i}
                    onClick={() => onRowClick?.(item)}
                    className={onRowClick ? "cursor-pointer" : ""}
                  >
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
