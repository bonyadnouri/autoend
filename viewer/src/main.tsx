import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createHashRouter } from "react-router-dom";
import "./index.css";
import { Layout } from "./components/Layout";
import { Dashboard } from "./pages/Dashboard";
import { Journeys } from "./pages/Journeys";
import { JourneyDetails } from "./pages/JourneyDetails";
import { TestDetails } from "./pages/TestDetails";
import { IssueDetails } from "./pages/IssueDetails";
import { NotFound } from "./pages/NotFound";

const router = createHashRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Dashboard /> },
      { path: "/journeys", element: <Journeys /> },
      { path: "/journeys/:id", element: <JourneyDetails /> },
      { path: "/tests/:id", element: <TestDetails /> },
      { path: "/issues/:id", element: <IssueDetails /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
