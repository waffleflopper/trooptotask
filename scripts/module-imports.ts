import { lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseSvelte } from 'svelte/compiler';
import ts from 'typescript';

const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|svelte)$/;
// Installed Vite/Svelte resolution order. Declaration files are type targets, never runtime fallbacks.
const RUNTIME_EXTENSIONS = ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json', '.svelte'];
const TYPE_EXTENSIONS = ['.ts', '.tsx', '.d.ts', '.js', '.jsx'];
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
type ImportReference = { specifier: string; kind: ImportKind; position: number; typeOnly?: boolean };
type Failure = { file: string; message: string };
type Source = { path: string; content: string };
type Section = { content: string; offset: number };
type Classification = 'local' | 'external' | 'virtual' | 'unresolved';
type ImportEdge = ImportReference & { from: string; classification: Classification; to?: string };

function walkSourceFiles(root: string) {
	const files: string[] = [];
	function visit(directory: string) {
		if (lstatSync(path.join(root, directory)).isSymbolicLink()) {
			throw new Error(`Unsupported source symlink: ${directory}`);
		}
		for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
			const relative = path.posix.join(directory, entry.name);
			if (entry.isSymbolicLink()) throw new Error(`Unsupported source symlink: ${relative}`);
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
		if (record.type === 'MemberExpression') {
			const object = record.object as Record<string, unknown> | undefined;
			const meta = object?.meta as Record<string, unknown> | undefined;
			const property = record.property as Record<string, unknown> | undefined;
			if (
				object?.type === 'MetaProperty' &&
				meta?.name === 'import' &&
				(record.computed ? property?.value === 'glob' : property?.name === 'glob')
			) {
				failures.push({
					file: filePath,
					message: `Unsupported import.meta.glob at offset ${record.start}; use explicit imports`
				});
			}
		}
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

	function add(node: ts.Node, expression: ts.Node | undefined, kind: ImportKind, typeOnly = false) {
		const position = section.offset + node.getStart(source);
		if (expression && (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression))) {
			imports.push({ specifier: expression.text, kind, position, typeOnly: typeOnly || source.isDeclarationFile });
		} else {
			failures.push({ file: filePath, message: `Opaque ${kind} at offset ${position}` });
		}
	}

	function visit(node: ts.Node) {
		if (
			(ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
			ts.isMetaProperty(node.expression) &&
			node.expression.keywordToken === ts.SyntaxKind.ImportKeyword &&
			(ts.isPropertyAccessExpression(node)
				? node.name.text === 'glob'
				: ts.isStringLiteral(node.argumentExpression) && node.argumentExpression.text === 'glob')
		) {
			failures.push({
				file: filePath,
				message: `Unsupported import.meta.glob at offset ${section.offset + node.getStart(source)}; use explicit imports`
			});
		}
		if (ts.isImportDeclaration(node)) {
			// Inline `import { type T }` still loads runtime side effects with verbatimModuleSyntax.
			add(node, node.moduleSpecifier, 'import', node.importClause?.isTypeOnly);
		} else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
			const clause = node.exportClause;
			const typeOnly =
				node.isTypeOnly ||
				(clause &&
					ts.isNamedExports(clause) &&
					clause.elements.length > 0 &&
					clause.elements.every((element) => element.isTypeOnly));
			add(node, node.moduleSpecifier, 'export', !!typeOnly);
		} else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
			add(node, node.moduleReference.expression, 'import', node.isTypeOnly);
		} else if (ts.isImportTypeNode(node)) {
			add(node, ts.isLiteralTypeNode(node.argument) ? node.argument.literal : undefined, 'import-type', true);
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
	isFile: (candidate: string) => boolean,
	mode: 'value' | 'type' = 'value'
): { classification: Classification; to?: string; failure?: string } {
	if (specifier.startsWith('$app/') || specifier.startsWith('$env/') || specifier === '$service-worker') {
		return { classification: 'virtual' };
	}
	if (
		!specifier.startsWith('.') &&
		!specifier.startsWith('/') &&
		!specifier.startsWith('$lib') &&
		!specifier.startsWith('$features')
	) {
		return { classification: 'external' };
	}

	let base;
	if (specifier === '$lib' || specifier.startsWith('$lib/')) {
		base = `src/lib${specifier.slice('$lib'.length)}`;
	} else if (specifier === '$features' || specifier.startsWith('$features/')) {
		base = `src/features${specifier.slice('$features'.length)}`;
	} else if (specifier.startsWith('/')) {
		base = specifier.slice(1);
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
	const substitutions =
		extension === '.js'
			? ['.ts', '.tsx', ...(mode === 'type' ? ['.d.ts'] : [])]
			: extension === '.jsx'
				? mode === 'type'
					? ['.tsx', '.ts', '.d.ts']
					: ['.ts', '.tsx']
				: extension === '.mjs'
					? ['.mts', ...(mode === 'type' ? ['.d.mts'] : [])]
					: extension === '.cjs'
						? ['.cts', ...(mode === 'type' ? ['.d.cts'] : [])]
						: [];
	const replacements = substitutions.map((suffix) => `${stem}${suffix}`);
	const extensions = mode === 'type' ? TYPE_EXTENSIONS : RUNTIME_EXTENSIONS;
	const candidates = [
		...(mode === 'value' ? [base, ...replacements] : [...replacements, base]),
		...(mode === 'type' && (extension === '.js' || extension === '.jsx')
			? [`${stem}${extension === '.js' ? '.jsx' : '.js'}`]
			: []),
		...extensions.map((suffix) => `${base}${suffix}`)
	];
	for (const candidate of candidates) {
		if (isFile(candidate)) return { classification: 'local', to: candidate };
	}
	if (isFile(`${base}/package.json`)) {
		return {
			classification: 'unresolved',
			failure: `Unsupported local package entry: ${base}/package.json; use an explicit file import`
		};
	}
	for (const suffix of extensions) {
		const candidate = `${base}/index${suffix}`;
		if (isFile(candidate)) return { classification: 'local', to: candidate };
	}
	return { classification: 'unresolved' };
}

function buildImportGraph(sources: Source[], isFile: (candidate: string) => boolean) {
	const edges: ImportEdge[] = [];
	const failures: Failure[] = [];
	const contents = Object.fromEntries(sources.map(({ path, content }) => [path, content]));
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
			const { failure, ...resolved } = resolveImport(
				filePath,
				imported.specifier,
				isFile,
				imported.typeOnly ? 'type' : 'value'
			);
			edges.push({ from: filePath, ...imported, ...resolved });
			if (resolved.classification === 'unresolved') {
				failures.push({ file: filePath, message: failure ?? `Unresolved local import: ${imported.specifier}` });
			}
			if (!imported.typeOnly && resolved.classification === 'local') {
				const typeTarget = resolveImport(filePath, imported.specifier, isFile, 'type');
				if (typeTarget.failure) failures.push({ file: filePath, message: typeTarget.failure });
				if (typeTarget.classification === 'local' && typeTarget.to !== resolved.to) {
					edges.push({ from: filePath, ...imported, ...typeTarget, kind: 'import-type', typeOnly: true });
				}
			}
		}
	}
	return { edges, failures, contents };
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
