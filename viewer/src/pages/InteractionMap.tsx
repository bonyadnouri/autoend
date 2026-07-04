import { GitBranch } from "lucide-react";
import { PageHeader } from "../components/PageHeader";
import { useReport } from "../data/report";

export function InteractionMap() {
  const { artifact } = useReport();
  const graph = artifact.graph;

  if (!graph || graph.nodes.length === 0) {
    return (
      <div>
        <PageHeader
          title="Interaction map"
          subtitle="States visited during the Run and the navigations between them"
        />
        <section className="card p-8 text-center">
          <p className="text-sm text-slate-500">
            No navigations were recorded in this Run. The map appears once Flows replay or explore
            pages on the target.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Interaction map"
        subtitle={`${graph.nodes.length} states · ${graph.edges.length} navigations`}
      />

      <section className="card mb-6 p-5">
        <p className="text-sm text-slate-600">
          URLs that denote the same screen are clustered into one state — for example{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/product/1</code> and{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/product/2</code> both map to{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/product/:id</code>.
        </p>
      </section>

      {graph.edges.length > 0 ? (
        <section className="card p-5">
          <div className="mb-3 flex items-center gap-2">
            <GitBranch size={17} className="text-brand-600" />
            <h2 className="text-base font-semibold text-slate-900">Navigations</h2>
          </div>
          <div className="space-y-2">
            {graph.edges.map((edge, i) => (
              <div
                key={`${edge.from}-${edge.action}-${edge.to}-${i}`}
                className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-700"
              >
                <span className="font-semibold text-slate-900">{edge.from}</span>
                <span className="mx-2 text-brand-600">—({edge.action})→</span>
                <span className="font-semibold text-slate-900">{edge.to}</span>
                {edge.count > 1 && (
                  <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-slate-600">
                    ×{edge.count}
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="mb-3 text-base font-semibold text-slate-900">States</h2>
          <div className="space-y-2">
            {graph.nodes.map((node) => (
              <div
                key={node.id}
                className="rounded-lg border border-slate-100 px-3 py-2.5 font-mono text-xs text-slate-700"
              >
                <span className="font-semibold text-slate-900">{node.id}</span>
                {node.sampleUrls.length > 1 && (
                  <span className="ml-2 text-slate-500">
                    ({node.sampleUrls.length} URLs clustered)
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
