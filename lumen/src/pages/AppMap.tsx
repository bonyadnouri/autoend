import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  type Node,
  type Edge,
  type NodeMouseHandler,
  BackgroundVariant,
} from "@xyflow/react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Loader2, LogIn, Layers, Video, X } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { RunBanner } from "../components/RunBanner";
import { JourneyReplayModal, type JourneyReplay } from "../components/JourneyReplayModal";
import { JourneySelect, type JourneyQuickFilter } from "../components/JourneySelect";
import { ScreenNode, type ScreenNodeData } from "../components/ScreenNode";
import { FlowEdge } from "../components/FlowEdge";
import { JourneyStatusBadge } from "../components/StatusBadge";
import { useAnalysis } from "../context/AnalysisContext";
import { useAnalysisData } from "../context/AnalysisDataContext";
import { useActiveRun, useLiveRunSync } from "../lib/runs";
import { isSupabaseConfigured } from "../lib/supabase";
import { layoutScreens } from "../lib/layout";
import { screenHref } from "../lib/paths";

const nodeTypes = { screen: ScreenNode };
const edgeTypes = { flow: FlowEdge };

function truncateLabel(label: string): string {
  const max = 32;
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;
}

const edgeColor: Record<string, string> = {
  normal: "#94a3b8",
  warning: "#d97706",
  broken: "#dc2626",
};

export function AppMap() {
  const navigate = useNavigate();
  const { analysisId } = useAnalysis();
  const { screens, screenEdges, journeys, getJourney, getScreen, getTest, getInvestigation, appSummary } =
    useAnalysisData();
  const activeRunQuery = useActiveRun(analysisId);
  const activeRun = isSupabaseConfigured ? activeRunQuery.data : null;
  useLiveRunSync(analysisId, Boolean(activeRun && (activeRun.status === "queued" || activeRun.status === "running")));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [journeyFilter, setJourneyFilter] = useState<string>("all");
  const [replayOpen, setReplayOpen] = useState(false);

  const journeyReplays = useMemo<JourneyReplay[]>(() => {
    if (journeyFilter === "all") return [];
    const j = getJourney(journeyFilter);
    if (!j) return [];
    return j.testCaseIds
      .map((tid) => {
        const test = getTest(tid);
        const investigation = getInvestigation(tid);
        return test && investigation ? { test, investigation } : null;
      })
      .filter(
        (r): r is JourneyReplay =>
          Boolean(r) &&
          Boolean(r!.investigation.replay.videoUrl || r!.investigation.replay.frames.length > 0),
      );
  }, [journeyFilter, getJourney, getTest, getInvestigation]);

  useEffect(() => {
    setReplayOpen(false);
  }, [journeyFilter]);

  // Quick filters derived from the pages each journey passes through, so users
  // can narrow the list by functionality (e.g. Login, Settings) before picking.
  const journeyQuickFilters = useMemo<JourneyQuickFilter[]>(() => {
    const byScreen = new Map<string, { label: string; journeyIds: string[] }>();
    for (const j of journeys) {
      const screenIds = new Set(j.steps.map((s) => s.screenId));
      for (const sid of screenIds) {
        const label = getScreen(sid)?.name;
        if (!label) continue;
        const entry = byScreen.get(sid) ?? { label, journeyIds: [] };
        entry.journeyIds.push(j.id);
        byScreen.set(sid, entry);
      }
    }
    return Array.from(byScreen.entries())
      .map(([id, v]) => ({ id, label: v.label, journeyIds: v.journeyIds }))
      .filter((f) => f.journeyIds.length > 1)
      .sort((a, b) => b.journeyIds.length - a.journeyIds.length);
  }, [journeys, getScreen]);

  const journeyScreenIds = useMemo(() => {
    if (journeyFilter === "all") return null;
    const j = getJourney(journeyFilter);
    return j ? new Set(j.steps.map((s) => s.screenId)) : null;
  }, [journeyFilter, getJourney]);

  const journeyEdgeKeys = useMemo(() => {
    if (journeyFilter === "all") return null;
    const j = getJourney(journeyFilter);
    if (!j) return null;
    const keys = new Set<string>();
    for (let i = 0; i < j.steps.length - 1; i++) {
      keys.add(`${j.steps[i].screenId}->${j.steps[i + 1].screenId}`);
    }
    return keys;
  }, [journeyFilter, getJourney]);

  // Positions are derived from the graph structure rather than read from stored
  // pixel coordinates, so a live run lays itself out without the backend baking
  // in absolute positions (screens with a real stored position keep it).
  const layout = useMemo(() => layoutScreens(screens, screenEdges), [screens, screenEdges]);

  const nodes: Node[] = useMemo(
    () =>
      screens.map((s) => {
        const inJourney = journeyScreenIds ? journeyScreenIds.has(s.id) : true;
        const data: ScreenNodeData = {
          screenId: s.id,
          name: s.name,
          type: s.type,
          status: s.status,
          isEntryPoint: s.isEntryPoint,
          elementCount: s.elements.length,
          issueCount: s.issueIds.length,
          dimmed: !inJourney,
          highlighted: journeyScreenIds ? inJourney : false,
        };
        return {
          id: s.id,
          type: "screen",
          position: layout.get(s.id) ?? s.position,
          data: data as unknown as Record<string, unknown>,
          selected: selectedId === s.id,
        };
      }),
    [screens, layout, journeyScreenIds, selectedId],
  );

  const edges: Edge[] = useMemo(
    () =>
      screenEdges.map((e) => {
        const key = `${e.source}->${e.target}`;
        const inJourney = journeyEdgeKeys ? journeyEdgeKeys.has(key) : true;
        const color = edgeColor[e.status];
        // Edge labels are flow-title sentences; shown in full they overlap and
        // bury the graph. Truncate to a short hint (full text stays as a tooltip)
        // and only render it when the edge is highlighted in a journey.
        const showLabel = journeyEdgeKeys ? inJourney : false;
        return {
          id: e.id,
          type: "flow",
          source: e.source,
          target: e.target,
          data: showLabel
            ? { displayLabel: truncateLabel(e.label), fullLabel: e.label }
            : undefined,
          animated: e.status === "broken" || (journeyEdgeKeys ? inJourney : false),
          style: {
            stroke: color,
            strokeWidth: inJourney ? 2.5 : 1.5,
            opacity: journeyEdgeKeys && !inJourney ? 0.15 : 1,
            strokeDasharray: e.status === "broken" ? "6 4" : undefined,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color,
            width: 16,
            height: 16,
          },
        };
      }),
    [screenEdges, journeyEdgeKeys],
  );

  const onNodeClick: NodeMouseHandler = useCallback((_, node) => {
    setSelectedId(node.id);
  }, []);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_, node) => {
      navigate(screenHref(node.id));
    },
    [navigate],
  );

  const selectedScreen = selectedId ? getScreen(selectedId) : null;
  const highlightedJourney = journeyFilter !== "all" ? getJourney(journeyFilter) : null;
  const hasScreens = screens.length > 0;
  const isLiveRun = Boolean(
    activeRun && (activeRun.status === "queued" || activeRun.status === "running"),
  );

  return (
    <div className="-my-8 flex min-h-[calc(100vh-4rem)] flex-col gap-4 py-8">
      <div className="shrink-0">
        <PageHeader
          title="Application Map"
          subtitle={``}
          actions={
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-500">Highlight journey</label>
              <JourneySelect
                journeys={journeys}
                quickFilters={journeyQuickFilters}
                value={journeyFilter}
                onChange={setJourneyFilter}
              />
              {journeyFilter !== "all" && (
                <button
                  className="text-slate-400 hover:text-slate-600"
                  onClick={() => setJourneyFilter("all")}
                  aria-label="Clear journey"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          }
        />
      </div>

      {activeRun && <RunBanner run={activeRun} showConsole screenCount={screens.length} />}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="relative flex min-h-0 flex-col lg:col-span-3">
          {hasScreens ? (
            <>
              <div className="card min-h-[320px] flex-1 overflow-hidden">
                <ReactFlow
                  className="h-full w-full"
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  onNodeClick={onNodeClick}
                  onNodeDoubleClick={onNodeDoubleClick}
                  onPaneClick={() => setSelectedId(null)}
                  fitView
                  fitViewOptions={{ padding: 0.2 }}
                  minZoom={0.3}
                  maxZoom={1.5}
                  proOptions={{ hideAttribution: true }}
                >
                  <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#e2e8f0" />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>

              <div className="mt-3 flex shrink-0 flex-wrap items-center gap-4 text-xs text-slate-500">
                <LegendDot color="#16a34a" label="Healthy" />
                <LegendDot color="#d97706" label="Warning" />
                <LegendDot color="#dc2626" label="Broken" />
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-0.5 w-6 bg-status-fail" style={{ backgroundImage: "none" }} />
                  <span>Broken navigation</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <LogIn size={13} className="text-brand-600" /> Entry point
                </span>
              </div>
            </>
          ) : (
            <div className="card grid min-h-[320px] flex-1 place-items-center p-8 text-center">
              {isLiveRun ? (
                <>
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-50 text-cyan-600">
                    <Loader2 size={22} className="animate-spin" />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-slate-800">Building application map</h3>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">
                    Screens will appear here as they are discovered. Watch the live log above for
                    progress.
                  </p>
                </>
              ) : (
                <>
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
                    <Layers size={22} />
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-slate-800">No screens yet</h3>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">
                    Run an analysis to discover pages and build your application map.
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="min-h-0 overflow-y-auto lg:col-span-1">
          {selectedScreen ? (
            <div className="card sticky top-0 p-5">
              <div className="mb-3 flex items-start justify-between">
                <span className="section-title">Screen preview</span>
                <button
                  className="text-slate-400 hover:text-slate-600"
                  onClick={() => setSelectedId(null)}
                  aria-label="Close preview"
                >
                  <X size={16} />
                </button>
              </div>
              <h3 className="text-lg font-bold text-slate-900">{selectedScreen.name}</h3>
              <div className="mt-2">
                <JourneyStatusBadge status={selectedScreen.status} />
              </div>
              <p className="mt-3 text-sm text-slate-600">{selectedScreen.description}</p>

              <dl className="mt-4 space-y-2 text-sm">
                <PreviewRow label="Interactive elements" value={selectedScreen.elements.length} />
                <PreviewRow label="Navigation options" value={selectedScreen.navigation.length} />
                <PreviewRow label="Generated tests" value={selectedScreen.testCaseIds.length} />
                <PreviewRow
                  label="Related issues"
                  value={selectedScreen.issueIds.length}
                  emphasize={selectedScreen.issueIds.length > 0}
                />
              </dl>

              <button
                className="btn-primary mt-5 w-full"
                onClick={() => navigate(screenHref(selectedScreen.id))}
              >
                Open full details <ArrowRight size={16} />
              </button>
            </div>
          ) : highlightedJourney ? (
            <div className="card sticky top-0 p-5">
              <div className="mb-3 flex items-start justify-between">
                <span className="section-title">Journey overview</span>
                <button
                  className="text-slate-400 hover:text-slate-600"
                  onClick={() => setJourneyFilter("all")}
                  aria-label="Clear journey"
                >
                  <X size={16} />
                </button>
              </div>
              <h3 className="text-lg font-bold text-slate-900">{highlightedJourney.name}</h3>
              <p className="mt-2 text-sm text-slate-600">{highlightedJourney.description}</p>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Coverage</span>
                  <span className="font-semibold text-slate-700">{highlightedJourney.coverage}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${highlightedJourney.coverage}%` }}
                  />
                </div>
              </div>

              <div className="mt-4">
                <span className="section-title">Steps</span>
                <ol className="mt-2 space-y-1.5">
                  {highlightedJourney.steps
                    .filter((step, i) => step.screenId !== highlightedJourney.steps[i - 1]?.screenId)
                    .map((step, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(step.screenId)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                            {i + 1}
                          </span>
                          <span className="truncate">{getScreen(step.screenId)?.name}</span>
                        </button>
                      </li>
                    ))}
                </ol>
              </div>

              {journeyReplays.length > 0 && (
                <button className="btn-primary mt-5 w-full" onClick={() => setReplayOpen(true)}>
                  <Video size={16} /> Play replay
                </button>
              )}
            </div>
          ) : (
            <div className="card grid place-items-center p-8 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100 text-slate-400">
                <Layers size={22} />
              </span>
              <h3 className="mt-3 text-sm font-semibold text-slate-800">
                {hasScreens ? "Select a screen" : isLiveRun ? "Waiting for screens" : "No screens yet"}
              </h3>
              <p className="mt-1 text-sm text-slate-500">
                {hasScreens
                  ? "Click any node on the map to preview what the AI learned about it."
                  : isLiveRun
                    ? "Screen previews will appear here as they are discovered."
                    : "Run an analysis to populate the application map."}
              </p>
            </div>
          )}
        </aside>
      </div>

      {replayOpen && journeyReplays.length > 0 && (
        <JourneyReplayModal
          journey={getJourney(journeyFilter)!}
          replays={journeyReplays}
          onClose={() => setReplayOpen(false)}
        />
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function PreviewRow({
  label,
  value,
  emphasize,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-semibold ${emphasize ? "text-status-fail" : "text-slate-800"}`}>
        {value}
      </dd>
    </div>
  );
}
