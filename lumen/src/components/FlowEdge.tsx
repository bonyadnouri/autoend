import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

const LABEL_WIDTH_PX = 220;
const LABEL_HEIGHT_PX = 44;

export function FlowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const displayLabel =
    typeof data?.displayLabel === "string" ? data.displayLabel : undefined;
  const tooltip =
    typeof data?.fullLabel === "string" ? data.fullLabel : displayLabel;

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {displayLabel ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              width: LABEL_WIDTH_PX,
              minWidth: LABEL_WIDTH_PX,
              maxWidth: LABEL_WIDTH_PX,
              height: LABEL_HEIGHT_PX,
              minHeight: LABEL_HEIGHT_PX,
              boxSizing: "border-box",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "all",
            }}
            className="nodrag nopan rounded border border-slate-200 bg-white/90 px-2 py-1 text-center text-[11px] font-medium leading-snug text-slate-600"
            title={tooltip}
          >
            <span className="line-clamp-2">{displayLabel}</span>
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
