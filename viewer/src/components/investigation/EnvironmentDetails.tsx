import { Globe, MonitorSmartphone, Cpu, Package, Boxes } from "lucide-react";
import type { Environment } from "../../types";

/** Retyped to the real Environment schema; Task 5 wires it into FindingDetails. */
export function EnvironmentDetails({ env }: { env: Environment }) {
  const rows = [
    { icon: Globe, label: "Browser", value: env.browser },
    { icon: MonitorSmartphone, label: "Viewport", value: env.viewport },
    { icon: Cpu, label: "OS", value: env.os },
    { icon: Package, label: "Node", value: env.node },
    { icon: Boxes, label: "autoend", value: env.autoendVersion },
  ];

  return (
    <section className="card p-5">
      <div className="mb-3 flex items-center gap-2">
        <MonitorSmartphone size={17} className="text-slate-400" />
        <h2 className="text-base font-semibold text-slate-900">Environment</h2>
      </div>
      <dl className="space-y-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-sm text-slate-500">
              <row.icon size={14} className="text-slate-400" />
              {row.label}
            </dt>
            <dd className="text-right text-sm font-medium text-slate-800">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
