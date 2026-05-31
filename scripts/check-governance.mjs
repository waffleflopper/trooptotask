import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const baselinePath = path.join(repoRoot, 'docs/architecture/GOVERNANCE_BASELINE.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const driftLedgerPath = path.join(repoRoot, 'docs/architecture/DRIFT_LEDGER.md');
const driftLedger = readFileSync(driftLedgerPath, 'utf8');

const errors = [];
const LEGACY_AUTHORIZATION_SIGNALS = [
	{ label: 'isFullEditor', pattern: /\bisFullEditor\b/ },
	{ label: 'requireFullEditor', pattern: /\brequireFullEditor\b/ },
	{ label: 'requireEdit(', pattern: /\brequireEdit\(/ },
	{ label: 'canEdit*', pattern: /\bcanEdit[A-Z][A-Za-z0-9_]*/ },
	{ label: 'scopedGroupId', pattern: /\bscopedGroupId\b/ },
	{ label: 'scoped_group_id', pattern: /\bscoped_group_id\b/ },
	{ label: 'can_view_*', pattern: /\bcan_view_[a-z_]+\b/ },
	{ label: 'can_edit_*', pattern: /\bcan_edit_[a-z_]+\b/ },
	{ label: 'can_manage_members', pattern: /\bcan_manage_members\b/ }
];
const VALID_LEGACY_AUTHORIZATION_CLASSIFICATIONS = new Set([
	'compatibility-adapter',
	'historical-migration',
	'local-seed-fixture'
]);
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

function collectDeprecatedDemoSandboxSignals(content) {
	const signals = new Set();
	const trackedSignals = [
		'demo_mode',
		'demo_sandbox',
		'create_demo_sandbox',
		'cleanup_expired_demo_sandboxes',
		'createSandboxAuthContext',
		'createDemoRootOrgShellRequest'
	];

	for (const signal of trackedSignals) {
		if (contentHasSignal(content, signal)) {
			signals.add(signal);
		}
	}

	return [...signals];
}

function collectLegacyAuthorizationSignals(content) {
	const signals = new Set();

	for (const signal of LEGACY_AUTHORIZATION_SIGNALS) {
		if (signal.pattern.test(content)) {
			signals.add(signal.label);
		}
	}

	return [...signals];
}

function contentHasSignal(content, signal) {
	const escaped = signal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	return new RegExp(`\\b${escaped}\\b`).test(content);
}

function contentHasLegacyAuthorizationSignal(content, signal) {
	return collectLegacyAuthorizationSignals(content).includes(signal);
}

function isProductionSourceFile(filePath) {
	if (!/\.(ts|js|svelte)$/.test(filePath)) return false;
	if (/\.test\.(ts|js)$/.test(filePath)) return false;
	if (/\.svelte\.test\.ts$/.test(filePath)) return false;
	if (filePath.includes('/test-support/')) return false;
	if (filePath.includes('/test-stubs/')) return false;
	return true;
}

function legacyAuthorizationScanFiles() {
	const sourceFiles = walkRelative('src').filter(isProductionSourceFile);
	const migrationFiles = walkRelative('supabase').filter((filePath) => /\.sql$/.test(filePath));
	return [...sourceFiles, ...migrationFiles];
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

function checkDeprecatedDemoSandboxAllowlist() {
	const routeFiles = walkRelative('src/routes').filter(
		(filePath) => filePath.endsWith('.server.ts') || filePath.endsWith('/+server.ts')
	);
	const serverFiles = walkRelative('src/lib/server').filter((filePath) => {
		if (!/\.(ts|js)$/.test(filePath)) return false;
		if (/\.test\.(ts|js)$/.test(filePath)) return false;
		return true;
	});
	const sourceFiles = ['src/hooks.server.ts', ...routeFiles, ...serverFiles];
	const actualSignals = [];

	for (const filePath of sourceFiles) {
		if (!existsSync(path.join(repoRoot, filePath))) continue;
		for (const signal of collectDeprecatedDemoSandboxSignals(readRelativeFile(filePath))) {
			actualSignals.push(`${filePath}::${signal}`);
		}
	}

	const allowlistedSignals = [];
	for (const entry of baseline.deprecatedDemoSandboxAllowlist ?? []) {
		const context = `Demo/sandbox allowlist entry ${entry.path}`;
		ensureDriftIdsExist(entry.driftIds, context);

		if (!existsSync(path.join(repoRoot, entry.path))) {
			errors.push(`${context} points to a missing file`);
			continue;
		}

		const content = readRelativeFile(entry.path);
		for (const signal of entry.patterns ?? []) {
			allowlistedSignals.push(`${entry.path}::${signal}`);
			if (!contentHasSignal(content, signal)) {
				errors.push(`${context} is stale because the signal ${signal} is no longer present`);
			}
		}
	}

	const allowlistedSet = new Set(allowlistedSignals);
	const actualSet = new Set(actualSignals);

	for (const signal of actualSignals.sort()) {
		if (!allowlistedSet.has(signal)) {
			errors.push(
				`Undocumented deprecated demo/sandbox exception: ${signal}. Document it in docs/architecture/GOVERNANCE_BASELINE.json or remove the exception.`
			);
		}
	}

	for (const signal of allowlistedSignals.sort()) {
		if (!actualSet.has(signal)) {
			errors.push(`Stale deprecated demo/sandbox allowlist entry: ${signal}`);
		}
	}
}

function checkLegacyAuthorizationAllowlist() {
	const actualSignals = [];

	for (const filePath of legacyAuthorizationScanFiles()) {
		if (!existsSync(path.join(repoRoot, filePath))) continue;
		for (const signal of collectLegacyAuthorizationSignals(readRelativeFile(filePath))) {
			actualSignals.push(`${filePath}::${signal}`);
		}
	}

	const allowlistedSignals = [];

	for (const entry of baseline.legacyAuthorizationAllowlist ?? []) {
		const context = `Legacy authorization allowlist entry ${entry.path}`;
		ensureDriftIdsExist(entry.driftIds, context);

		if (!VALID_LEGACY_AUTHORIZATION_CLASSIFICATIONS.has(entry.classification)) {
			errors.push(`${context} uses unknown classification: ${entry.classification}`);
		}

		if (!entry.ownerIssue) {
			errors.push(`${context} must name the owning issue or decision point`);
		}

		if (!existsSync(path.join(repoRoot, entry.path))) {
			errors.push(`${context} points to a missing file`);
			continue;
		}

		const content = readRelativeFile(entry.path);
		for (const signal of entry.patterns ?? []) {
			allowlistedSignals.push(`${entry.path}::${signal}`);
			if (!contentHasLegacyAuthorizationSignal(content, signal)) {
				errors.push(`${context} is stale because the signal ${signal} is no longer present`);
			}
		}
	}

	const allowlistedSet = new Set(allowlistedSignals);
	const actualSet = new Set(actualSignals);

	for (const signal of actualSignals.sort()) {
		if (!allowlistedSet.has(signal)) {
			errors.push(
				`Undocumented legacy authorization entry point: ${signal}. Document it in docs/architecture/GOVERNANCE_BASELINE.json and docs/architecture/LEGACY_AUTHORIZATION_INVENTORY.md, or remove the runtime dependency.`
			);
		}
	}

	for (const signal of allowlistedSignals.sort()) {
		if (!actualSet.has(signal)) {
			errors.push(`Stale legacy authorization allowlist entry: ${signal}`);
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

ensureRequiredFiles();
checkRouteSupabaseAllowlist();
checkFeaturePermissionCouplings();
checkDeprecatedDemoSandboxAllowlist();
checkLegacyAuthorizationAllowlist();
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
console.log(`- documented demo/sandbox exception entries: ${(baseline.deprecatedDemoSandboxAllowlist ?? []).length}`);
console.log(`- documented feature permission couplings: ${baseline.featurePermissionCouplings.length}`);
console.log(`- documented legacy authorization entries: ${(baseline.legacyAuthorizationAllowlist ?? []).length}`);
