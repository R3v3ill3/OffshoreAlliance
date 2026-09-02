/**
 * Which sidebar item is "current" for a pathname.
 *
 * Items nest (`/sms` is the SMS hub, `/sms/inbox` the inbox under it),
 * so a plain prefix test lights both up at once. The current item is
 * the one whose href is the longest prefix of the pathname.
 */
export function matchesNavHref(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

export function isNavItemActive(
  pathname: string | null,
  href: string,
  allHrefs: readonly string[],
): boolean {
  if (!pathname || !matchesNavHref(pathname, href)) return false
  return !allHrefs.some(
    (other) => other !== href && other.length > href.length && matchesNavHref(pathname, other),
  )
}
