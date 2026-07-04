interface Props {
  value: number;
  size?: "sm" | "md";
}

export function ConfidenceMeter({ value, size = "md" }: Props) {
  const tone =
    value >= 80 ? "text-status-ai" : value >= 60 ? "text-status-warn" : "text-status-fail";
  const bar =
    value >= 80 ? "bg-status-ai" : value >= 60 ? "bg-status-warn" : "bg-status-fail";

  if (size === "sm") {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
          <span className={`block h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
        </span>
        <span className={`text-xs font-semibold ${tone}`}>{value}%</span>
      </span>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-500">Confidence</span>
        <span className={`text-sm font-bold ${tone}`}>{value}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
