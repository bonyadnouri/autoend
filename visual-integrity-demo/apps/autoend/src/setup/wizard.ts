import * as p from '@clack/prompts';
import pc from 'picocolors';
import { appendDotEnv, ensureGitignore, loadDotEnv, saveConfig } from '../config.js';
import { EFFORT_BUDGETS, type Effort } from '../run/effort.js';

/** Vendored workspace invocation — see scripts/run-autoend.sh. */
const PACKAGE = 'pnpm --filter @hack-raise/autoend exec autoend';

const EFFORT_CHOICES: Array<{ value: Effort; label: string; hint: string }> = [
  { value: 'low', label: 'low', hint: 'quick pass · ~1-2 min' },
  { value: 'mid', label: 'mid', hint: 'everyday runs · ~2-3 min' },
  { value: 'high', label: 'high', hint: 'thorough sweep · ~5 min' },
  { value: 'xhigh', label: 'xhigh', hint: 'deep exploration · ~12 min' },
  { value: 'ultra', label: 'ultra', hint: 'leave it running · ~35 min' },
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
      `${pc.dim('3.')} A report opens: watch what broke, dismiss what didn't`,
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

  const spinner = p.spinner();
  spinner.start('Writing configuration');
  await saveConfig(repoRoot, { target: target as string, effort: effort as Effort });
  const added = await ensureGitignore(repoRoot, ['.autoend/runs/', '.env']);
  spinner.stop(
    added.length > 0
      ? `Config written · .gitignore now covers ${added.join(', ')}`
      : 'Config written',
  );

  const budget = EFFORT_BUDGETS[effort as Effort];
  p.note(
    [
      `${pc.cyan(PACKAGE)}            run with your defaults`,
      `${pc.cyan(`${PACKAGE} <url>`)}      run against another target`,
      `${pc.cyan(`${PACKAGE} -e high`)}    push harder for one run`,
      '',
      pc.dim(`Defaults: ${target as string} · effort ${effort as string} (${budget.explorers} explorers, ${budget.seconds}s exploration)`),
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
