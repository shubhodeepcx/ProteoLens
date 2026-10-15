"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { AnalyticsPanel } from "@/components/analytics-panel";
import { AnnotationsPanel } from "@/components/annotations-panel";
import { ClinicalPanel } from "@/components/clinical-panel";
import { ComplexesPanel } from "@/components/complexes-panel";
import { ConservationPanel } from "@/components/conservation-panel";
import { CompoundsPanel } from "@/components/compounds-panel";
import { DockingPanel } from "@/components/docking-panel";
import { NeoantigenPanel } from "@/components/neoantigen-panel";
import { OncologyPanel } from "@/components/oncology-panel";
import { OverviewPanel } from "@/components/overview-panel";
import { SequencePanel } from "@/components/sequence-panel";
import { SimilarityPanel } from "@/components/similarity-panel";
import { VariantPanel } from "@/components/variant-panel";

/**
 * The workspace's right rail (spec 4.1, extended in P6, P8 and P9):
 * Overview / Sequence / Analytics / Annotations / Variants / Compounds / Similarity /
 * Complexes / Clinical / Oncology / Neoantigens / Conservation / Docking.
 *
 * Rendered twice by the viewer page — once as the `xl` side rail and once
 * stacked below the viewer at narrow widths — so it keeps its own tab state.
 */
export function ViewerRail({ proteinId }: { proteinId: string }) {
  return (
    <Tabs defaultValue="overview" className="flex h-full min-h-0 flex-col gap-0">
      <TabsList
        variant="line"
        className="h-auto w-full shrink-0 flex-wrap justify-start gap-1 border-b border-border px-2 py-1"
      >
        <TabsTrigger value="overview" className="text-xs">
          Overview
        </TabsTrigger>
        <TabsTrigger value="sequence" className="text-xs">
          Sequence
        </TabsTrigger>
        <TabsTrigger value="analytics" className="text-xs">
          Analytics
        </TabsTrigger>
        <TabsTrigger value="annotations" className="text-xs">
          Annotations
        </TabsTrigger>
        <TabsTrigger value="variants" className="text-xs">
          Variants
        </TabsTrigger>
        <TabsTrigger value="compounds" className="text-xs">
          Compounds
        </TabsTrigger>
        <TabsTrigger value="similarity" className="text-xs">
          Similarity
        </TabsTrigger>
        <TabsTrigger value="complexes" className="text-xs">
          Complexes
        </TabsTrigger>
        <TabsTrigger value="clinical" className="text-xs">
          Clinical
        </TabsTrigger>
        <TabsTrigger value="oncology" className="text-xs">
          Oncology
        </TabsTrigger>
        <TabsTrigger value="neoantigens" className="text-xs">
          Neoantigens
        </TabsTrigger>
        <TabsTrigger value="conservation" className="text-xs">
          Conservation
        </TabsTrigger>
        <TabsTrigger value="docking" className="text-xs">
          Docking
        </TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="min-h-0 overflow-hidden">
        <OverviewPanel />
      </TabsContent>
      <TabsContent value="sequence" className="min-h-0 overflow-hidden">
        <SequencePanel />
      </TabsContent>
      <TabsContent value="analytics" className="min-h-0 overflow-hidden">
        <AnalyticsPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="annotations" className="min-h-0 overflow-hidden">
        <AnnotationsPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="variants" className="min-h-0 overflow-hidden">
        <VariantPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="compounds" className="min-h-0 overflow-hidden">
        <CompoundsPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="similarity" className="min-h-0 overflow-hidden">
        <SimilarityPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="complexes" className="min-h-0 overflow-hidden">
        <ComplexesPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="clinical" className="min-h-0 overflow-hidden">
        <ClinicalPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="oncology" className="min-h-0 overflow-hidden">
        <OncologyPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="neoantigens" className="min-h-0 overflow-hidden">
        <NeoantigenPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="conservation" className="min-h-0 overflow-hidden">
        <ConservationPanel proteinId={proteinId} />
      </TabsContent>
      <TabsContent value="docking" className="min-h-0 overflow-hidden">
        <DockingPanel proteinId={proteinId} />
      </TabsContent>
    </Tabs>
  );
}
