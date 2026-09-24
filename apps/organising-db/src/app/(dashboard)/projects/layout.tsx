"use client";

import { ProjectsShell } from "./_components/shell";

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  return <ProjectsShell>{children}</ProjectsShell>;
}
