'use client';

import { useEffect, useRef, useState } from "react";
import { calculateVisibleRange, getTotalHeight } from "@/lib/pagination-utils";

interface VirtualScrollListProps<T> {
  items: T[];
  itemHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  containerClassName?: string;
  onScrollToEnd?: () => void;
  scrollEndThreshold?: number;
}

export function VirtualScrollList<T>({
  items,
  itemHeight,
  renderItem,
  containerClassName = "",
  onScrollToEnd,
  scrollEndThreshold = 200,
}: VirtualScrollListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // Update container height on mount and window resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight);
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  // Handle scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const newScrollTop = container.scrollTop;
      setScrollTop(newScrollTop);

      // Check if we've scrolled near the end
      if (onScrollToEnd) {
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        if (scrollHeight - newScrollTop - clientHeight < scrollEndThreshold) {
          onScrollToEnd();
        }
      }
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [onScrollToEnd, scrollEndThreshold]);

  const { startIndex, endIndex, offsetY } = calculateVisibleRange({
    totalItems: items.length,
    itemHeight,
    containerHeight,
    scrollTop,
  });

  const visibleItems = items.slice(startIndex, endIndex + 1);

  return (
    <div
      ref={containerRef}
      className={`overflow-auto ${containerClassName}`}
      style={{ height: containerHeight }}
    >
      <div
        style={{
          height: getTotalHeight(items.length, itemHeight),
          position: "relative",
        }}
      >
        <div
          style={{
            transform: `translateY(${offsetY}px)`,
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={startIndex + index}
              style={{ height: itemHeight }}
              className="flex items-center"
            >
              {renderItem(item, startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
