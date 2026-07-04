import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import "./index.css";
import { Layout } from "./components/Layout";
import { Overview } from "./pages/Overview";
import { Flows } from "./pages/Flows";
import { FlowDetails } from "./pages/FlowDetails";
import { Findings } from "./pages/Findings";
import { FindingDetails } from "./pages/FindingDetails";
import { InteractionMap } from "./pages/InteractionMap";
import { NotFound } from "./pages/NotFound";
import { loadReport, ReportProvider } from "./data/report";

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Overview /> },
      { path: "/flows", element: <Flows /> },
      { path: "/flows/:id", element: <FlowDetails /> },
      { path: "/findings", element: <Findings /> },
      { path: "/findings/:id", element: <FindingDetails /> },
      { path: "/map", element: <InteractionMap /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const root = ReactDOM.createRoot(document.getElementById("root")!);

loadReport().then(
  (data) => {
    root.render(
      <React.StrictMode>
        <ReportProvider data={data}>
          <RouterProvider router={router} />
        </ReportProvider>
      </React.StrictMode>,
    );
  },
  (err) => {
    root.render(
      <div className="grid min-h-screen place-items-center p-8 text-center">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Could not load this Report</h1>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            {err instanceof Error ? err.message : String(err)}
          </p>
        </div>
      </div>,
    );
  },
);
