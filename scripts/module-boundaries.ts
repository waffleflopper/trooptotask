import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { scanRepository } from './module-imports.ts';

type Owner = { roots: string[]; files: string[]; packet: string };
type Manifest = {
	owners: Record<string, Owner>;
	rootExclusions: Record<string, string[]>;
	dependencies: Record<string, string[]>;
	publicRoots: Record<string, string[]>;
	publicFiles: Record<string, string[]>;
	mixedFiles: Record<string, { packet: string; reason: string }>;
};
type Edge = { from: string; to?: string; classification: string; specifier: string };
type Graph = {
	sourcePaths: string[];
	edges: Edge[];
	failures: { file: string; message: string }[];
	contents: Record<string, string>;
};
type Violation = { kind: string; file: string; message: string; packet: string };
const NODE_BUILTINS = new Set(builtinModules);
const PORTABLE_GLOBAL_MEMBERS = new Set([
	'AggregateError',
	'Array',
	'ArrayBuffer',
	'Atomics',
	'BigInt',
	'BigInt64Array',
	'BigUint64Array',
	'Boolean',
	'DataView',
	'Date',
	'Error',
	'EvalError',
	'FinalizationRegistry',
	'Float32Array',
	'Float64Array',
	'Infinity',
	'Int8Array',
	'Int16Array',
	'Int32Array',
	'Intl',
	'JSON',
	'Map',
	'Math',
	'NaN',
	'Number',
	'Object',
	'Promise',
	'Proxy',
	'RangeError',
	'ReferenceError',
	'Reflect',
	'RegExp',
	'Set',
	'SharedArrayBuffer',
	'String',
	'Symbol',
	'SyntaxError',
	'TypeError',
	'URIError',
	'Uint8Array',
	'Uint8ClampedArray',
	'Uint16Array',
	'Uint32Array',
	'WeakMap',
	'WeakRef',
	'WeakSet',
	'decodeURI',
	'decodeURIComponent',
	'encodeURI',
	'encodeURIComponent',
	'isFinite',
	'isNaN',
	'parseFloat',
	'parseInt',
	'structuredClone',
	'URL',
	'URLSearchParams',
	'TextEncoder',
	'TextDecoder',
	'atob',
	'btoa',
	'undefined'
]);

function checkModuleBoundaries(graph: Graph, manifest: Manifest): Violation[] {
	const violations: Violation[] = [];
	const ownerIds = Object.keys(manifest.owners);
	const knownOwners = new Set(ownerIds);
	const add = (kind: string, file: string, message: string, packet: string) =>
		violations.push({ kind, file, message, packet });

	for (const failure of graph.failures) add('source-graph', failure.file, failure.message, '07-02a');
	for (const owner of ownerIds) {
		if (!manifest.dependencies[owner]) {
			add('manifest', owner, 'Missing dependency declaration', '07-02b');
			continue;
		}
		for (const dependency of manifest.dependencies[owner]) {
			if (!knownOwners.has(dependency) || dependency === owner) {
				add('manifest', owner, `Invalid dependency: ${dependency}`, '07-02b');
			}
		}
	}
	for (const owner of Object.keys(manifest.dependencies)) {
		if (!knownOwners.has(owner)) add('manifest', owner, 'Dependency owner is not declared', '07-02b');
	}

	const declaredCycles = cycles(
		ownerIds,
		ownerIds.flatMap((from) => (manifest.dependencies[from] ?? []).map((to) => ({ from, to })))
	);
	for (const cycle of declaredCycles) {
		add('declared-cycle', cycle[0], `Strongly connected owners: ${cycle.join(', ')}`, '07-02b');
	}

	function ownerOf(file: string): string | undefined {
		const matches = ownerIds.filter((owner) => {
			const declaration = manifest.owners[owner];
			return (
				declaration.files.includes(file) ||
				declaration.roots.some(
					(root) =>
						file.startsWith(root) &&
						!(manifest.rootExclusions[root] ?? []).some((excluded) => file.startsWith(excluded))
				)
			);
		});
		if (matches.length !== 1) {
			add('ownership', file, matches.length ? `Duplicate owners: ${matches.join(', ')}` : 'Missing owner', '07-02b');
			return undefined;
		}
		return matches[0];
	}

	const sourceOwners = new Map(graph.sourcePaths.map((file) => [file, ownerOf(file)]));
	const targets = [...new Set(graph.edges.filter((edge) => edge.classification === 'local').map((edge) => edge.to!))];
	const targetOwners = new Map(targets.map((file) => [file, sourceOwners.get(file) ?? ownerOf(file)]));
	const knownFiles = new Set([...graph.sourcePaths, ...targets]);
	for (const [owner, declaration] of Object.entries(manifest.owners)) {
		for (const file of declaration.files) {
			if (!knownFiles.has(file)) add('manifest', file, `Stale file assignment for ${owner}`, '07-02b');
		}
		for (const root of declaration.roots) {
			if (![...knownFiles].some((file) => file.startsWith(root))) {
				add('manifest', root, `Empty owner root for ${owner}`, '07-02b');
			}
		}
		for (const file of manifest.publicFiles[owner] ?? []) {
			if (!knownFiles.has(file) || (targetOwners.get(file) !== owner && sourceOwners.get(file) !== owner)) {
				add('manifest', file, `Invalid public file for ${owner}`, '07-02b');
			}
		}
	}
	for (const [root, exclusions] of Object.entries(manifest.rootExclusions)) {
		for (const excluded of exclusions) {
			if (!excluded.startsWith(root) || ![...knownFiles].some((file) => file.startsWith(excluded))) {
				add('manifest', excluded, `Invalid exclusion from ${root}`, '07-02b');
			}
		}
	}
	const actualDependencies: { from: string; to: string }[] = [];
	for (const edge of graph.edges) {
		if (edge.classification !== 'local' || !edge.to) continue;
		const from = sourceOwners.get(edge.from);
		const to = targetOwners.get(edge.to);
		if (!from || !to || from === to) continue;
		const packet = from === 'delivery' ? manifest.owners[to].packet : manifest.owners[from].packet;
		actualDependencies.push({ from, to });
		if (!(manifest.dependencies[from] ?? []).includes(to)) {
			add('undeclared', edge.from, `${from} → ${to}: ${edge.specifier} (${edge.to})`, packet);
		}
		if (!isPublic(edge.to, to, manifest)) {
			add('private', edge.from, `${from} → ${to}: ${edge.specifier} (${edge.to})`, packet);
		}
	}
	for (const cycle of cycles(ownerIds, actualDependencies)) {
		const packets = [...new Set(cycle.map((owner) => manifest.owners[owner].packet))].sort();
		add('current-cycle', cycle[0], `Strongly connected owners: ${cycle.join(', ')}`, packets.join('/'));
	}
	const sourcePathSet = new Set(graph.sourcePaths);
	const fileDependencies = graph.edges
		.filter((edge) => edge.classification === 'local' && edge.to && sourcePathSet.has(edge.to))
		.map((edge) => ({ from: edge.from, to: edge.to! }));
	for (const cycle of cycles(graph.sourcePaths, fileDependencies)) {
		const packets = [
			...new Set(
				cycle
					.map((file) => sourceOwners.get(file))
					.filter((owner) => owner)
					.map((owner) => manifest.owners[owner!].packet)
			)
		].sort();
		add('source-cycle', cycle[0], `Strongly connected files: ${cycle.join(', ')}`, packets.join('/'));
	}
	for (const [file, mixed] of Object.entries(manifest.mixedFiles)) {
		if (!sourceOwners.has(file)) {
			add('manifest', file, 'Mixed-owner file is absent from source inventory', '07-02b');
		} else {
			add('mixed-owner', file, mixed.reason, mixed.packet);
		}
	}
	violations.push(...checkPrivilegeBoundaries(graph, sourceOwners, manifest));
	return violations.sort(
		(left, right) =>
			left.file.localeCompare(right.file) ||
			left.kind.localeCompare(right.kind) ||
			left.message.localeCompare(right.message)
	);
}

function isServerOnly(file: string): boolean {
	return (
		file.startsWith('src/lib/server/') ||
		/\.server\.[cm]?[jt]sx?$/.test(file) ||
		/^src\/routes\/(?:.*\/)?\+server\.[jt]s$/.test(file)
	);
}

function isWebEntry(file: string): boolean {
	return (
		file.endsWith('.svelte') ||
		file.endsWith('.svelte.ts') ||
		file === 'src/hooks.client.ts' ||
		/^src\/routes\/(?:.*\/)?\+(?:page|layout)\.[jt]s$/.test(file) ||
		/^src\/features\/[^/]+\/index\.[jt]s$/.test(file)
	);
}

function isPortableEntry(file: string): boolean {
	return /^src\/features\/[^/]+\/contracts\.[jt]s$/.test(file);
}

function browserGlobals(content: string, file: string): string[] {
	const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
	const names = new Set([
		'self',
		'window',
		'document',
		'navigator',
		'localStorage',
		'sessionStorage',
		'indexedDB',
		'location',
		'history',
		'screen',
		'Window',
		'Document',
		'HTMLElement',
		'Storage',
		'process',
		'Buffer',
		'global',
		'module',
		'exports',
		'require',
		'__dirname',
		'__filename',
		'setImmediate'
	]);
	const found = new Set<string>();
	function visit(node: ts.Node) {
		if (ts.isIdentifier(node) && node.text === 'globalThis') {
			const parent = node.parent;
			if (ts.isPropertyAccessExpression(parent) && parent.expression === node) {
				if (!PORTABLE_GLOBAL_MEMBERS.has(parent.name.text)) found.add(`globalThis.${parent.name.text}`);
			} else if (
				ts.isElementAccessExpression(parent) &&
				parent.expression === node &&
				ts.isStringLiteral(parent.argumentExpression)
			) {
				if (!PORTABLE_GLOBAL_MEMBERS.has(parent.argumentExpression.text)) {
					found.add(`globalThis.${parent.argumentExpression.text}`);
				}
			} else {
				found.add('globalThis alias or computed access');
			}
		}
		if (ts.isIdentifier(node) && names.has(node.text)) {
			const parent = node.parent;
			const isName =
				(ts.isPropertyAccessExpression(parent) && parent.name === node) ||
				(ts.isPropertyAssignment(parent) && parent.name === node) ||
				(ts.isVariableDeclaration(parent) && parent.name === node) ||
				(ts.isParameter(parent) && parent.name === node) ||
				(ts.isImportSpecifier(parent) && parent.name === node);
			if (!isName) found.add(node.text);
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return [...found].sort();
}

function checkPrivilegeBoundaries(
	graph: Graph,
	owners: Map<string, string | undefined>,
	manifest: Manifest
): Violation[] {
	const result: Violation[] = [];
	const adjacency = new Map(graph.sourcePaths.map((file) => [file, [] as Edge[]]));
	for (const edge of graph.edges) adjacency.get(edge.from)?.push(edge);
	const seen = new Set<string>();
	const report = (kind: string, file: string, message: string) => {
		const key = `${kind}:${file}:${message}`;
		if (seen.has(key)) return;
		seen.add(key);
		const owner = owners.get(file);
		result.push({ kind, file, message, packet: owner ? manifest.owners[owner].packet : '07-02c' });
	};
	for (const file of graph.sourcePaths) {
		if (/^src\/features\/[^/]+\/server\//.test(file) && !isServerOnly(file)) {
			report('server-placement', file, 'Feature server file lacks SvelteKit-recognized server-only placement');
		}
	}
	for (const root of graph.sourcePaths) {
		const portable = isPortableEntry(root);
		if (!portable && !isWebEntry(root)) continue;
		const visited = new Set<string>();
		const pending = [root];
		while (pending.length) {
			const file = pending.pop()!;
			if (visited.has(file)) continue;
			visited.add(file);
			if (portable) {
				for (const global of browserGlobals(graph.contents[file] ?? '', file)) {
					report('portable-global', file, `Browser global ${global} reached from ${root}`);
				}
			}
			for (const edge of adjacency.get(file) ?? []) {
				const target = edge.to;
				const specifier = edge.specifier;
				const privileged =
					(target && (isServerOnly(target) || /^src\/features\/[^/]+\/server\//.test(target))) ||
					/^\$env\/(?:static|dynamic)\/private$/.test(specifier) ||
					/^(?:node:|\$app\/server$|@sveltejs\/kit\/node)/.test(specifier) ||
					NODE_BUILTINS.has(specifier);
				const nonportable =
					privileged ||
					(target &&
						(target.endsWith('.svelte') ||
							target.endsWith('.svelte.ts') ||
							target.startsWith('src/routes/') ||
							target.startsWith('src/lib/components/') ||
							/database\.types\.[jt]s$/.test(target))) ||
					/^(?:svelte(?:\/|$)|\$app\/|\$env\/|@supabase\/|@sveltejs\/|@vercel\/)/.test(specifier);
				if (portable ? nonportable : privileged) {
					report(
						portable ? 'portable-leak' : 'web-privilege',
						file,
						`${specifier}${target ? ` (${target})` : ''} reached from ${root}`
					);
					continue;
				}
				if (target && adjacency.has(target)) pending.push(target);
			}
		}
	}
	return result;
}

function isPublic(file: string, owner: string, manifest: Manifest): boolean {
	if (/\.test\.[cm]?[jt]sx?$/.test(file)) return false;
	return (
		(manifest.publicFiles[owner] ?? []).includes(file) ||
		(manifest.publicRoots[owner] ?? []).some((root) => file.startsWith(root))
	);
}

function cycles(nodes: string[], edges: { from: string; to: string }[]): string[][] {
	const adjacency = new Map(nodes.map((node) => [node, new Set<string>()]));
	for (const { from, to } of edges) adjacency.get(from)?.add(to);
	const indices = new Map<string, number>();
	const lowLinks = new Map<string, number>();
	let nextIndex = 0;
	const stack: string[] = [];
	const onStack = new Set<string>();
	const result: string[][] = [];
	function visit(node: string) {
		indices.set(node, nextIndex);
		lowLinks.set(node, nextIndex++);
		stack.push(node);
		onStack.add(node);
		for (const next of adjacency.get(node) ?? []) {
			if (!indices.has(next)) {
				visit(next);
				lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(next)!));
			} else if (onStack.has(next)) {
				lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(next)!));
			}
		}
		if (lowLinks.get(node) !== indices.get(node)) return;
		const component: string[] = [];
		let member;
		do {
			member = stack.pop()!;
			onStack.delete(member);
			component.push(member);
		} while (member !== node);
		if (component.length > 1 || adjacency.get(node)?.has(node)) result.push(component.sort());
	}
	for (const node of nodes) if (!indices.has(node)) visit(node);
	return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const manifest = JSON.parse(readFileSync('scripts/module-boundaries.json', 'utf8')) as Manifest;
	const graph = scanRepository(process.cwd());
	const violations = checkModuleBoundaries(graph, manifest);
	for (const issue of violations) {
		console.error(`[${issue.packet}] ${issue.kind}: ${issue.file}: ${issue.message}`);
	}
	console.log(`${graph.sourcePaths.length} source modules; ${violations.length} boundary violations`);
	if (violations.length) process.exitCode = 1;
}

export { checkModuleBoundaries };
export type { Manifest, Violation };
