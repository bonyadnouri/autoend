import {
  Smartphone,
  Cpu,
  Package,
  RotateCw,
  Palette,
  Wifi,
  Clock,
  MonitorSmartphone,
} from "lucide-react";
import type { Environment } from "../../types";
import { formatDateTime } from "../../data/helpers";

export function EnvironmentDetails({ env }: { env: Environment }) {
  const rows = [
    { icon: Smartphone, label: "Device", value: env.device },
    { icon: Cpu, label: "OS version", value: env.os },
    { icon: Package, label: "App version", value: env.appVersion },
    { icon: RotateCw, label: "Orientation", value: env.orientation },
    { icon: Palette, label: "Theme", value: env.theme },
    { icon: Wifi, label: "Network", value: env.network },
    { icon: Clock, label: "Timestamp", value: formatDateTime(env.timestamp) },
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
