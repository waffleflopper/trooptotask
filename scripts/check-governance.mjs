import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runModuleGovernance } from './module-governance.ts';

const repoRoot = process.cwd();

const errors = [];
const FEATURE_PERMISSION_FAMILIES = [
	{
		feature: 'critical-tasks',
		foreignPermissionLanes: ['calendar', 'personnel', 'training', 'onboarding', 'ratingScheme']
	},
	{
		feature: 'rating-scheme',
		foreignPermissionLanes: ['calendar', 'personnel', 'training', 'onboarding', 'criticalTasks']
	}
];
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
	if (lstatSync(start).isSymbolicLink()) throw new Error(`Unsupported source symlink: ${normalizePath(dir)}`);

	const files = [];

	for (const entry of readdirSync(start)) {
		const absolutePath = path.join(start, entry);
		const stat = lstatSync(absolutePath);
		if (stat.isSymbolicLink()) {
			throw new Error(`Unsupported source symlink: ${normalizePath(path.relative(repoRoot, absolutePath))}`);
		}
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
	const policyActionPattern =
		/\bPOLICY_ACTION_CATALOG\s*\.\s*(calendar|personnel|training|onboarding|criticalTasks|ratingScheme)\s*\.\s*([A-Za-z_$][\w$]*)/g;
	const legacyPattern = /permission:\s*'([^']+)'|require(Edit|View)\('([^']+)'\)/g;
	const legacyFeatureLanes = new Set(['calendar', 'personnel', 'training', 'onboarding']);

	for (const match of content.matchAll(policyActionPattern)) {
		matches.add(`POLICY_ACTION_CATALOG.${match[1]}.${match[2]}`);
	}

	for (const match of content.matchAll(legacyPattern)) {
		if (match[1]) {
			if (!legacyFeatureLanes.has(match[1])) continue;
			matches.add(`permission: '${match[1]}'`);
			continue;
		}

		if (match[2] && match[3]) {
			if (!legacyFeatureLanes.has(match[3])) continue;
			matches.add(`require${match[2]}('${match[3]}')`);
		}
	}

	return [...matches].sort();
}

function getPermissionPatternLane(patternText) {
	const policyActionMatch = patternText.match(/^POLICY_ACTION_CATALOG\.([A-Za-z_$][\w$]*)\./);
	if (policyActionMatch) return policyActionMatch[1];

	const permissionMatch = patternText.match(/^permission: '([^']+)'$/);
	if (permissionMatch) return permissionMatch[1];

	const requireMatch = patternText.match(/^require(?:Edit|View)\('([^']+)'\)$/);
	if (requireMatch) return requireMatch[1];

	return undefined;
}

function collectFeaturePermissionCouplingIssues(sourceFiles) {
	const issues = [];

	for (const family of FEATURE_PERMISSION_FAMILIES) {
		const featureFiles = sourceFiles.filter(({ path: filePath }) => hasFeatureFamilyMatch(filePath, family.feature));
		const foreignPermissionLanes = new Set(family.foreignPermissionLanes);

		for (const { path: filePath, content } of featureFiles) {
			for (const patternText of collectPermissionPatterns(content)) {
				if (!foreignPermissionLanes.has(getPermissionPatternLane(patternText))) continue;
				issues.push(
					`${family.feature} permission coupling: ${filePath} -> ${patternText}. Use the owning feature permission lane.`
				);
			}
		}
	}

	return issues;
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
		...walkRelative('src/lib/server').filter(isProductionSourceFile),
		...walkRelative('src/lib/access').filter(isProductionSourceFile),
		...walkRelative('src/features').filter(isProductionSourceFile)
	];
	return [...new Set([...routeFiles, ...serverFiles])];
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
		/\$lib\/server\/supabase['"]/.test(content) ||
		/\bctx\s*\.\s*adminClient\b/.test(content) ||
		/\bconst\s*\{[^}]*\badminClient\b[^}]*\}\s*=\s*ctx\b/.test(content) ||
		hasAdminContextClientUsage(content) ||
		hasAdminContextAdapterFactoryUsage(content)
	);
}

function routeServerFiles() {
	return walkRelative('src/routes').filter(
		(filePath) => filePath.endsWith('.server.ts') || filePath.endsWith('/+server.ts')
	);
}

function checkRouteProviderUsage() {
	for (const filePath of routeServerFiles()) {
		const content = readRelativeFile(filePath);
		if (hasRouteSupabaseUsage(content)) {
			errors.push(`Route-level Supabase usage: ${filePath}. Pass the request to an owned operation instead.`);
		}
		if (hasRouteAdminProviderUsage(content)) {
			errors.push(
				`Route-level admin-provider usage: ${filePath}. Bind service-role ports in a Delivery adapter after authorization.`
			);
		}
	}
}

function checkFeaturePermissionCouplings() {
	const sourceFiles = walkRelative('src')
		.filter(isProductionSourceFile)
		.map((filePath) => ({ path: filePath, content: readRelativeFile(filePath) }));
	errors.push(...collectFeaturePermissionCouplingIssues(sourceFiles));
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

function mapSqlList(content, transform) {
	const parts = [];
	let depth = 0;
	let start = 0;
	for (const match of content.matchAll(/'(?:''|[^'])*'|[()[\],]/g)) {
		if (match[0] === '(' || match[0] === '[') depth++;
		if (match[0] === ')' || match[0] === ']') depth--;
		if (match[0] === ',' && depth === 0) {
			parts.push(transform(content.slice(start, match.index)));
			start = match.index + 1;
		}
	}
	parts.push(transform(content.slice(start)));
	return parts.join(',');
}

function collectGroupScopeMigrationIssues(migrations) {
	const issues = [];
	const treeMigration = 'supabase/migrations/20261028100000_nested_groups_and_coverage.sql';
	const identifier = String.raw`(?:[a-z_][\w$]*\s*\.\s*)?`;
	const group = `\\b${identifier}(?:p_)?group_id\\b`;
	const responsible = `\\b${identifier}responsible_group_id\\b`;
	const comparison = String.raw`\s*(?:=|is\s+(?:not\s+)?distinct\s+from)\s*`;
	const exactResponsibility = new RegExp(`(?:${group}${comparison}${responsible}|${responsible}${comparison}${group})`);
	const scopeColumn = `\\b${identifier}access_scope_group_ids\\b`;
	const subtreeScope = new RegExp(`\\b${identifier}path\\s*&&\\s*${scopeColumn}`, 'g');
	const plainScopeColumn = new RegExp(`^\\s*${scopeColumn}\\s*(?:uuid\\s*\\[\\s*\\])?\\s*$`);
	const scopeAssignment = new RegExp(`^(\\s*)${scopeColumn}\\s*=(?!=)`);
	const scopeVariableAssignment = new RegExp(`${scopeColumn}\\s*:=([^;]*)`, 'g');
	const removePlainScopeColumn = (column) => (plainScopeColumn.test(column) ? '' : column);
	const storedGroupReferenceValidation =
		/\b(?:[a-z_][\w$]*\s*\.\s*)?id\s*=\s*any\s*\(\s*new\s*\.\s*access_scope_group_ids\s*\)\s+and\s+(?:[a-z_][\w$]*\s*\.\s*)?organization_id\s*<>\s*new\s*\.\s*organization_id\b/g;
	for (const { path: file, content } of migrations.filter(
		({ path: file }) => file.endsWith('.sql') && file > treeMigration
	)) {
		let sql = content
			.replace(/\/\*[\s\S]*?\*\//g, ' ')
			.replace(/--[^\n]*/g, ' ')
			.replace(/"/g, '')
			.toLowerCase()
			.replace(storedGroupReferenceValidation, '');
		const responsibilitySql = sql;
		sql = sql
			.replace(subtreeScope, '')
			.replace(scopeVariableAssignment, (_, value) => ':=' + removePlainScopeColumn(value))
			.replace(
				/(\b(?:insert\s+into\s+[\w.]+|returns\s+table)\s*\()([^)]*)(\))/g,
				(_, prefix, columns, suffix) => prefix + mapSqlList(columns, removePlainScopeColumn) + suffix
			)
			.replace(
				/(\bselect\s+)([\s\S]*?)(?=\bfrom\b|;|$)/g,
				(_, prefix, columns) => prefix + mapSqlList(columns, removePlainScopeColumn)
			)
			.replace(
				/(\bset\s+)([\s\S]*?)(?=\bwhere\b|\breturning\b|;|$)/g,
				(_, prefix, assignments) =>
					prefix +
					mapSqlList(assignments, (assignment) => removePlainScopeColumn(assignment.replace(scopeAssignment, '$1')))
			);
		if (/\baccess_scope_group_ids\b/.test(sql)) {
			issues.push(
				`Exact Group grant comparison: ${file}. Use groups.path && access_scope_group_ids for subtree coverage.`
			);
		}
		if (exactResponsibility.test(responsibilitySql)) {
			issues.push(
				`Exact Tasking roster comparison: ${file}. Use organization_private.group_within for subtree candidacy.`
			);
		}
	}
	return issues;
}

function checkGroupScopeMigrations() {
	errors.push(
		...collectGroupScopeMigrationIssues(
			walkRelative('supabase/migrations').map((file) => ({
				path: file,
				content: readRelativeFile(file)
			}))
		)
	);
}

function runGovernanceChecks() {
	checkRouteProviderUsage();
	checkFeaturePermissionCouplings();
	checkDeletedRouteAuthorizationFramework();
	checkGroupScopeMigrations();
	try {
		for (const issue of runModuleGovernance()) {
			errors.push(`Module ${issue.kind}: [${issue.packet}] ${issue.file}: ${issue.message}`);
		}
	} catch (error) {
		errors.push(`Module boundary scan unavailable: ${error instanceof Error ? error.message : String(error)}`);
	}

	if (errors.length > 0) {
		console.error('Governance check failed:\n');
		for (const issue of errors) {
			console.error(`- ${issue}`);
		}
		process.exit(1);
	}

	console.log('Governance checks passed.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	runGovernanceChecks();
}

export {
	collectDestructuredLocalSupabaseBindings,
	collectFeaturePermissionCouplingIssues,
	collectGroupScopeMigrationIssues,
	collectPermissionPatterns,
	hasRouteAdminProviderUsage,
	hasRouteSupabaseUsage,
	runGovernanceChecks
};
