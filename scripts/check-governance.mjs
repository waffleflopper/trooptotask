import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const baselinePath = path.join(repoRoot, 'docs/architecture/GOVERNANCE_BASELINE.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const driftLedgerPath = path.join(repoRoot, 'docs/architecture/DRIFT_LEDGER.md');
const driftLedger = readFileSync(driftLedgerPath, 'utf8');

const errors = [];

function normalizePath(filePath) {
	return filePath.split(path.sep).join('/');
}

function readRelativeFile(relativePath) {
	return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function walkRelative(dir) {
	const start = path.join(repoRoot, dir);
	if (!existsSync(start)) return [];

	const files = [];

	for (const entry of readdirSync(start)) {
		const absolutePath = path.join(start, entry);
		const stat = statSync(absolutePath);
		if (stat.isDirectory()) {
			files.push(...walkRelative(path.join(dir, entry)));
			continue;
		}
		files.push(normalizePath(path.relative(repoRoot, absolutePath)));
	}

	return files;
}

function hasFeatureFamilyMatch(filePath, feature) {
	if (feature === 'critical-tasks') {
		const baseName = path.basename(filePath);
		return (
			filePath.includes('/critical-tasks/') ||
			/Ict/.test(filePath) ||
			baseName.startsWith('ict') ||
			/(^|[/-])ict([/.-]|$)/i.test(filePath)
		);
	}

	if (feature === 'rating-scheme') {
		return filePath.includes('/rating-scheme/') || /ratingScheme/.test(path.basename(filePath));
	}

	return false;
}

function collectPermissionPatterns(content) {
	const matches = new Set();
	const pattern = /permission:\s*'([^']+)'|require(Edit|View)\('([^']+)'\)/g;
	const featureLanes = new Set(['calendar', 'personnel', 'training', 'onboarding', 'leaders-book']);

	for (const match of content.matchAll(pattern)) {
		if (match[1]) {
			if (!featureLanes.has(match[1])) continue;
			matches.add(`permission: '${match[1]}'`);
			continue;
		}

		if (match[2] && match[3]) {
			if (!featureLanes.has(match[3])) continue;
			matches.add(`require${match[2]}('${match[3]}')`);
		}
	}

	return [...matches];
}

function ensureRequiredFiles() {
	for (const relativePath of baseline.requiredFiles) {
		if (!existsSync(path.join(repoRoot, relativePath))) {
			errors.push(`Missing required governance file: ${relativePath}`);
		}
	}
}

function ensureDriftIdsExist(ids, contextLabel) {
	for (const driftId of ids ?? []) {
		if (!driftLedger.includes(`## ${driftId} `)) {
			errors.push(`${contextLabel} references missing drift ID: ${driftId}`);
		}
	}
}

function checkRouteSupabaseAllowlist() {
	const routeFiles = walkRelative('src/routes').filter(
		(filePath) => filePath.endsWith('.server.ts') || filePath.endsWith('/+server.ts')
	);
	const actualUsages = routeFiles.filter((filePath) => readRelativeFile(filePath).includes('locals.supabase'));
	const allowlistedPaths = baseline.routeSupabaseAllowlist.map((entry) => entry.path).sort();
	const actualPaths = [...actualUsages].sort();
	const allowlistedSet = new Set(allowlistedPaths);

	for (const entry of baseline.routeSupabaseAllowlist) {
		const context = `Route allowlist entry ${entry.path}`;
		ensureDriftIdsExist(entry.driftIds, context);

		if (!existsSync(path.join(repoRoot, entry.path))) {
			errors.push(`${context} points to a missing file`);
			continue;
		}

		if (!readRelativeFile(entry.path).includes('locals.supabase')) {
			errors.push(`${context} is stale because the file no longer uses locals.supabase`);
		}
	}

	for (const filePath of actualPaths) {
		if (!allowlistedSet.has(filePath)) {
			errors.push(
				`Undocumented route-level locals.supabase usage: ${filePath}. Add a documented exception or move the logic behind an adapter/use case.`
			);
		}
	}

	for (const filePath of allowlistedPaths) {
		if (!actualPaths.includes(filePath)) {
			errors.push(`Stale route-level locals.supabase allowlist entry: ${filePath}`);
		}
	}
}

function checkFeaturePermissionCouplings() {
	const sourceFiles = walkRelative('src').filter((filePath) => {
		if (!/\.(ts|js|svelte)$/.test(filePath)) return false;
		if (/\.test\.(ts|js)$/.test(filePath)) return false;
		return true;
	});

	const byFeature = new Map();
	for (const entry of baseline.featurePermissionCouplings) {
		const featureEntries = byFeature.get(entry.feature) ?? [];
		featureEntries.push(entry);
		byFeature.set(entry.feature, featureEntries);

		const context = `Permission coupling allowlist entry ${entry.path} -> ${entry.pattern}`;
		ensureDriftIdsExist(entry.driftIds, context);

		if (!existsSync(path.join(repoRoot, entry.path))) {
			errors.push(`${context} points to a missing file`);
			continue;
		}

		if (!readRelativeFile(entry.path).includes(entry.pattern)) {
			errors.push(`${context} is stale because the pattern is no longer present`);
		}
	}

	for (const [feature, entries] of byFeature.entries()) {
		const allowlistedPatterns = new Set(entries.map((entry) => `${entry.path}::${entry.pattern}`));
		const featureFiles = sourceFiles.filter((filePath) => hasFeatureFamilyMatch(filePath, feature));

		for (const filePath of featureFiles) {
			const patterns = collectPermissionPatterns(readRelativeFile(filePath));
			for (const patternText of patterns) {
				const key = `${filePath}::${patternText}`;
				if (!allowlistedPatterns.has(key)) {
					errors.push(
						`Undocumented ${feature} permission coupling: ${filePath} -> ${patternText}. Document it or remove the coupling.`
					);
				}
			}
		}

		for (const entry of entries) {
			if (!featureFiles.includes(entry.path)) {
				errors.push(`Permission coupling allowlist entry no longer matches the ${feature} file family: ${entry.path}`);
			}
		}
	}
}

ensureRequiredFiles();
checkRouteSupabaseAllowlist();
checkFeaturePermissionCouplings();

if (errors.length > 0) {
	console.error('Governance check failed:\n');
	for (const issue of errors) {
		console.error(`- ${issue}`);
	}
	process.exit(1);
}

console.log('Governance checks passed.');
console.log(`- required files: ${baseline.requiredFiles.length}`);
console.log(`- route-level locals.supabase allowlist entries: ${baseline.routeSupabaseAllowlist.length}`);
console.log(`- documented feature permission couplings: ${baseline.featurePermissionCouplings.length}`);
