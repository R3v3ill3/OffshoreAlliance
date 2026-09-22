/**
 * robots.txt allow-check for the paths we poll. An empty or missing file
 * allows. A Disallow that covers the path for `*` or our UA blocks the fetch.
 */
export function robotsAllows(robotsTxt: string, path: string, ua = "*"): boolean {
  const groups = parseGroups(robotsTxt);
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && ua.toLowerCase().includes(a)));
  const star = groups.filter((g) => g.agents.includes("*"));
  const applicable = specific.length ? specific : star;
  let allowed = true;
  let best = -1;
  for (const group of applicable) {
    for (const rule of group.rules) {
      if (!path.startsWith(rule.path) && rule.path !== "/") continue;
      if (rule.path.length < best) continue;
      if (rule.path.length === best && rule.allow) continue;
      best = rule.path.length;
      allowed = rule.allow;
    }
  }
  return allowed;
}

function parseGroups(text: string): { agents: string[]; rules: { allow: boolean; path: string }[] }[] {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: { agents: string[]; rules: { allow: boolean; path: string }[] } | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) {
      current = null;
      continue;
    }
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim().toLowerCase();
    const field = key!.trim().toLowerCase();
    if (field === "user-agent") {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value);
    } else if ((field === "allow" || field === "disallow") && current) {
      const path = rest.join(":").trim();
      // An empty Disallow means nothing is disallowed for that group.
      if (field === "disallow" && !path) continue;
      current.rules.push({ allow: field === "allow", path: path || "/" });
    }
  }
  return groups;
}
