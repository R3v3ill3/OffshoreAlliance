import type { QueryClient } from "@tanstack/react-query";

const EMPLOYER_QUERY_PREFIXES = new Set([
  "employers",
  "employers-active",
  "employers-active-universe",
  "employers-all",
  "employers-all-names",
  "employers-select",
  "employer-search",
  "employer-scope-links",
  "overview-all-employers",
  "ref-wizard-employers",
  "wizard-employers",
]);

export function invalidateEmployerQueries(queryClient: QueryClient) {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) => {
      const [prefix] = queryKey;
      return typeof prefix === "string" && EMPLOYER_QUERY_PREFIXES.has(prefix);
    },
  });
}
