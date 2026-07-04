/**
 * Personas (CONTEXT.md, ADR-0007): fixed archetype axes guarantee the fleet's
 * diversity; the Recon agent instantiates each with product-specific Missions.
 * A Persona holds a browser and its Mission brief — never the repo or the
 * filesystem (the capability boundary of ADR-0007).
 */

export const ARCHETYPES = [
  'naive-newcomer',
  'task-driven-professional',
  'domain-power-user',
  'adversarial-prober',
  'accessibility-minded',
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

export function isArchetype(value: string): value is Archetype {
  return (ARCHETYPES as readonly string[]).includes(value);
}

/** A Mission (CONTEXT.md): a non-overlapping assignment Recon gives one Persona. */
export interface MissionSpec {
  archetype: Archetype;
  /** What the Persona is trying to accomplish, in the product's own terms. */
  goal: string;
  /** The surface of the Target this Mission owns. */
  surface: string;
  /** Concrete bug hypotheses worth probing on that surface. */
  hypotheses: string[];
}

/** How each archetype behaves in the browser — the voice of its prompt. */
export const ARCHETYPE_PROFILES: Record<Archetype, string> = {
  'naive-newcomer':
    'You have never seen this product before. You follow the paths the UI visibly offers, read labels literally, and get lost easily. You notice broken onboarding, misleading copy, dead ends, and anything a first-time visitor would find confusing or broken.',
  'task-driven-professional':
    'Your job requires you to get something specific done with this product today. You take the shortest sensible path through core workflows with realistic data, and you notice anything that blocks, slows, or silently corrupts the task you came to do.',
  'domain-power-user':
    'You know this product category deeply and use its advanced surface: settings, bulk operations, filters, keyboard shortcuts, and feature combinations real experts chain together. You notice when advanced behavior is subtly wrong — wrong numbers, stale state, options that do nothing.',
  'adversarial-prober':
    'You are curious about what breaks. You use legitimate but unusual input: boundary values, rapid repeats, double submits, browser back/forward mid-flow, page refreshes at awkward moments, empty states. You never do anything truly destructive.',
  'accessibility-minded':
    'You navigate primarily with the keyboard. You follow tab order, watch focus management, read labels and roles, and verify each flow is completable without a mouse. You notice traps, skipped controls, and unlabeled interactive elements.',
};

/**
 * Fallback Missions keep the deep path alive when Recon produced no usable
 * brief — generic by necessity, so a Run without a brief is a worse Run, not
 * a dead one.
 */
const FALLBACK_MISSIONS: Record<Archetype, MissionSpec> = {
  'naive-newcomer': {
    archetype: 'naive-newcomer',
    goal: 'Arrive with no context and accomplish whatever the landing page invites you to do',
    surface: 'landing page and the primary visible journey',
    hypotheses: ['the advertised primary action does not complete', 'labels promise something the page does not deliver'],
  },
  'task-driven-professional': {
    archetype: 'task-driven-professional',
    goal: 'Complete the core end-to-end workflow this product exists for, with realistic data',
    surface: 'the main workflow: forms, submissions, and their results',
    hypotheses: ['a submitted value does not appear where it should', 'a multi-step flow loses state between steps'],
  },
  'domain-power-user': {
    archetype: 'domain-power-user',
    goal: 'Exercise the advanced surface: settings, sorting, filtering, and feature combinations',
    surface: 'settings pages, list controls, and secondary features',
    hypotheses: ['sorting or filtering produces wrongly ordered or wrongly filtered results', 'a setting change has no effect'],
  },
  'adversarial-prober': {
    archetype: 'adversarial-prober',
    goal: 'Probe edge behavior with legitimate but unusual usage',
    surface: 'every form and stateful interaction you can reach',
    hypotheses: ['repeating an action twice corrupts state', 'browser back/forward desynchronizes the UI'],
  },
  'accessibility-minded': {
    archetype: 'accessibility-minded',
    goal: 'Complete the primary journey using only the keyboard',
    surface: 'the primary journey, its forms and interactive controls',
    hypotheses: ['an interactive control is unreachable by keyboard', 'focus is lost after a dynamic update'],
  },
};

export interface PersonaAssignment {
  archetype: Archetype;
  mission: MissionSpec;
}

/**
 * Deal `count` Personas from the brief's Missions: archetypes round-robin (so
 * diversity survives any fleet size), each taking the next unused brief
 * Mission for its archetype, falling back to the generic Mission when the
 * brief has none left. Pure — exported for tests.
 */
export function assignMissions(missions: MissionSpec[] | undefined, count: number): PersonaAssignment[] {
  const pools = new Map<Archetype, MissionSpec[]>();
  for (const mission of missions ?? []) {
    if (!isArchetype(mission.archetype)) continue;
    const pool = pools.get(mission.archetype) ?? [];
    pool.push(mission);
    pools.set(mission.archetype, pool);
  }
  const assignments: PersonaAssignment[] = [];
  for (let i = 0; i < count; i++) {
    const archetype = ARCHETYPES[i % ARCHETYPES.length];
    const mission = pools.get(archetype)?.shift() ?? FALLBACK_MISSIONS[archetype];
    assignments.push({ archetype, mission });
  }
  return assignments;
}
