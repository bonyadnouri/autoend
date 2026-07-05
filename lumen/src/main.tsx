import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navigate, RouterProvider, createBrowserRouter } from "react-router-dom";
import "@xyflow/react/dist/style.css";
import "./index.css";
import { Layout } from "./components/Layout";
import { AnalysisProvider } from "./context/AnalysisContext";
import { AnalysisDataProvider } from "./context/AnalysisDataContext";
import { RoleProvider } from "./context/RoleContext";
import { Dashboard } from "./pages/Dashboard";
import { Exploration } from "./pages/Exploration";
import { AppMap } from "./pages/AppMap";
import { ScreenDetails } from "./pages/ScreenDetails";
import { Journeys } from "./pages/Journeys";
import { JourneyDetails } from "./pages/JourneyDetails";
import { TestScenarios } from "./pages/TestScenarios";
import { TestDetails } from "./pages/TestDetails";
// import { Insights } from "./pages/Insights";
import { IssueDetails } from "./pages/IssueDetails";
import { NotFound } from "./pages/NotFound";
import { StartAnalysis } from "./pages/StartAnalysis";
import { LiveExploration } from "./pages/LiveExploration";
import { VisualIntegrity } from "./pages/VisualIntegrity";

const router = createBrowserRouter([
  { path: "/start", element: <StartAnalysis /> },
  { path: "/exploring", element: <LiveExploration /> },
  {
    element: <Layout />,
    children: [
      { path: "/", element: <AppMap /> },
      { path: "/dashboard", element: <Dashboard /> },
      { path: "/exploration", element: <Exploration /> },
      { path: "/map", element: <Navigate to="/" replace /> },
      { path: "/screens/:id", element: <ScreenDetails /> },
      { path: "/journeys", element: <Journeys /> },
      { path: "/journeys/:id", element: <JourneyDetails /> },
      { path: "/tests", element: <TestScenarios /> },
      { path: "/tests/:id", element: <TestDetails /> },
      { path: "/insights", element: <Navigate to="/" replace /> },
      { path: "/visual-integrity", element: <VisualIntegrity /> },
      { path: "/issues/:id", element: <IssueDetails /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1 },
  },
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AnalysisProvider>
        <AnalysisDataProvider>
          <RoleProvider>
            <RouterProvider router={router} />
          </RoleProvider>
        </AnalysisDataProvider>
      </AnalysisProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
