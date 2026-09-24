import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseSvelte } from 'svelte/compiler';
import ts from 'typescript';

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|svelte)$/;
const RESOLUTION_SUFFIXES = [
	'',
	'.ts',
	'.tsx',
	'.js',
	'.jsx',
	'.mjs',
	'.mts',
	'.cjs',
	'.cts',
	'.svelte',
	'.svelte.ts',
	'.json',
	'.css',
	'/index.ts',
	'/index.tsx',
	'/index.js',
	'/index.jsx',
	'/index.mts',
	'/index.cts',
	'/index.svelte'
];
const ROUTE_MODULE_FILES = [
	'+page.svelte',
	'+page.ts',
	'+page.js',
	'+page.server.ts',
	'+page.server.js',
	'+layout.svelte',
	'+layout.ts',
	'+layout.js',
	'+layout.server.ts',
	'+layout.server.js',
	'+server.ts',
	'+server.js',
	'+error.svelte'
];

type ImportKind = 'import' | 'export' | 'import-type' | 'dynamic' | 'require';
type ImportReference = { specifier: string; kind: ImportKind; position: number };
type Failure = { file: string; message: string };
type Source = { path: string; content: string };
type Section = { content: string; offset: number };
type Classification = 'local' | 'external' | 'virtual' | 'unresolved';
type ImportEdge = ImportReference & { from: string; classification: Classification; to?: string };

function walkSourceFiles(root: string) {
	const files: string[] = [];
	function visit(directory: string) {
		for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
			const relative = path.posix.join(directory, entry.name);
			if (entry.isDirectory()) visit(relative);
			else if (entry.isFile() && SOURCE_FILE.test(relative)) files.push(relative);
		}
	}
	visit('src');
	return files.sort();
}

function sourceSections(
	filePath: string,
	content: string
): { scripts: Section[]; templateImports: ImportReference[]; failures: Failure[] } {
	if (!filePath.endsWith('.svelte')) return { scripts: [{ content, offset: 0 }], templateImports: [], failures: [] };
	const component = parseSvelte(content, { filename: filePath });
	const scripts = [component.module, component.instance].filter(Boolean).map((script) => ({
		content: content.slice(script.content.start, script.content.end),
		offset: script.content.start
	}));
	const templateImports: ImportReference[] = [];
	const failures: Failure[] = [];
	function visit(node: unknown) {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) {
			for (const item of node) visit(item);
			return;
		}
		const record = node as Record<string, unknown>;
		if (record.type === 'ImportExpression') {
			const imported = record.source as Record<string, unknown> | undefined;
			if (imported?.type === 'Literal' && typeof imported.value === 'string') {
				templateImports.push({ specifier: imported.value, kind: 'dynamic', position: record.start as number });
			} else {
				failures.push({ file: filePath, message: `Opaque dynamic at offset ${record.start}` });
			}
		}
		for (const value of Object.values(record)) visit(value);
	}
	visit(component.html);
	return { scripts, templateImports, failures };
}

function importsFromSection(filePath: string, section: Section) {
	const syntax = filePath.endsWith('.tsx')
		? ts.ScriptKind.TSX
		: filePath.endsWith('.jsx')
			? ts.ScriptKind.JSX
			: ts.ScriptKind.TS;
	const source = ts.createSourceFile(filePath, section.content, ts.ScriptTarget.Latest, true, syntax);
	const imports: ImportReference[] = [];
	const failures: Failure[] = (
		source as ts.SourceFile & { parseDiagnostics: readonly ts.Diagnostic[] }
	).parseDiagnostics.map((diagnostic) => ({
		file: filePath,
		message: `TypeScript parse error: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`
	}));

	function add(node: ts.Node, expression: ts.Node | undefined, kind: ImportKind) {
		const position = section.offset + node.getStart(source);
		if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) {
			imports.push({ specifier: expression.text, kind, position });
		} else {
			failures.push({ file: filePath, message: `Opaque ${kind} at offset ${position}` });
		}
	}

	function visit(node: ts.Node) {
		if (ts.isImportDeclaration(node)) add(node, node.moduleSpecifier, 'import');
		else if (ts.isExportDeclaration(node) && node.moduleSpecifier) add(node, node.moduleSpecifier, 'export');
		else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
			add(node, node.moduleReference.expression, 'import');
		} else if (ts.isImportTypeNode(node)) {
			add(node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, 'import-type');
		} else if (ts.isCallExpression(node)) {
			if (node.expression.kind === ts.SyntaxKind.ImportKeyword) add(node, node.arguments[0], 'dynamic');
			else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
				add(node, node.arguments[0], 'require');
			}
		}
		ts.forEachChild(node, visit);
	}
	visit(source);
	return { imports, failures };
}

function resolveImport(
	from: string,
	specifier: string,
	isFile: (candidate: string) => boolean
): { classification: Classification; to?: string } {
	if (specifier.startsWith('$app/') || specifier.startsWith('$env/') || specifier === '$service-worker') {
		return { classification: 'virtual' };
	}
	if (!specifier.startsWith('.') && !specifier.startsWith('$lib') && !specifier.startsWith('$features')) {
		return { classification: 'external' };
	}

	let base;
	if (specifier === '$lib' || specifier.startsWith('$lib/')) {
		base = `src/lib${specifier.slice('$lib'.length)}`;
	} else if (specifier === '$features' || specifier.startsWith('$features/')) {
		base = `src/features${specifier.slice('$features'.length)}`;
	} else {
		base = path.posix.join(path.posix.dirname(from), specifier);
	}
	base = path.posix.normalize(base);
	if (path.posix.basename(base) === '$types') {
		const routeDirectory = path.posix.dirname(base);
		if (
			(routeDirectory === 'src/routes' || routeDirectory.startsWith('src/routes/')) &&
			ROUTE_MODULE_FILES.some((fileName) => isFile(path.posix.join(routeDirectory, fileName)))
		) {
			return { classification: 'virtual' };
		}
	}

	const extension = path.posix.extname(base);
	const stem = base.slice(0, -extension.length);
	const bases =
		extension === '.js'
			? [`${stem}.ts`, `${stem}.tsx`, `${stem}.d.ts`, base]
			: extension === '.jsx'
				? [`${stem}.tsx`, `${stem}.d.ts`, base]
				: extension === '.mjs'
					? [`${stem}.mts`, `${stem}.d.mts`, base]
					: extension === '.cjs'
						? [`${stem}.cts`, `${stem}.d.cts`, base]
						: [base];
	for (const candidateBase of bases) {
		for (const suffix of RESOLUTION_SUFFIXES) {
			const candidate = `${candidateBase}${suffix}`;
			if (isFile(candidate)) return { classification: 'local', to: candidate };
		}
	}
	return { classification: 'unresolved' };
}

function buildImportGraph(sources: Source[], isFile: (candidate: string) => boolean) {
	const edges: ImportEdge[] = [];
	const failures: Failure[] = [];
	for (const { path: filePath, content } of sources) {
		let parsed;
		try {
			parsed = sourceSections(filePath, content);
		} catch (error) {
			failures.push({
				file: filePath,
				message: `Svelte parse error: ${error instanceof Error ? error.message : String(error)}`
			});
			continue;
		}
		const foundImports = [...parsed.templateImports];
		for (const section of parsed.scripts) {
			const found = importsFromSection(filePath, section);
			foundImports.push(...found.imports);
			parsed.failures.push(...found.failures);
		}
		foundImports.sort((left, right) => left.position - right.position);
		failures.push(...parsed.failures);
		for (const imported of foundImports) {
			const resolved = resolveImport(filePath, imported.specifier, isFile);
			edges.push({ from: filePath, ...imported, ...resolved });
			if (resolved.classification === 'unresolved') {
				failures.push({ file: filePath, message: `Unresolved local import: ${imported.specifier}` });
			}
		}
	}
	return { edges, failures };
}

function scanRepository(root: string) {
	const sourcePaths = walkSourceFiles(root);
	const sources = sourcePaths.map((filePath) => ({
		path: filePath,
		content: readFileSync(path.join(root, filePath), 'utf8')
	}));
	const graph = buildImportGraph(
		sources,
		(candidate) => statSync(path.join(root, candidate), { throwIfNoEntry: false })?.isFile() ?? false
	);
	return { sourcePaths, ...graph };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const graph = scanRepository(process.cwd());
	const counts = Object.groupBy(graph.edges, (edge) => edge.classification);
	console.log(`Source modules: ${graph.sourcePaths.length}`);
	for (const kind of ['local', 'external', 'virtual', 'unresolved'] as const) {
		console.log(`${kind} imports: ${counts[kind]?.length ?? 0}`);
	}
	for (const failure of graph.failures) console.error(`${failure.file}: ${failure.message}`);
	if (graph.failures.length > 0) process.exitCode = 1;
}

export { buildImportGraph, resolveImport, scanRepository, walkSourceFiles };
