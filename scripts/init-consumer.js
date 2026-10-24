#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const TEMPLATE_DIR = path.resolve(__dirname, '../template');

/**
 * Scaffolds consumer repository files with customized configuration.
 * @param {object} options
 * @param {string} options.boardUrl - GitHub Project URL
 * @param {string} [options.org] - Default organization (inferred from boardUrl if omitted)
 * @param {Array<string>} [options.repos] - List of monitored repositories
 * @param {Array<string>} [options.users] - List of monitored user logins
 * @param {string} [options.outDir] - Target destination directory
 * @returns {object} Scaffolding result details
 */
export function scaffoldConsumer(options = {}) {
  const boardUrl = options.boardUrl || 'https://github.com/orgs/my-org/projects/1';
  const inferredOrg =
    options.org || (boardUrl.match(/github\.com\/(?:orgs|users)\/([^/]+)\//) || [])[1] || 'my-org';

  const repos =
    Array.isArray(options.repos) && options.repos.length > 0
      ? options.repos
      : [`${inferredOrg}/my-repo`];

  const users =
    Array.isArray(options.users) && options.users.length > 0 ? options.users : ['my-user'];

  const outDir = path.resolve(process.cwd(), options.outDir || '.');

  const distinctOrgs = new Set([
    inferredOrg,
    ...repos.map((r) => (r.includes('/') ? r.split('/')[0] : inferredOrg)),
  ]);

  const isUserBoard = boardUrl.includes('github.com/users/');
  const isMultiOrg = distinctOrgs.size > 1;

  // Create directories
  fs.mkdirSync(path.join(outDir, '.github/workflows'), { recursive: true });

  // 1. Generate rules.yml
  const templateRules = fs.readFileSync(path.join(TEMPLATE_DIR, 'rules.yml'), 'utf8');
  const customizedRules = templateRules
    .replace('https://github.com/orgs/<ORG>/projects/<NUMBER>', boardUrl)
    .replace('organization: "<ORG>"', `organization: "${inferredOrg}"`)
    .replace(
      /allowedOrgs:[^\n]*\n\s*-\s*"<ORG>"/,
      `allowedOrgs:\n${Array.from(distinctOrgs)
        .map((o) => `    - "${o}"`)
        .join('\n')}`
    )
    .replace(
      /monitored_users:[^\n]*\n\s*-\s*"<USERNAME>"/,
      `monitored_users:\n${users.map((u) => `      - ${u}`).join('\n')}`
    )
    .replace(
      /repositories:[^\n]*\n\s*-\s*"<ORG>\/<REPO>"/,
      `repositories:\n${repos.map((r) => `      - ${r.includes('/') ? r : `${inferredOrg}/${r}`}`).join('\n')}`
    );

  fs.writeFileSync(path.join(outDir, 'rules.yml'), customizedRules, 'utf8');

  // 2. Copy workflows and metadata
  fs.copyFileSync(
    path.join(TEMPLATE_DIR, '.github/workflows/sync.yml'),
    path.join(outDir, '.github/workflows/sync.yml')
  );
  fs.copyFileSync(
    path.join(TEMPLATE_DIR, '.github/workflows/validate.yml'),
    path.join(outDir, '.github/workflows/validate.yml')
  );
  fs.copyFileSync(path.join(TEMPLATE_DIR, 'README.md'), path.join(outDir, 'README.md'));
  fs.copyFileSync(path.join(TEMPLATE_DIR, '.gitignore'), path.join(outDir, '.gitignore'));

  // 3. Compute token guidance links (default to Classic PAT with project+public_repo since most users only have user-scoped PATs; also provide Fine-Grained PAT link for orgs that allow org-scoped tokens)
  const tokenType = 'classic';
  const classicTokenUrl =
    'https://github.com/settings/tokens/new?scopes=project,public_repo&description=PROJECT_SYNC_TOKEN';
  const fineGrainedTokenUrl = 'https://github.com/settings/personal-access-tokens/new';
  const tokenUrl = classicTokenUrl;

  return {
    outDir,
    boardUrl,
    inferredOrg,
    distinctOrgs: Array.from(distinctOrgs),
    isMultiOrg,
    isUserBoard,
    repos,
    users,
    tokenType,
    tokenUrl,
    classicTokenUrl,
    fineGrainedTokenUrl,
    filesCreated: [
      'rules.yml',
      '.github/workflows/sync.yml',
      '.github/workflows/validate.yml',
      'README.md',
      '.gitignore',
    ],
  };
}

async function runCli() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
  };

  let boardUrl = getArg('--board') || getArg('-b');
  let reposStr = getArg('--repos') || getArg('-r');
  let usersStr = getArg('--users') || getArg('-u');
  let org = getArg('--org') || getArg('-o');
  let outDir = getArg('--out') || '.';
  const isNonInteractive = args.includes('--non-interactive') || !process.stdin.isTTY;

  if (!isNonInteractive) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      if (!boardUrl) {
        boardUrl = await rl.question('GitHub Project Board URL: ');
      }
      if (!org && boardUrl) {
        const match = boardUrl.match(/github\.com\/(?:orgs|users)\/([^/]+)\//);
        if (match) org = match[1];
      }
      if (!reposStr) {
        reposStr = await rl.question(
          'Monitored repositories (comma-separated, e.g. org/repo1,org/repo2): '
        );
      }
      if (!usersStr) {
        usersStr = await rl.question('Monitored users (comma-separated, e.g. user1,user2): ');
      }
    } finally {
      rl.close();
    }
  }

  const repos = reposStr
    ? reposStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const users = usersStr
    ? usersStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const result = scaffoldConsumer({
    boardUrl: boardUrl || undefined,
    org: org || undefined,
    repos: repos.length ? repos : undefined,
    users: users.length ? users : undefined,
    outDir,
  });

  console.log('\n✔ Consumer repository scaffolded successfully:');
  for (const file of result.filesCreated) {
    console.log(`  - ${file}`);
  }

  console.log('\n--- 🔑 Authentication Setup ---');
  if (result.isUserBoard) {
    console.log(
      'Setup targets a user-owned board (fine-grained tokens do not support user boards):'
    );
    console.log(
      'Use a Classic PAT with project and public_repo scopes (or repo for private repos):'
    );
    console.log(`--> ${result.tokenUrl}`);
  } else {
    console.log(
      'Most users only have user-scoped PATs (organizations often block org-scoped tokens and GitHub Apps).'
    );
    console.log(
      `\nOption A (Default) — User-scoped PAT only (most users, or if "${result.inferredOrg}" blocks org-scoped tokens):`
    );
    console.log(
      'Use a Classic PAT with project and public_repo scopes (or project and repo for private repos):'
    );
    console.log(`--> ${result.classicTokenUrl}`);
    console.log(
      `\nOption B — If "${result.inferredOrg}" allows org-scoped Fine-Grained PATs (single-org, or public cross-org items; private cross-org additions require Option A with project and repo):`
    );
    console.log(`--> ${result.fineGrainedTokenUrl}`);
    console.log(
      'Permissions: Organization > Projects: Read & Write, Repository > Issues & PRs: Read & Write'
    );
  }

  console.log('\nSave your token as repository secret "PROJECT_SYNC_TOKEN" in your consumer repo:');
  console.log('https://github.com/<OWNER>/<CONSUMER_REPO>/settings/secrets/actions/new');
  console.log('\nNext steps:');
  console.log('1. Commit and push these files to your repository default branch (main).');
  console.log('2. Run dry-run verification: gh workflow run sync.yml -f dry_run=true');
}

if (process.argv[1] && process.argv[1].endsWith('init-consumer.js')) {
  runCli().catch((err) => {
    console.error('Scaffolding failed:', err.message);
    process.exit(1);
  });
}
