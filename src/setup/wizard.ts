import * as p from '@clack/prompts';
import pc from 'picocolors';
import { appendDotEnv, ensureGitignore, loadDotEnv, saveConfig } from '../config.js';
import { EFFORT_PIPELINES, type Effort } from '../run/effort.js';

/** How users must invoke us via npx — bare "autoend" is npm-blocked (see README). */
const PACKAGE = '@bonyadnouri/autoend';

const EFFORT_CHOICES: Array<{ value: Effort; label: string; hint: string }> = [
  { value: 'low', label: 'low', hint: 'quick smoke pass · ~1-2 min' },
  { value: 'mid', label: 'mid', hint: 'everyday smoke runs · ~2-3 min' },
  { value: 'high', label: 'high', hint: 'deep: recon + personas + verify + triage · ~15 min' },
  { value: 'xhigh', label: 'xhigh', hint: 'deep, two lead-seeded waves · ~25 min' },
  { value: 'ultra', label: 'ultra', hint: 'full-depth bug hunt · ~45-60 min' },
];

/** `autoend init` — the guided setup. Writes .autoend/config.json and .env. */
export async function runSetupWizard(repoRoot: string): Promise<void> {
  console.clear();
  p.intro(`${pc.bgCyan(pc.black(' autoend '))} ${pc.dim('agent-powered end-to-end testing')}`);

  p.note(
    [
      'Agents test your app and hand you a video-backed report.',
      '',
      `${pc.dim('1.')} Known flows are replayed — fast, deterministic`,
      `${pc.dim('2.')} Agents explore new surface within your effort budget`,
      `${pc.dim('3.')} Results publish to your dashboard: watch what broke, with video`,
    ].join('\n'),
    'How it works',
  );

  const target = await p.text({
    message: 'Where does your app run?',
    placeholder: 'http://localhost:3000',
    initialValue: 'http://localhost:3000',
    validate: (value) => {
      try {
        new URL(value ?? '');
        return undefined;
      } catch {
        return 'Enter a full URL, e.g. http://localhost:3000';
      }
    },
  });
  bail(target);

  const effort = await p.select<Effort>({
    message: 'How hard should a Run test by default?',
    options: EFFORT_CHOICES,
    initialValue: 'mid',
  });
  bail(effort);

  await loadDotEnv(repoRoot);
  if (process.env.CURSOR_API_KEY) {
    p.log.success('Cursor API key found — agents are ready to think.');
  } else {
    const key = await p.password({
      message: `Cursor API key ${pc.dim('(cursor.com → Dashboard → API Keys)')}`,
      validate: (value) => ((value ?? '').trim().length > 0 ? undefined : 'Required — agents run on your Cursor account'),
    });
    bail(key);
    await appendDotEnv(repoRoot, 'CURSOR_API_KEY', (key as string).trim());
    p.log.success('Saved to .env');
  }

  // Publishing is optional: with Supabase configured, Runs publish results to
  // the Lumen dashboard; without it they stay local and publish.ts skips with
  // a warning. Only missing vars are prompted — appendDotEnv appends lines,
  // and loadDotEnv gives the FIRST occurrence precedence, so re-writing an
  // existing var would add a dead line.
  let publishing = false;
  const hasSupabaseKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY);
  if (process.env.SUPABASE_URL && hasSupabaseKey) {
    publishing = true;
    p.log.success('Supabase configured — Runs will publish to your dashboard.');
  } else {
    let url = process.env.SUPABASE_URL;
    if (!url) {
      const answer = await p.text({
        message: `Supabase URL ${pc.dim('(supabase.com → Project Settings → API · Enter to skip publishing)')}`,
        placeholder: 'https://your-project.supabase.co',
        defaultValue: '',
        validate: (value) => {
          const v = (value ?? '').trim();
          if (v.length === 0) return undefined; // empty = skip publishing
          try {
            new URL(v);
            return undefined;
          } catch {
            return 'Enter a full URL, e.g. https://your-project.supabase.co';
          }
        },
      });
      bail(answer);
      url = (answer as string).trim();
      if (url) await appendDotEnv(repoRoot, 'SUPABASE_URL', url);
    }

    if (!url) {
      p.log.info('Publishing skipped — Runs stay local. Rerun init (or edit .env) to enable it later.');
    } else if (hasSupabaseKey) {
      publishing = true;
      p.log.success('Saved to .env — Runs will publish to your dashboard.');
    } else {
      const keyName = await p.select<'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'>({
        message: 'Which Supabase key will you paste?',
        options: [
          { value: 'SUPABASE_ANON_KEY', label: 'anon / publishable (recommended)', hint: 'tables + evidence upload, once migration 002 is applied' },
          { value: 'SUPABASE_SERVICE_ROLE_KEY', label: 'service-role', hint: 'also works; higher blast radius if leaked' },
        ],
        initialValue: 'SUPABASE_ANON_KEY',
      });
      bail(keyName);
      const key = await p.password({
        message: `Supabase key ${pc.dim('(Project Settings → API — never commit it)')}`,
        validate: (value) => ((value ?? '').trim().length > 0 ? undefined : 'Required to publish — or rerun init and skip the URL'),
      });
      bail(key);
      await appendDotEnv(repoRoot, keyName as string, (key as string).trim());
      publishing = true;
      p.log.success('Saved to .env — Runs will publish to your dashboard.');
    }
  }

  const spinner = p.spinner();
  spinner.start('Writing configuration');
  await saveConfig(repoRoot, { target: target as string, effort: effort as Effort });
  const added = await ensureGitignore(repoRoot, ['.autoend/runs/', '.env']);
  spinner.stop(
    added.length > 0
      ? `Config written · .gitignore now covers ${added.join(', ')}`
      : 'Config written',
  );

  const budget = EFFORT_PIPELINES[effort as Effort];
  p.note(
    [
      `${pc.cyan(`npx ${PACKAGE}`)}            run with your defaults`,
      `${pc.cyan(`npx ${PACKAGE} <url>`)}      run against another target`,
      `${pc.cyan(`npx ${PACKAGE} -e high`)}    push harder for one run`,
      '',
      pc.dim(`Defaults: ${target as string} · effort ${effort as string} (${budget.explorers} explorers, ${budget.seconds}s exploration)`),
      pc.dim(`Publishing: ${publishing ? 'on — results appear in your dashboard' : 'off — Runs stay local'}`),
      pc.dim(`Commit ${pc.reset(pc.dim('.autoend/flows/'))} — it is your team's shared baseline.`),
    ].join('\n'),
    'You are set',
  );
  p.outro('First run discovers your flows. Every run after that guards them.');
}

function bail(value: unknown): void {
  if (p.isCancel(value)) {
    p.cancel('Setup aborted — nothing was written.');
    process.exit(0);
  }
}
