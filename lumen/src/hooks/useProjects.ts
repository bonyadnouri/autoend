import { useQuery } from "@tanstack/react-query";
import { fetchProjects, type ProjectRow } from "../lib/api";
import { isSupabaseConfigured } from "../lib/supabase";

/** All analyzed projects (most recent first) for the project switcher. */
export function useProjects() {
  return useQuery<ProjectRow[]>({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    enabled: isSupabaseConfigured,
    staleTime: 15_000,
  });
}
