import { Link } from "react-router-dom";
import { Compass } from "lucide-react";

export function NotFound() {
  return (
    <div className="grid place-items-center py-24 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-xl bg-slate-100 text-slate-500">
        <Compass size={26} />
      </span>
      <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-1 text-sm text-slate-500">
        This page is not part of the Report.
      </p>
      <Link to="/" className="btn-primary mt-6">
        Back to Overview
      </Link>
    </div>
  );
}
