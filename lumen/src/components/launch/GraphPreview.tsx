import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import {
  LogIn,
  Home,
  ShoppingBag,
  Package,
  ShoppingCart,
  CreditCard,
  CheckCircle2,
  User,
  Settings,
  UserPlus,
  Circle,
} from "lucide-react";
import { useAnalysisData } from "../../context/AnalysisDataContext";

const iconMap: Record<string, typeof Home> = {
  login: LogIn,
  signup: UserPlus,
  home: Home,
  products: ShoppingBag,
  "product-detail": Package,
  cart: ShoppingCart,
  checkout: CreditCard,
  confirmation: CheckCircle2,
  profile: User,
  settings: Settings,
};

interface PreviewNodeData {
  label: string;
  screenId: string;
  revealed: boolean;
  active: boolean;
  [key: string]: unknown;
}

function PreviewNode({ data }: NodeProps) {
  const d = data as PreviewNodeData;
  const Icon = iconMap[d.screenId] ?? Circle;
  return (
    <div
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all duration-500 ${
        d.revealed
          ? d.active
            ? "border-brand-400 bg-brand-50 text-brand-700 shadow-cardHover"
            : "border-slate-200 bg-white text-slate-700 shadow-card"
          : "border-transparent bg-transparent text-transparent opacity-0"
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-1.5 !w-1.5 !border-0 !bg-slate-300" />
      <Icon size={14} className={d.revealed ? "text-brand-600" : "text-transparent"} />
      {d.label}
      <Handle type="source" position={Position.Right} className="!h-1.5 !w-1.5 !border-0 !bg-slate-300" />
    </div>
  );
}

const nodeTypes = { preview: PreviewNode };

interface Props {
  revealedIds: string[];
  activeId?: string | null;
}

export function GraphPreview({ revealedIds, activeId }: Props) {
  const { screens, screenEdges } = useAnalysisData();
  const revealedSet = useMemo(() => new Set(revealedIds), [revealedIds]);

  const nodes: Node[] = useMemo(
    () =>
      screens.map((s) => ({
        id: s.id,
        type: "preview",
        position: s.position,
        draggable: false,
        selectable: false,
        data: {
          label: s.name,
          screenId: s.id,
          revealed: revealedSet.has(s.id),
          active: activeId === s.id,
        } as PreviewNodeData,
      })),
    [revealedSet, activeId],
  );

  const edges: Edge[] = useMemo(
    () =>
      screenEdges
        .filter((e) => revealedSet.has(e.source) && revealedSet.has(e.target))
        .map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          animated: true,
          style: { stroke: "#3366ff", strokeWidth: 1.5, opacity: 0.7 },
          markerEnd: { type: MarkerType.ArrowClosed, color: "#3366ff", width: 12, height: 12 },
        })),
    [revealedSet],
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      minZoom={0.2}
      maxZoom={1.2}
      nodesDraggable={false}
      nodesConnectable={false}
      elementsSelectable={false}
      panOnDrag={false}
      zoomOnScroll={false}
      zoomOnPinch={false}
      zoomOnDoubleClick={false}
      panOnScroll={false}
      preventScrolling={false}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#cbd5e1" />
    </ReactFlow>
  );
}
