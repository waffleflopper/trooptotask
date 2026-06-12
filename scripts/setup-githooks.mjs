// Wires .githooks as the repo's hooks path on local installs.
// No-op on CI/Vercel, outside a git worktree, or when hooksPath is custom.
import { execSync } from 'node:child_process';

if (process.env.CI || process.env.VERCEL) process.exit(0);

try {
	const current = execSync('git config core.hooksPath', { stdio: ['ignore', 'pipe', 'ignore'] })
		.toString()
		.trim();
	if (current && current !== '.githooks' && !current.endsWith('/.git/hooks')) {
		process.exit(0);
	}
} catch {
	// Unset hooksPath or not a git worktree; try to set it below.
}

try {
	execSync('git config core.hooksPath .githooks', { stdio: 'ignore' });
} catch {
	// Exported tarballs and other non-git installs are allowed.
}
