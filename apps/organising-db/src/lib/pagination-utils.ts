/**
 * Dual Pagination Strategy
 *
 * - < 250 rows: No pagination (show all)
 * - 250-1000 rows: Cursor pagination
 * - 1000+ rows: Virtual scrolling
 */

export type PaginationStrategy = 'none' | 'cursor' | 'virtual';

export interface PaginationConfig {
  strategy: PaginationStrategy;
  pageSize?: number; // For cursor pagination
  itemHeight?: number; // For virtual scrolling (in pixels)
}

/**
 * Determine the appropriate pagination strategy based on row count
 */
export function getPaginationStrategy(
  totalRows: number,
  customThresholds?: { small: number; large: number }
): PaginationConfig {
  const smallThreshold = customThresholds?.small ?? 250;
  const largeThreshold = customThresholds?.large ?? 1000;

  if (totalRows < smallThreshold) {
    return { strategy: 'none' };
  }

  if (totalRows < largeThreshold) {
    return { strategy: 'cursor', pageSize: 50 };
  }

  return { strategy: 'virtual', itemHeight: 60 };
}

/**
 * Cursor pagination interface
 */
export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
}

export interface CursorPaginationResult<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Generate a cursor from an item (for cursor-based pagination)
 */
export function encodeCursor(item: any, cursorField: string = 'id'): string {
  const cursorValue = item[cursorField];
  return Buffer.from(JSON.stringify({ [cursorField]: cursorValue })).toString('base64');
}

/**
 * Decode a cursor to extract the pivot value
 */
export function decodeCursor(cursor: string): any {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * Apply cursor pagination to an array (client-side)
 */
export function paginateWithCursor<T>(
  items: T[],
  cursorField: keyof T,
  limit: number,
  afterCursor?: string
): CursorPaginationResult<T> {
  let startIndex = 0;

  if (afterCursor) {
    const decoded = decodeCursor(afterCursor);
    if (decoded) {
      const cursorValue = decoded[cursorField as string];
      startIndex = items.findIndex((item) => item[cursorField] === cursorValue) + 1;
    }
  }

  const paginatedItems = items.slice(startIndex, startIndex + limit);
  const lastItem = paginatedItems[paginatedItems.length - 1];
  const hasMore = startIndex + limit < items.length;

  return {
    items: paginatedItems,
    nextCursor: lastItem ? encodeCursor(lastItem, cursorField as string) : undefined,
    hasMore,
  };
}

/**
 * Virtual scrolling utilities
 */
export interface VirtualScrollParams {
  totalItems: number;
  itemHeight: number;
  containerHeight: number;
  scrollTop: number;
}

export interface VirtualScrollResult {
  startIndex: number;
  endIndex: number;
  visibleItems: number;
  offsetY: number;
}

/**
 * Calculate which items should be visible in a virtual scroll container
 */
export function calculateVisibleRange(params: VirtualScrollParams): VirtualScrollResult {
  const { totalItems, itemHeight, containerHeight, scrollTop } = params;

  const startIndex = Math.floor(scrollTop / itemHeight);
  const endIndex = Math.min(
    totalItems - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight)
  );

  // Add buffer items for smooth scrolling
  const buffer = 5;
  const bufferedStartIndex = Math.max(0, startIndex - buffer);
  const bufferedEndIndex = Math.min(totalItems - 1, endIndex + buffer);

  return {
    startIndex: bufferedStartIndex,
    endIndex: bufferedEndIndex,
    visibleItems: bufferedEndIndex - bufferedStartIndex + 1,
    offsetY: bufferedStartIndex * itemHeight,
  };
}

/**
 * Calculate the total height of a virtual scroll container
 */
export function getTotalHeight(totalItems: number, itemHeight: number): number {
  return totalItems * itemHeight;
}
