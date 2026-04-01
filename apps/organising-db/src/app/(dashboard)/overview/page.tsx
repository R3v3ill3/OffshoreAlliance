"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, Tag, Building2 } from "lucide-react";
import { ProjectsTab } from "@/components/overview/projects-tab";
import { SectorsTab } from "@/components/overview/sectors-tab";
import { EmployerGroupsTab } from "@/components/overview/employer-groups-tab";
import { TermHint } from "@/components/ui/term-hint";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
        <p className="text-muted-foreground">
          Explore projects, sectors, and employer groups with associated
          worksite, scope, agreement, and campaign information.
        </p>
      </div>

      <Tabs defaultValue="projects" className="space-y-4">
        <TabsList className="h-10">
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
      </Tabs>
    </div>
  );
}
