import { evidenceUrl } from "../../data/report";

/** Retyped to accept an Evidence file name; real replay wiring lands in Task 5. */
export function ReplayPlayer({ file }: { file: string }) {
  return (
    <div className="card overflow-hidden">
      <video src={evidenceUrl(file)} controls className="aspect-video w-full bg-black" />
    </div>
  );
}
