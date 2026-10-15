import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { DataSource, RailTab } from "@/lib/landing-content";

/** One tab's preview card. Static — no protein is loaded on the landing page. */
export function RailTabPreview({ tab }: { tab: RailTab }) {
  return (
    <Card className="gap-3 border-dashed py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-sm">{tab.title}</CardTitle>
        <CardDescription className="text-[11px]">
          {tab.source} &middot; shown once a protein is loaded
        </CardDescription>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="space-y-1.5 text-[11px] leading-relaxed text-muted-foreground">
          {tab.items.map((item) => (
            <li key={item} className="flex gap-2">
              <span aria-hidden className="text-primary">
                &bull;
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** A compact card per integrated database. */
export function DataSourceCard({ source }: { source: DataSource }) {
  return (
    <div className="rounded-md border border-border/60 bg-card/85 px-3 py-2.5 backdrop-blur-sm">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">{source.name}</span>
        <span className="truncate font-mono text-[10px] text-muted-foreground">
          {source.host}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {source.body}
      </p>
    </div>
  );
}
