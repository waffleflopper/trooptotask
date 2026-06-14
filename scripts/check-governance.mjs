import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const baselinePath = path.join(repoRoot, 'docs/architecture/GOVERNANCE_BASELINE.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const driftLedgerPath = path.join(repoRoot, 'docs/architecture/DRIFT_LEDGER.md');
const driftLedger = readFileSync(driftLedgerPath, 'utf8');

const errors = [];
const DELETED_ROUTE_AUTHORIZATION_SYMBOLS = [
	'LegacyRoutePermission',
	'enforceLegacyRoutePermission',
	'shouldRunLegacyReadOnlyGuard',
	'deferPolicyToUseCase',
	'requireView',
	'requirePrivileged',
	'requireOwner',
	'requireManageMembers'
];

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
	const featureLanes = new Set(['calendar', 'personnel', 'training', 'onboarding']);

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

function isProductionSourceFile(filePath) {
	if (!/\.(ts|js|svelte)$/.test(filePath)) return false;
	if (/\.test\.(ts|js)$/.test(filePath)) return false;
	if (/\.svelte\.test\.ts$/.test(filePath)) return false;
	if (filePath.includes('/test-support/')) return false;
	if (filePath.includes('/test-stubs/')) return false;
	return true;
}

function legacyRouteAuthorizationScanFiles() {
	const routeFiles = walkRelative('src/routes').filter(isProductionSourceFile);
	const serverFiles = [
		'src/lib/server/core/ports.ts',
		...walkRelative('src/lib/server/core/useCases').filter(isProductionSourceFile),
		'src/lib/server/adapters/httpAdapter.ts',
		'src/lib/server/adapters/supabaseAuthContext.ts',
		'src/lib/server/adapters/inMemory.ts',
		'src/lib/server/permissionContext.ts',
		'src/lib/server/entitySchema.ts',
		...walkRelative('src/lib/server/entities').filter(isProductionSourceFile)
	];
	return [...new Set([...routeFiles, ...serverFiles])];
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

function collectSupabasePropertyBindings(properties) {
	const bindings = new Set();

	for (const property of properties.split(',')) {
		const trimmed = property.trim();
		if (!trimmed) continue;

		const aliasMatch = trimmed.match(/^supabase\s*:\s*([A-Za-z_$][\w$]*)\b/);
		if (aliasMatch) {
			bindings.add(aliasMatch[1]);
			continue;
		}

		if (/^supabase(?:\s*=|\s*$)/.test(trimmed)) {
			bindings.add('supabase');
		}
	}

	return bindings;
}

function collectDestructuredLocalSupabaseBindings(content) {
	const bindings = new Set();
	const destructuringPattern =
		/\b(?:const|let|var)\s*\{(?<properties>[^}]*\bsupabase\b[^}]*)\}\s*=\s*(?:[A-Za-z_$][\w$]*\.)?locals\b/g;
	const nestedLocalsPattern = /\blocals\s*:\s*\{(?<properties>[^}]*\bsupabase\b[^}]*)\}/g;

	for (const match of content.matchAll(destructuringPattern)) {
		for (const binding of collectSupabasePropertyBindings(match.groups.properties)) {
			bindings.add(binding);
		}
	}

	for (const match of content.matchAll(nestedLocalsPattern)) {
		for (const binding of collectSupabasePropertyBindings(match.groups.properties)) {
			bindings.add(binding);
		}
	}

	return bindings;
}

function hasRouteSupabaseUsage(content) {
	if (content.includes('locals.supabase')) return true;

	const bindings = collectDestructuredLocalSupabaseBindings(content);
	if (bindings.size === 0) return false;

	for (const binding of bindings) {
		const usagePattern = new RegExp(`\\b${binding}\\s*(?:\\.\\s*(?:from|rpc|auth|storage)\\b)`);
		if (usagePattern.test(content)) return true;
	}

	return false;
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function collectAdminContextBindings(content) {
	const bindings = new Set();

	if (!/\b(?:loadWithAdminContext|adminAction|adminHandle)\s*\(/.test(content)) return bindings;

	const fnPatterns = [
		/\bfn\s*:\s*(?:async\s*)?\(\s*([A-Za-z_$][\w$]*)\b/g,
		/\bfn\s*:\s*(?:async\s*)?([A-Za-z_$][\w$]*)\s*=>/g
	];

	for (const pattern of fnPatterns) {
		for (const match of content.matchAll(pattern)) {
			bindings.add(match[1]);
		}
	}

	return bindings;
}

function hasAdminContextClientUsage(content) {
	for (const binding of collectAdminContextBindings(content)) {
		const escapedBinding = escapeRegExp(binding);
		if (new RegExp(`\\b${escapedBinding}\\s*\\.\\s*adminClient\\b`).test(content)) return true;
		if (new RegExp(`\\bconst\\s*\\{[^}]*\\badminClient\\b[^}]*\\}\\s*=\\s*${escapedBinding}\\b`).test(content)) {
			return true;
		}
	}

	return false;
}

function hasAdminContextAdapterFactoryUsage(content) {
	for (const binding of collectAdminContextBindings(content)) {
		const escapedBinding = escapeRegExp(binding);
		if (new RegExp(`\\bcreateSupabase[A-Za-z0-9_$]*\\s*\\(\\s*${escapedBinding}\\b`).test(content)) {
			return true;
		}
	}

	return false;
}

function hasRouteAdminProviderUsage(content) {
	return (
		/\bgetAdminClient\s*\(/.test(content) ||
		/\bctx\s*\.\s*adminClient\b/.test(content) ||
		/\bconst\s*\{[^}]*\badminClient\b[^}]*\}\s*=\s*ctx\b/.test(content) ||
		hasAdminContextClientUsage(content) ||
		hasAdminContextAdapterFactoryUsage(content)
	);
}

function checkRouteSupabaseAllowlist() {
	const routeFiles = walkRelative('src/routes').filter(
		(filePath) => filePath.endsWith('.server.ts') || filePath.endsWith('/+server.ts')
	);
	const actualUsages = routeFiles.filter((filePath) => hasRouteSupabaseUsage(readRelativeFile(filePath)));
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

		if (!hasRouteSupabaseUsage(readRelativeFile(entry.path))) {
			errors.push(`${context} is stale because the file no longer uses route-level Supabase`);
		}
	}

	for (const filePath of actualPaths) {
		if (!allowlistedSet.has(filePath)) {
			errors.push(
				`Undocumented route-level Supabase usage: ${filePath}. Add a documented exception or move the logic behind an adapter/use case.`
			);
		}
	}

	for (const filePath of allowlistedPaths) {
		if (!actualPaths.includes(filePath)) {
			errors.push(`Stale route-level locals.supabase allowlist entry: ${filePath}`);
		}
	}
}

function checkRouteAdminProviderAllowlist() {
	const routeFiles = walkRelative('src/routes').filter(
		(filePath) => filePath.endsWith('.server.ts') || filePath.endsWith('/+server.ts')
	);
	const actualUsages = routeFiles.filter((filePath) => hasRouteAdminProviderUsage(readRelativeFile(filePath)));
	const allowlist = baseline.routeAdminProviderAllowlist ?? [];
	const allowlistedPaths = allowlist.map((entry) => entry.path).sort();
	const actualPaths = [...actualUsages].sort();
	const allowlistedSet = new Set(allowlistedPaths);

	for (const entry of allowlist) {
		const context = `Route admin-provider allowlist entry ${entry.path}`;
		ensureDriftIdsExist(entry.driftIds, context);

		if (!existsSync(path.join(repoRoot, entry.path))) {
			errors.push(`${context} points to a missing file`);
			continue;
		}

		if (!hasRouteAdminProviderUsage(readRelativeFile(entry.path))) {
			errors.push(`${context} is stale because the file no longer uses route-level admin-provider wiring`);
		}
	}

	for (const filePath of actualPaths) {
		if (!allowlistedSet.has(filePath)) {
			errors.push(
				`Undocumented route-level admin-provider usage: ${filePath}. Add a documented exception or move the logic behind an adapter/use case.`
			);
		}
	}

	for (const filePath of allowlistedPaths) {
		if (!actualPaths.includes(filePath)) {
			errors.push(`Stale route-level admin-provider allowlist entry: ${filePath}`);
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

function checkDeletedRouteAuthorizationFramework() {
	const deletedSymbolPattern = new RegExp(`\\b(${DELETED_ROUTE_AUTHORIZATION_SYMBOLS.join('|')})\\b`);
	const routePermissionPattern =
		/permission:\s*'(calendar|personnel|training|critical-tasks|onboarding|rating-scheme|privileged|owner|manageMembers|none)'/;

	for (const filePath of legacyRouteAuthorizationScanFiles()) {
		if (!existsSync(path.join(repoRoot, filePath))) continue;

		const content = readRelativeFile(filePath);
		const deletedSymbol = content.match(deletedSymbolPattern)?.[1];
		if (deletedSymbol) {
			errors.push(
				`Deleted route authorization symbol still present: ${filePath} -> ${deletedSymbol}. Use policyAction and Policy Decision authorization instead.`
			);
		}

		const routePermission = content.match(routePermissionPattern)?.[0];
		if (routePermission) {
			errors.push(
				`Deleted route/load permission config still present: ${filePath} -> ${routePermission}. Use policyAction and policyResource instead.`
			);
		}
	}
}

function runGovernanceChecks() {
	ensureRequiredFiles();
	checkRouteSupabaseAllowlist();
	checkRouteAdminProviderAllowlist();
	checkFeaturePermissionCouplings();
	checkDeletedRouteAuthorizationFramework();

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
	console.log(`- route-level admin-provider allowlist entries: ${(baseline.routeAdminProviderAllowlist ?? []).length}`);
	console.log(`- documented feature permission couplings: ${baseline.featurePermissionCouplings.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	runGovernanceChecks();
}

export {
	collectDestructuredLocalSupabaseBindings,
	hasRouteAdminProviderUsage,
	hasRouteSupabaseUsage,
	runGovernanceChecks
};
