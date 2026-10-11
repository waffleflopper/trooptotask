import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'svelte/compiler';

type Source = { path: string; content: string };
type Heading = { level: number; line: number; via: string };
type Positioned<T> = T & { start: number; path: Step[] };
export type EmptyTitleRow = {
	file: string;
	line: number;
	caller: string;
	level: number | 'prop';
	enclosing: Heading | null;
	status: 'ok' | 'skips' | 'misfit' | 'inherited' | 'plumbing';
};

type Node = { type: string; start: number; end: number; [key: string]: unknown };
type Attribute = { type: 'Attribute'; name: string; value: unknown };

const SOURCE_FILE = /^src\/.*\.svelte$/;
const MODULE = /^\$lib\/components\/((?:ui|patterns)\/[^/]+)/;

// Heading levels each shared component renders for its title, keyed `family/name:Export`.
const HEADINGS: Record<string, number> = {
	'patterns/page-shell:Header': 1,
	'patterns/page-shell:PageHeader': 1,
	'patterns/page-shell:SummaryRail': 3,
	'patterns/page-shell:SummaryRailSection': 4,
	'patterns/page-shell:RailSection': 4,
	'patterns/report-workspace:Header': 2,
	'patterns/report-workspace:Section': 3,
	'patterns/report-workspace:Filters': 3,
	'patterns/bulk-import-workspace:Header': 2,
	'patterns/bulk-import-workspace:InputPanel': 3,
	'patterns/bulk-import-workspace:ResultSummary': 3,
	'patterns/type-management-workspace:DetailHeader': 3,
	'ui/card:Title': 3
};

// What each component renders as an empty-state title when the caller passes no level.
const EMPTY_DEFAULTS: Record<string, { prop: string; fallback: number }> = {
	'ui/empty:Title': { prop: 'level', fallback: 2 },
	'ui/data-table:DataTable': { prop: 'emptyLevel', fallback: 3 },
	'patterns/bulk-import-workspace:PreviewTable': { prop: 'emptyLevel', fallback: 3 },
	'patterns/report-workspace:State': { prop: 'level', fallback: 4 },
	'patterns/report-workspace:Table': { prop: '', fallback: 4 }
};

type Step = { parent: Node; key: string };

function walk(node: unknown, visit: (node: Node, path: Step[]) => void, path: Step[] = [], parent?: Node, key = '') {
	if (Array.isArray(node)) return node.forEach((child) => walk(child, visit, path, parent, key));
	if (!node || typeof node !== 'object') return;
	const candidate = node as Node;
	const here = parent && typeof candidate.type === 'string' ? [...path, { parent, key }] : path;
	const isNode = typeof candidate.type === 'string' && typeof candidate.start === 'number';
	if (isNode) visit(candidate, here);
	for (const [child, value] of Object.entries(node)) {
		if (child !== 'parent') walk(value, visit, here, isNode ? candidate : parent, child);
	}
}

// Two nodes in different branches of one {#if} or {#await} are never on screen together.
function exclusive(a: Step[], b: Step[]) {
	for (let index = 0; index < Math.min(a.length, b.length); index++) {
		if (a[index].parent !== b[index].parent) return false;
		if (a[index].key !== b[index].key)
			return a[index].parent.type === 'IfBlock' || a[index].parent.type === 'AwaitBlock';
	}
	return false;
}

function literal(attributes: Attribute[], name: string): string | number | undefined {
	const value = attributes.find((attribute) => attribute.type === 'Attribute' && attribute.name === name)?.value;
	const part = Array.isArray(value) ? value[0] : value;
	if (!part || typeof part !== 'object') return undefined;
	const { type, expression, data } = part as {
		type: string;
		expression?: { type: string; value?: unknown };
		data?: string;
	};
	if (type === 'Text') return data;
	if (type === 'ExpressionTag' && expression?.type === 'Literal') return expression.value as string | number;
	return undefined;
}

function hasAttribute(attributes: Attribute[], name: string) {
	return attributes.some((attribute) => attribute.type === 'Attribute' && attribute.name === name);
}

function importedComponents(ast: ReturnType<typeof parse>) {
	const bindings = new Map<string, { key: string; namespace: boolean }>();
	const scripts = [ast.instance, ast.module].filter(Boolean);
	for (const script of scripts) {
		for (const statement of script!.content.body) {
			if (statement.type !== 'ImportDeclaration') continue;
			const family = MODULE.exec(String(statement.source.value))?.[1];
			if (!family) continue;
			for (const specifier of statement.specifiers) {
				const local = specifier.local.name;
				if (specifier.type === 'ImportNamespaceSpecifier') bindings.set(local, { key: family, namespace: true });
				else if (specifier.type === 'ImportSpecifier') {
					const imported =
						specifier.imported.type === 'Identifier' ? specifier.imported.name : String(specifier.imported.value);
					bindings.set(local, { key: `${family}:${imported}`, namespace: false });
				}
			}
		}
	}
	return (tag: string) => {
		const [head, member] = tag.split('.');
		const binding = bindings.get(head);
		if (!binding) return undefined;
		return binding.namespace ? (member ? `${binding.key}:${member}` : undefined) : member ? undefined : binding.key;
	};
}

function auditSource({ path: file, content }: Source): EmptyTitleRow[] {
	if (!content.includes('Empty') && !content.includes('emptyLevel') && !content.includes('State')) return [];
	const ast = parse(content, { modern: true });
	const resolve = importedComponents(ast);
	const lineOf = (offset: number) => content.slice(0, offset).split('\n').length;
	const headings: Positioned<Heading>[] = [];
	const emitters: Positioned<{ caller: string; level: number | 'prop'; plumbing: boolean }>[] = [];

	walk(ast.fragment, (node, path) => {
		const name = (node as { name?: string }).name;
		const attributes = ((node as { attributes?: Attribute[] }).attributes ?? []) as Attribute[];
		if (node.type === 'RegularElement' && name && /^h[1-6]$/.test(name)) {
			headings.push({ start: node.start, path, level: Number(name[1]), line: lineOf(node.start), via: `<${name}>` });
		}
		if (node.type === 'SvelteElement') {
			const tag = (node as { tag?: { type: string; quasis?: { value: { cooked: string } }[] } }).tag;
			const match = /^h([1-6])$/.exec(tag?.quasis?.map((quasi) => quasi.value.cooked).join('') ?? '');
			if (match) {
				headings.push({
					start: node.start,
					path,
					level: Number(match[1]),
					line: lineOf(node.start),
					via: '<svelte:element>'
				});
			}
		}
		if (node.type !== 'Component' || !name) return;
		const key = resolve(name);
		if (!key) return;
		let level = HEADINGS[key];
		if (key === 'patterns/report-workspace:Section' && literal(attributes, 'variant') === 'briefing') level = 2;
		if (key === 'ui/accordion:Trigger') {
			const given = literal(attributes, 'level');
			if (typeof given === 'number') level = given;
		}
		if (level) headings.push({ start: node.start, path, level, line: lineOf(node.start), via: name });

		const empty = EMPTY_DEFAULTS[key];
		if (!empty) return;
		if (key === 'patterns/report-workspace:State' && literal(attributes, 'state') !== 'no-data') return;
		const given = empty.prop ? literal(attributes, empty.prop) : undefined;
		const forwarded = empty.prop && hasAttribute(attributes, empty.prop) && typeof given !== 'number';
		emitters.push({
			start: node.start,
			path,
			caller: name,
			level: forwarded ? 'prop' : typeof given === 'number' ? given : empty.fallback,
			plumbing: Boolean(forwarded)
		});
	});

	headings.sort((a, b) => a.start - b.start);
	return emitters
		.sort((a, b) => a.start - b.start)
		.map(({ start, path, caller, level, plumbing }) => {
			const enclosing =
				headings.filter((heading) => heading.start < start && !exclusive(heading.path, path)).at(-1) ?? null;
			const status: EmptyTitleRow['status'] = plumbing
				? 'plumbing'
				: !enclosing
					? 'inherited'
					: typeof level !== 'number'
						? 'ok'
						: level > enclosing.level + 1
							? 'skips'
							: level <= enclosing.level
								? 'misfit'
								: 'ok';
			return {
				file,
				line: lineOf(start),
				caller,
				level,
				enclosing: enclosing && { level: enclosing.level, line: enclosing.line, via: enclosing.via },
				status
			};
		});
}

export function auditEmptyTitleLevels(sources: Source[]): EmptyTitleRow[] {
	return sources.flatMap(auditSource);
}

export function renderRows(rows: EmptyTitleRow[]): string {
	const lines = ['| Caller | Renders | Nearest preceding heading in source | Status |', '| --- | --- | --- | --- |'];
	for (const row of rows) {
		const enclosing = row.enclosing
			? `h${row.enclosing.level} \`${row.enclosing.via}\` (line ${row.enclosing.line})`
			: 'none in file';
		const level = row.level === 'prop' ? 'caller prop' : `h${row.level}`;
		lines.push(`| \`${row.file}:${row.line}\` \`${row.caller}\` | ${level} | ${enclosing} | ${row.status} |`);
	}
	return `${lines.join('\n')}\n`;
}

function trackedSources(root: string): Source[] {
	return execFileSync('git', ['ls-files', '-z', 'src'], { cwd: root, encoding: 'utf8' })
		.split('\0')
		.filter((file) => SOURCE_FILE.test(file) && existsSync(path.join(root, file)))
		.sort()
		.map((file) => ({ path: file, content: readFileSync(path.join(root, file), 'utf8') }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	process.stdout.write(renderRows(auditEmptyTitleLevels(trackedSources(process.cwd()))));
}
