import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parse } from 'svelte/compiler';
import { buildImportGraph } from './module-imports.ts';

type Source = { path: string; content: string };
type Edge = { from: string; to?: string; classification: string };
type Area = 'app' | 'admin' | 'public' | 'shared';
type Packet = `10-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}` | 'foundation' | 'unclassified';
type Disposition =
	| { kind: 'complete' }
	| { kind: 'test support' }
	| { kind: 'native'; reason: string }
	| { kind: 'open' };
type Row = {
	file: string;
	area: Area;
	packet: Packet;
	families: string[];
	controls: Record<string, number>;
	styleBlocks: number;
	cssVariables: Record<string, number>;
	hexLiterals: number;
	disposition: Disposition;
};
type NativeException = { covers: Record<string, number>; reason: string };

const OUTPUT = 'docs/stabilization/phase-10-inventory.md';
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|svelte)$/;
const FAMILY = /^src\/lib\/components\/(ui|patterns)\/([^/]+)\//;
const ORG = 'src/routes/org/\\[orgId\\]/';

const PACKET_RULES: [RegExp, Packet][] = [
	[/^src\/lib\/components\/ui\//, 'foundation'],
	[
		new RegExp(
			`^(?:src/features/personnel/|${ORG}personnel/|${ORG}settings/(?:ranks/|archives/|RanksSettingsPage|ArchivedPersonnelSettingsSection))`
		),
		'10-02'
	],
	[new RegExp(`^(?:src/features/calendar/|${ORG}calendar/)`), '10-03'],
	[new RegExp(`^(?:src/features/(?:dashboard|training)/|${ORG}(?:\\(dashboard\\)|training)/)`), '10-04'],
	[new RegExp(`^(?:src/features/(?:critical-tasks|rating-scheme)/|${ORG}(?:critical-tasks|evals)/)`), '10-05'],
	[new RegExp(`^(?:src/features/(?:onboarding|sign-in-rosters)/|${ORG}onboarding/)`), '10-06'],
	[
		new RegExp(
			`^(?:src/features/(?:organization|data-export|notifications|feedback|deletion-requests|platform-admin|scheduled-maintenance)/|${ORG}settings/|src/routes/(?:admin|dashboard|org/new)/)`
		),
		'10-07'
	],
	[
		new RegExp(
			`^(?:src/features/(?:app-shell|identity)/|src/routes/(?:auth|account|suspended)/|src/routes/(?:\\+layout|\\+error|layout)[^/]*$|${ORG}[^/]+$)`
		),
		'10-01'
	],
	[
		/^(?:src\/routes\/(?:\+page|page)[^/]*$|src\/routes\/(?:about|privacy|security|terms)\/|src\/lib\/components\/public\/)/,
		'10-08'
	],
	[/^src\/lib\//, '10-09']
];

const AREA_RULES: [RegExp, Area][] = [
	[/^(?:src\/routes\/admin\/|src\/features\/platform-admin\/)/, 'admin'],
	[
		/^(?:src\/routes\/(?:\+page|page)[^/]*$|src\/routes\/(?:about|privacy|security|terms)\/|src\/lib\/components\/public\/)/,
		'public'
	],
	[/^src\/lib\//, 'shared']
];

const CONTROL_MAPPING: [string, string][] = [
	['button', '`Button` (`ui/button`), including `variant="link"` for link-styled actions'],
	['a[role=button]', '`Button` with `href`, or a plain semantic link'],
	['input', '`Input` inside `Field.*` (`ui/input`, `ui/field`)'],
	['input[type=checkbox]', '`Checkbox` (`ui/checkbox`)'],
	['input[type=radio]', '`RadioGroup` (`ui/radio-group`)'],
	['input[type=file]', 'No ui family yet; keep native or justify the file picker'],
	['select', '`NativeSelect` or `Select` (`ui/native-select`, `ui/select`)'],
	['textarea', '`Textarea` (`ui/textarea`)'],
	['table', '`Table.*` for static content, `DataTable` for records (`ui/table`, `ui/data-table`)'],
	['dialog', '`AppDialog.*` or `ConfirmDialog` (`ui/app-dialog`, `ui/confirm-dialog`)'],
	['details', '`Accordion.*` or `Collapsible.*` (`ui/accordion`, `ui/collapsible`)'],
	['[role=button]', '`Button`; a clickable non-button element needs a native control'],
	['<style>', 'Tailwind utilities on shared components; remove the route `<style>` block'],
	['var(--…)', 'Shared tokens from `src/app.css` through Tailwind theme utilities'],
	['#hex', 'Shared color tokens from `src/app.css`']
];

const TEST_SUPPORT =
	/(?:^|\/)(?:test-support|test-stubs|__tests__)\/|(?:Test|Stub)\.svelte$|\.(?:test|spec|test-support)\./;

const CALENDAR_GRID =
	'Grid geometry, not a skin: Calendar sets the cell and personnel-column widths per breakpoint and the date count from data, and the header, rows, group headers and cells size from them.';
const PRINT_TABLE = 'Print layout: a native `table` paginates and repeats its heading row on each printed page.';

/**
 * Candidates kept for a behavioral reason. `covers` is the row's exact candidate signature; a row whose
 * candidates differ in any way (a new control, a changed count) is open.
 */
const NATIVE_EXCEPTIONS: Record<string, NativeException> = {
	'src/features/calendar/components/Calendar.svelte': {
		covers: { '--calendar-cell-width': 1, '--calendar-personnel-column-width': 1, '--dates-count': 1 },
		reason: CALENDAR_GRID
	},
	'src/features/calendar/components/CalendarHeader.svelte': {
		covers: { '--calendar-cell-width': 3, '--calendar-personnel-column-width': 2, '--dates-count': 2 },
		reason: CALENDAR_GRID
	},
	'src/features/calendar/components/CalendarRow.svelte': {
		covers: { '--calendar-cell-width': 2, '--calendar-personnel-column-width': 2, '--dates-count': 2 },
		reason: CALENDAR_GRID
	},
	'src/features/calendar/components/date-cell/date-cell.svelte': {
		covers: { button: 1, '--calendar-cell-width': 1 },
		reason:
			'A month remounts 651+ cells on every navigation, and the `ui/button` wrapper slowed load and navigation; the cell width is the Calendar grid geometry.'
	},
	'src/features/calendar/components/GroupHeader.svelte': {
		covers: { '--calendar-cell-width': 2, '--calendar-personnel-column-width': 5, '--dates-count': 2 },
		reason: CALENDAR_GRID
	},
	'src/features/calendar/components/LongRangeView.svelte': {
		covers: { '--calendar-personnel-column-width': 3, '--dates-count': 2, '--long-range-columns': 4 },
		reason:
			'Grid geometry, not a skin: the personnel column follows the Calendar breakpoints, and the header, group and person rows share one column template sized from the date count.'
	},
	'src/features/training/components/TrainingPrintBrief.svelte': { covers: { table: 1 }, reason: PRINT_TABLE },
	'src/features/training/components/TrainingPrintDetail.svelte': { covers: { table: 1 }, reason: PRINT_TABLE },
	'src/features/training/components/TrainingPrintMatrix.svelte': { covers: { table: 1 }, reason: PRINT_TABLE }
};

const NON_CONTROL_INPUTS = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

function classify<T>(file: string, rules: [RegExp, T][], fallback: T): T {
	return rules.find(([pattern]) => pattern.test(file))?.[1] ?? fallback;
}

function attributeText(node: Record<string, unknown>, name: string): string | true | undefined {
	const attributes = (node.attributes as Record<string, unknown>[] | undefined) ?? [];
	const attribute = attributes.find((item) => item.type === 'Attribute' && item.name === name);
	if (!attribute) return undefined;
	if (attribute.value === true) return true;
	const parts = Array.isArray(attribute.value) ? attribute.value : [attribute.value];
	return parts.every((part) => part?.type === 'Text') ? parts.map((part) => part.data).join('') : '{expression}';
}

function scanTemplate(file: string, content: string) {
	const counts: Record<string, number> = {};
	const add = (key: string) => (counts[key] = (counts[key] ?? 0) + 1);
	const visit = (node: unknown) => {
		if (!node || typeof node !== 'object') return;
		if (Array.isArray(node)) return node.forEach(visit);
		const record = node as Record<string, unknown>;
		if (record.type === 'RegularElement') {
			const name = record.name as string;
			const role = attributeText(record, 'role');
			if (name === 'input') {
				const type = attributeText(record, 'type');
				const kind = typeof type === 'string' ? type : 'text';
				if (kind === 'checkbox' || kind === 'radio' || kind === 'file') add(`input[type=${kind}]`);
				else if (!NON_CONTROL_INPUTS.has(kind)) add('input');
				else if (kind !== 'hidden') add('button');
			} else if (['button', 'select', 'textarea', 'table', 'dialog', 'details'].includes(name)) add(name);
			else if (role === 'button') add(name === 'a' ? 'a[role=button]' : '[role=button]');
		}
		for (const [key, value] of Object.entries(record)) if (key !== 'parent') visit(value);
	};
	const component = parse(content, { filename: file, modern: true });
	visit(component.fragment);
	return { controls: counts, styleBlocks: component.css ? 1 : 0 };
}

function countMatches(content: string, pattern: RegExp): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const match of content.matchAll(pattern)) counts[match[1]] = (counts[match[1]] ?? 0) + 1;
	return counts;
}

const list = (counts: Record<string, number>) =>
	Object.entries(counts)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, count]) => `\`${key}\`×${count}`)
		.join(', ');

function candidates(row: Omit<Row, 'disposition'>): Record<string, number> {
	return {
		...row.controls,
		...(row.styleBlocks ? { '<style>': row.styleBlocks } : {}),
		...row.cssVariables,
		...(row.hexLiterals ? { '#hex': row.hexLiterals } : {})
	};
}

function dispose(row: Omit<Row, 'disposition'>, exceptions: Record<string, NativeException>): Disposition {
	if (TEST_SUPPORT.test(row.file)) return { kind: 'test support' };
	const signature = list(candidates(row));
	if (!signature) return { kind: 'complete' };
	const exception = exceptions[row.file];
	return exception && list(exception.covers) === signature
		? { kind: 'native', reason: exception.reason }
		: { kind: 'open' };
}

function buildInventory(sources: Source[], edges: Edge[], exceptions = NATIVE_EXCEPTIONS) {
	const familySet = new Set<string>();
	for (const { path: file } of sources) {
		const match = file.match(FAMILY);
		if (match) familySet.add(`${match[1]}/${match[2]}`);
	}
	const consumers = new Map<string, Set<string>>();
	for (const edge of edges) {
		const match = edge.classification === 'local' ? edge.to?.match(FAMILY) : undefined;
		if (!match || edge.from.startsWith(match[0])) continue;
		if (!consumers.has(edge.from)) consumers.set(edge.from, new Set());
		consumers.get(edge.from)!.add(`${match[1]}/${match[2]}`);
	}
	const rows: Row[] = sources
		.filter(({ path: file }) => file.endsWith('.svelte') || consumers.has(file))
		.map(({ path: file, content }): Row => {
			const packet = classify<Packet>(file, PACKET_RULES, 'unclassified');
			const scanned = packet !== 'foundation';
			const template =
				scanned && file.endsWith('.svelte') ? scanTemplate(file, content) : { controls: {}, styleBlocks: 0 };
			const row = {
				file,
				area: classify<Area>(file, AREA_RULES, 'app'),
				packet,
				families: [...(consumers.get(file) ?? [])].sort(),
				...template,
				cssVariables: scanned ? countMatches(content, /var\(\s*(--[\w-]+)/g) : {},
				hexLiterals: scanned
					? (content.match(/(?<![&\w#])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g)?.length ?? 0)
					: 0
			};
			return { ...row, disposition: dispose(row, exceptions) };
		})
		.sort((left, right) => left.file.localeCompare(right.file));
	const unusedExceptions = Object.keys(exceptions).filter(
		(file) => !rows.some((row) => row.file === file && ['native', 'open'].includes(row.disposition.kind))
	);
	return { rows, families: [...familySet].sort(), unusedExceptions };
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const total = (counts: Record<string, number>) => sum(Object.values(counts));
const cell = (value: string) => value.replaceAll('|', '\\|') || '·';
const findings = (row: Row) => total(candidates(row));
const isOpen = (row: Row) => row.disposition.kind === 'open';
const disposition = ({ disposition }: Row) =>
	disposition.kind === 'native'
		? `native: ${disposition.reason}`
		: disposition.kind === 'open'
			? '**OPEN**'
			: disposition.kind;

function renderInventory({ rows, families, unusedExceptions }: ReturnType<typeof buildInventory>): string {
	const packets = [...new Set(rows.map((row) => row.packet))].sort();
	const lines = [
		'# Phase 10 consumer inventory',
		'',
		'<!-- Generated by `npm run inventory:ui`; do not edit by hand. -->',
		'',
		'Generated by `npm run inventory:ui` from tracked `src` files. It lists every tracked `.svelte` file and every file importing a `components/ui` or `components/patterns` family, classified into the [Phase 10 packets](TODO.md#10--all-ui-consumers). Rerun it after each Phase 10 change; `npm run inventory:ui -- --check` fails when this file is stale.',
		'',
		'Counts are migration candidates, not findings of the governance gate. `foundation` rows are the `components/ui` primitives themselves; their native elements are the canonical implementation and are not counted. Raw controls are template elements outside `ui`; `<input type="hidden">` is not a control and `submit`/`button`/`reset` inputs count as buttons.',
		'',
		"Each row has a disposition. `complete` has no candidates. `test support` is a harness, stub or fixture that only tests mount or import, classified by path. `native` keeps exactly the candidates recorded with its behavioral reason in the script's `NATIVE_EXCEPTIONS`. **OPEN** is any other row with candidates, including a recorded row whose candidates changed.",
		'',
		'## Summary',
		'',
		'| Packet | Files | Files with candidates | Raw controls | `<style>` blocks | `var(--…)` | Hex literals | Open rows |',
		'| ------ | ----: | --------------------: | -----------: | ---------------: | ---------: | -----------: | --------: |'
	];
	for (const packet of packets) {
		const owned = rows.filter((row) => row.packet === packet);
		lines.push(
			`| ${packet} | ${owned.length} | ${owned.filter((row) => findings(row) > 0).length} | ${sum(owned.map((row) => total(row.controls)))} | ${sum(owned.map((row) => row.styleBlocks))} | ${sum(owned.map((row) => total(row.cssVariables)))} | ${sum(owned.map((row) => row.hexLiterals))} | ${owned.filter(isOpen).length} |`
		);
	}
	const unclassified = rows.filter((row) => row.packet === 'unclassified');
	lines.push(
		'',
		`Open rows: ${rows.filter(isOpen).length}. Unclassified rows: ${unclassified.length}. Unused native exceptions: ${unusedExceptions.length}${unusedExceptions.length ? ` (${unusedExceptions.map((file) => `\`${file}\``).join(', ')})` : ''}.`,
		'',
		'## Control mapping',
		'',
		'| Candidate | Canonical replacement |',
		'| --------- | --------------------- |'
	);
	for (const [candidate, replacement] of CONTROL_MAPPING) lines.push(`| \`${candidate}\` | ${replacement} |`);
	lines.push(
		'',
		'## Families and consumers',
		'',
		'Each family is imported through `$lib/components/<layer>/<family>` (its `index.ts`); the governance guard rejects internal-file imports. Consumers outside the family are counted by area.',
		'',
		'| Family | App | Admin | Public | Shared | Consumers by packet |',
		'| ------ | --: | ----: | -----: | -----: | ------------------- |'
	);
	for (const family of families) {
		const users = rows.filter((row) => row.families.includes(family));
		const count = (area: Area) => users.filter((row) => row.area === area).length;
		const byPacket: Record<string, number> = {};
		for (const row of users) byPacket[row.packet] = (byPacket[row.packet] ?? 0) + 1;
		lines.push(
			`| \`${family}\` | ${count('app')} | ${count('admin')} | ${count('public')} | ${count('shared')} | ${cell(list(byPacket))} |`
		);
	}
	for (const packet of packets) {
		lines.push(
			'',
			`## ${packet}`,
			'',
			'| File | Area | Families | Raw controls | `<style>` | `var(--…)` | Hex | Disposition |',
			'| ---- | ---- | -------- | ------------ | --------: | ---------- | --: | ----------- |'
		);
		for (const row of rows.filter((item) => item.packet === packet)) {
			lines.push(
				`| \`${row.file}\` | ${row.area} | ${cell(row.families.map((family) => `\`${family}\``).join(', '))} | ${cell(list(row.controls))} | ${row.styleBlocks || '·'} | ${cell(list(row.cssVariables))} | ${row.hexLiterals || '·'} | ${cell(disposition(row))} |`
			);
		}
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

async function generateInventory(root: string): Promise<string> {
	const sources = trackedSources(root);
	const { edges } = buildImportGraph(
		sources,
		(candidate) => statSync(path.join(root, candidate), { throwIfNoEntry: false })?.isFile() ?? false
	);
	const output = path.join(root, OUTPUT);
	return format(renderInventory(buildInventory(sources, edges)), {
		...(await resolveConfig(output)),
		filepath: output
	});
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
	const inventory = await generateInventory(process.cwd());
	if (process.argv.includes('--check')) {
		const current = statSync(OUTPUT, { throwIfNoEntry: false }) ? readFileSync(OUTPUT, 'utf8') : '';
		if (current !== inventory) {
			console.error(`${OUTPUT} is stale; run npm run inventory:ui`);
			process.exitCode = 1;
		}
	} else {
		writeFileSync(OUTPUT, inventory);
		console.log(`Wrote ${OUTPUT}`);
	}
}

export { buildInventory, renderInventory };
