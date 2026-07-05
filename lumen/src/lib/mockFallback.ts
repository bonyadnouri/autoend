import {
  appSummary,
  explorationLog,
  explorationScreenOrder,
  insights,
  issues,
  journeys,
  screenEdges,
  screens,
  tests,
} from "../data/mockData";
import { investigations } from "../data/investigations";
import { DEFAULT_ANALYSIS_ID } from "../lib/constants";
import type { AnalysisBundle } from "../lib/api";

export const mockAnalysisBundle: AnalysisBundle = {
  analysisId: DEFAULT_ANALYSIS_ID,
  appSummary,
  explorationLog,
  explorationScreenOrder,
  screens,
  screenEdges,
  journeys,
  tests,
  issues,
  insights,
};

export const mockInvestigations = investigations;
