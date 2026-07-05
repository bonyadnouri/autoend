import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  PackageX,
  Unplug,
  Palette,
  EyeOff,
  Shuffle,
  Sparkles,
  ArrowRight,
  Layers,
  Route as RouteIcon,
  Wrench,
} from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { SeverityBadge } from "../components/SeverityBadge";
import { AiBadge } from "../components/StatusBadge";
import { insightCategoryLabel, severityRank } from "../data/helpers";
import { useAnalysisData } from "../context/AnalysisDataContext";
import { screenHref } from "../lib/paths";
import type { InsightCategory } from "../types";

const categoryIcon: Record<InsightCategory, typeof PackageX> = {
  "missing-functionality": PackageX,
  "broken-flow": Unplug,
  "ux-inconsistency": Palette,
  "unreachable-screen": EyeOff,
  "unexpected-navigation": Shuffle,
  "suggested-improvement": Sparkles,
};

const order: InsightCategory[] = [
  "missing-functionality",
  "broken-flow",
  "unexpected-navigation",
  "unreachable-screen",
  "ux-inconsistency",
  "suggested-improvement",
];

export function Insights() {
  const { insights, getJourney, getScreen, appSummary } = useAnalysisData();
  const [active, setActive] = useState<InsightCategory | "all">("all");

  const grouped = useMemo(() => {
    const map = new Map<InsightCategory, typeof insights>();
    for (const cat of order) {
      const items = insights
        .filter((i) => i.category === cat)
        .sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
      if (items.length) map.set(cat, items);
    }
    return map;
  }, [insights]);

  const visibleCategories = active === "all" ? [...grouped.keys()] : [active];

  return (
    <div>
      <PageHeader
        title="AI Insights"
        subtitle={`Intelligent observations the AI derived by comparing expected behavior against what ${appSummary.appName} actually does.`}
        backTo="/"
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <CategoryChip label="All" active={active === "all"} onClick={() => setActive("all")} count={insights.length} />
        {[...grouped.entries()].map(([cat, items]) => (
          <CategoryChip
            key={cat}
            label={insightCategoryLabel[cat]}
            active={active === cat}
            onClick={() => setActive(cat)}
            count={items.length}
          />
        ))}
      </div>

      <div className="space-y-8">
        {visibleCategories.map((cat) => {
          const items = grouped.get(cat)!;
          const Icon = categoryIcon[cat];
          return (
            <section key={cat}>
              <div className="mb-3 flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-status-aiBg text-status-ai">
                  <Icon size={17} />
                </span>
                <h2 className="text-base font-semibold text-slate-900">
                  {insightCategoryLabel[cat]}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                  {items.length}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {items.map((insight) => {
                  const screen = insight.relatedScreenId
                    ? getScreen(insight.relatedScreenId)
                    : undefined;
                  const journey = insight.relatedJourneyId
                    ? getJourney(insight.relatedJourneyId)
                    : undefined;
                  return (
                    <article
                      key={insight.id}
                      className="card min-w-0 border-l-4 border-l-status-ai p-5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="min-w-0 break-words text-sm font-bold text-slate-900">
                          {insight.title}
                        </h3>
                        <SeverityBadge severity={insight.severity} />
                      </div>
                      <div className="mt-2">
                        <AiBadge />
                      </div>
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-600">
                        {insight.description}
                      </p>

                      {insight.suggestedFix && (
                        <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                            <Wrench size={12} /> Suggested fix
                          </div>
                          <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                            {insight.suggestedFix}
                          </p>
                        </div>
                      )}

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {screen && (
                          <Link
                            to={screenHref(screen.id)}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                          >
                            <Layers size={12} /> {screen.name}
                          </Link>
                        )}
                        {journey && (
                          <Link
                            to={`/journeys/${journey.id}`}
                            className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200"
                          >
                            <RouteIcon size={12} /> {journey.name}
                          </Link>
                        )}
                        {insight.issueId && (
                          <Link
                            to={`/issues/${insight.issueId}`}
                            className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700"
                          >
                            View issue <ArrowRight size={13} />
                          </Link>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-brand-200 bg-brand-50 text-brand-700"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {label}
      <span
        className={`rounded-full px-1.5 text-xs font-semibold ${
          active ? "bg-brand-100 text-brand-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
