'use client';

import { useMemo } from "react";
import { getPaginationStrategy, type PaginationStrategy } from "@/lib/pagination-utils";
import { CursorPagination } from "./cursor-pagination";
import { VirtualScrollList } from "./virtual-scroll-list";

interface AdaptivePaginationProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  onLoadMore?: (cursor?: string) => void;
  hasMore?: boolean;
  loading?: boolean;
  itemHeight?: number;
  className?: string;
  strategy?: PaginationStrategy;
}

export function AdaptivePagination<T>({
  items,
  renderItem,
  onLoadMore,
  hasMore = false,
  loading = false,
  itemHeight = 60,
  className = "",
  strategy,
}: AdaptivePaginationProps<T>) {
  // Determine strategy automatically if not provided
  const autoStrategy = useMemo(() => {
    if (strategy) return { strategy };
    return getPaginationStrategy(items.length);
  }, [items.length, strategy]);

  // No pagination - show all items
  if (autoStrategy.strategy === 'none') {
    return (
      <div className={className}>
        {items.map((item, index) => renderItem(item, index))}
      </div>
    );
  }

  // Cursor pagination - show current page + pagination controls
  if (autoStrategy.strategy === 'cursor') {
    return (
      <div>
        <div className={className}>
          {items.map((item, index) => renderItem(item, index))}
        </div>
        {onLoadMore && (
          <CursorPagination
            hasNextPage={hasMore}
            onNextPage={() => onLoadMore()}
            loading={loading}
            totalItems={items.length}
            pageSize={autoStrategy.pageSize}
          />
        )}
      </div>
    );
  }

  // Virtual scrolling - for large datasets
  if (autoStrategy.strategy === 'virtual') {
    return (
      <VirtualScrollList
        items={items}
        itemHeight={itemHeight}
        renderItem={renderItem}
        containerClassName={className}
        onScrollToEnd={() => hasMore && !loading && onLoadMore?.()}
      />
    );
  }

  return null;
}
