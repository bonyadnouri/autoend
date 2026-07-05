export interface DemoTarget {
  label: string;
  url: string;
  rulePack: string;
  slug: string;
  status: "pass" | "fail";
  violations: string[];
}

export const DEMO_SITES: DemoTarget[] = [
  {
    label: "NASA",
    url: "https://www.nasa.gov/",
    rulePack: "uswds-federal",
    slug: "www-nasa-gov",
    status: "fail",
    violations: ["USWDS-BANNER-001"],
  },
  {
    label: "Gouvernement.fr",
    url: "https://www.gouvernement.fr/",
    rulePack: "dsfr-france",
    slug: "www-gouvernement-fr",
    status: "fail",
    violations: ["DSFR-HEADER-001"],
  },
  {
    label: "Ameli.fr",
    url: "https://www.ameli.fr/",
    rulePack: "dsfr-france",
    slug: "www-ameli-fr",
    status: "fail",
    violations: ["DSFR-HEADER-001"],
  },
];

const HOST_TO_TARGET = new Map<string, DemoTarget>(
  DEMO_SITES.flatMap((site) => {
    const host = new URL(site.url).hostname.replace(/^www\./, "");
    return [
      [host, site],
      [`www.${host}`, site],
    ];
  }),
);

export function normalizeHostname(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function resolveDemoTarget(input: string): DemoTarget | null {
  const hostname = normalizeHostname(input);
  if (!hostname) return null;
  return HOST_TO_TARGET.get(hostname) ?? HOST_TO_TARGET.get(hostname.replace(/^www\./, "")) ?? null;
}

export const ANALYSIS_STEPS = [
  "Capturing page at 1280×720…",
  "Evaluating design-standard rules…",
  "Computing pixel diff…",
  "Building forensic report…",
] as const;

export const STEP_MS = 600;
