"use client";

import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, Tag, Building2, Users, Folder, FileText, Layers } from "lucide-react";
import { ProjectsTab } from "@/components/overview/projects-tab";
import { SectorsTab } from "@/components/overview/sectors-tab";
import { EmployerGroupsTab } from "@/components/overview/employer-groups-tab";
import { TermHint } from "@/components/ui/term-hint";

const WorkersTab = dynamic(() => import("@/components/overview/workers-tab").then((m) => ({ default: m.WorkersTab })), { ssr: false });
const EmployersTab = dynamic(() => import("@/components/overview/employers-tab").then((m) => ({ default: m.EmployersTab })), { ssr: false });
const ProgramsTab = dynamic(() => import("@/components/overview/programs-tab").then((m) => ({ default: m.ProgramsTab })), { ssr: false });
const AgreementsTab = dynamic(() => import("@/components/overview/agreements-tab").then((m) => ({ default: m.AgreementsTab })), { ssr: false });
const WorkScopesTab = dynamic(() => import("@/components/overview/work-scopes-tab").then((m) => ({ default: m.WorkScopesTab })), { ssr: false });

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">
          Explore projects, sectors, employer groups, workers, employers,
          programs, agreements, and work scopes.
        </p>
      </div>

      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList className="h-10 w-full justify-start overflow-x-auto flex-nowrap">
          <TabsTrigger value="projects" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            <TermHint
              term="Projects"
              hint="Project-level work packages at a single worksite."
            />
          </TabsTrigger>
          <TabsTrigger value="sectors" className="gap-2">
            <Tag className="h-4 w-4" />
            Sectors
          </TabsTrigger>
          <TabsTrigger value="employer-groups" className="gap-2">
            <Building2 className="h-4 w-4" />
            <TermHint
              term="Employer Groups"
              hint="Parent employer plus child companies using parent_employer_id relationships."
            />
          </TabsTrigger>
          <TabsTrigger value="workers" className="gap-2">
            <Users className="h-4 w-4" />
            Workers
          </TabsTrigger>
          <TabsTrigger value="employers" className="gap-2">
            <Building2 className="h-4 w-4" />
            Employers
          </TabsTrigger>
          <TabsTrigger value="programs" className="gap-2">
            <Folder className="h-4 w-4" />
            Programs
          </TabsTrigger>
          <TabsTrigger value="agreements" className="gap-2">
            <FileText className="h-4 w-4" />
            Agreements
          </TabsTrigger>
          <TabsTrigger value="work-scopes" className="gap-2">
            <Layers className="h-4 w-4" />
            Work Scopes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="projects" className="mt-0">
          <ProjectsTab />
        </TabsContent>

        <TabsContent value="sectors" className="mt-0">
          <SectorsTab />
        </TabsContent>

        <TabsContent value="employer-groups" className="mt-0">
          <EmployerGroupsTab />
        </TabsContent>

        <TabsContent value="workers" className="mt-0">
          <WorkersTab />
        </TabsContent>

        <TabsContent value="employers" className="mt-0">
          <EmployersTab />
        </TabsContent>

        <TabsContent value="programs" className="mt-0">
          <ProgramsTab />
        </TabsContent>

        <TabsContent value="agreements" className="mt-0">
          <AgreementsTab />
        </TabsContent>

        <TabsContent value="work-scopes" className="mt-0">
          <WorkScopesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
