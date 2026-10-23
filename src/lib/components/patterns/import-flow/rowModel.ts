import type {
	Answer,
	CellProblem,
	FieldDiff,
	ImportColumns,
	ImportLane,
	ImportReferences,
	LaneQuestion,
	QuestionKey,
	ReferenceMatch,
	ReferenceOption,
	ResolvedRefs,
	RowId,
	RowValues
} from './types';
import { questionKey } from './types';
import type { ImportSchema, Layout, LoadedFile } from './workbookSource';
import { targetsForHeaders } from './workbookSource';
import { parseImportDate, parseValue, type DateSystem } from './values';

export interface SourceRow {
	id: RowId;
	sheetIndex: number;
	sheetName: string;
	rowNumber: number;
	raw: Readonly<Record<string, string>>;
	cells: readonly string[];
	date1904?: boolean;
	pivotHeader?: string;
	pivotColumn?: number;
	pivot?: { field: string; valueField: string };
	problems?: readonly CellProblem[];
}

export function sourceRowId(sheetIndex: number, rowIndex: number, columnIndex?: number): RowId {
	return `${sheetIndex}:${rowIndex}${columnIndex === undefined ? '' : `:${columnIndex}`}` as RowId;
}

export function buildSourceRows<C extends ImportColumns>(
	file: LoadedFile,
	layout: Layout,
	lane: ImportSchema<C>
): readonly SourceRow[] {
	const rows: SourceRow[] = [];
	for (let sheetIndex = 0; sheetIndex < file.sheets.length; sheetIndex++) {
		const sheet = file.sheets[sheetIndex];
		const settings = layout.sheets[sheetIndex];
		if (!settings?.included || settings.headerRow === null) continue;
		const headers = sheet.rows[settings.headerRow] ?? [];
		const targets = targetsForHeaders(headers, layout.columns);
		const hasPivotField = targets.some((target) => target?.kind === 'field' && target.field === lane.pivot?.field);
		for (let rowIndex = settings.headerRow + 1; rowIndex < sheet.rows.length; rowIndex++) {
			const cells = sheet.rows[rowIndex];
			if (!cells.some((cell) => cell.trim())) continue;
			const raw: Record<string, string> = {};
			const problems: CellProblem[] = [];
			const pivotCells: number[] = [];
			for (let column = 0; column < targets.length; column++) {
				const target = targets[column];
				const value = cells[column] ?? '';
				if (target?.kind === 'field') raw[target.field] = value;
				if (target?.kind === 'split') {
					const splitter = lane.splitters?.[target.splitter];
					if (!splitter) continue;
					const split = splitter.split(value);
					for (const field of splitter.fills) raw[field] = split?.[field] ?? '';
					if (!split)
						problems.push({
							field: splitter.fills[0] ?? '',
							message: `Could not split ${splitter.label}. Enter the separate values.`
						});
				}
				if (target?.kind === 'pivot' && value.trim()) pivotCells.push(column);
			}
			const base = {
				sheetIndex: sheet.index,
				sheetName: sheet.name,
				rowNumber: rowIndex + 1,
				cells,
				date1904: file.date1904,
				problems
			};
			if (lane.pivot && !hasPivotField) {
				for (const column of pivotCells)
					rows.push({
						...base,
						id: sourceRowId(sheet.index, rowIndex, column),
						raw: { ...raw, [lane.pivot.field]: headers[column], [lane.pivot.valueField]: cells[column] },
						pivotHeader: headers[column],
						pivotColumn: column,
						pivot: lane.pivot
					});
			} else rows.push({ ...base, id: sourceRowId(sheet.index, rowIndex), raw });
		}
	}
	return rows;
}

export type CellEdits = ReadonlyMap<RowId, Readonly<Record<string, string>>>;
const editMemo = new WeakMap<SourceRow, { overrides: Readonly<Record<string, string>>; row: SourceRow }>();

export function applyEdits(rows: readonly SourceRow[], edits: CellEdits): readonly SourceRow[] {
	if (!edits.size) return rows;
	const shared = new Map<string, Record<string, string>>();
	for (const row of rows) {
		const edit = edits.get(row.id);
		if (!edit || !row.pivot) continue;
		const key = `${row.sheetIndex}:${row.rowNumber}`;
		for (const [field, value] of Object.entries(edit)) {
			if (field === row.pivot.field || field === row.pivot.valueField) continue;
			let common = shared.get(key);
			if (!common) {
				common = {};
				shared.set(key, common);
			}
			common[field] = value;
		}
	}
	return rows.map((row) => {
		const own = edits.get(row.id);
		const common = row.pivot ? shared.get(`${row.sheetIndex}:${row.rowNumber}`) : undefined;
		if (!own && !common) return row;
		const overrides = common ? { ...own, ...common } : (own ?? {});
		const cached = editMemo.get(row);
		const keys = Object.keys(overrides);
		if (
			cached &&
			keys.length === Object.keys(cached.overrides).length &&
			keys.every((key) => overrides[key] === cached.overrides[key])
		)
			return cached.row;
		const edited = {
			...row,
			raw: { ...row.raw, ...overrides },
			problems: row.problems?.filter((problem) => !(problem.field in overrides))
		};
		editMemo.set(row, { overrides, row: edited });
		return edited;
	});
}

export type Outcome = 'fix' | 'new' | 'update' | 'unchanged' | 'skipped';
export type ReviewedRow<Change> = { row: SourceRow; resolved?: Readonly<Record<string, string>> } & (
	| { outcome: 'fix'; problems: readonly CellProblem[]; questions: readonly QuestionKey[] }
	| { outcome: 'new'; key: string; change: Change }
	| { outcome: 'update'; key: string; change: Change; diff: readonly FieldDiff[]; removes?: readonly string[] }
	| { outcome: 'unchanged'; key: string }
	| { outcome: 'skipped'; reason: string; question?: QuestionKey }
);

export interface RailQuestion {
	key: QuestionKey;
	title: string;
	subject: string;
	skipLabel?: string;
	rowCount: number;
	accepts:
		| {
				kind: 'pick';
				options: readonly Pick<ReferenceOption<unknown>, 'id' | 'label' | 'hint'>[];
				canCreate: boolean;
				suggested?: string;
		  }
		| { kind: 'fill'; valueKind: 'date' };
	answer: Answer | undefined;
	reference?: string;
}

export interface ReviewState<Change> {
	rows: readonly ReviewedRow<Change>[];
	questions: readonly RailQuestion[];
	counts: Readonly<Record<Outcome, number>>;
	changeCount: number;
	commitBlocker: string | null;
}

interface MemoEntry<Change> {
	consulted: ReadonlyMap<QuestionKey, Answer | undefined>;
	questions: readonly RailQuestion[];
	review: ReviewedRow<Change>;
}

export class ReviewMemo<Change = unknown> {
	lane: object | null = null;
	rows = new WeakMap<SourceRow, MemoEntry<Change>>();
	matches = new Map<string, Map<string, ReferenceMatch<unknown>>>();
	options = new Map<string, ReadonlyMap<string, ReferenceOption<unknown>>>();
	created = new Map<string, Map<string, ReferenceOption<unknown>>>();
	clear(): void {
		this.resetLane(null);
		this.created.clear();
	}
	resetLane(lane: object | null): void {
		this.lane = lane;
		this.rows = new WeakMap();
		this.matches.clear();
		this.options.clear();
	}
	addCreated(reference: string, option: ReferenceOption<unknown>): void {
		const created = this.created.get(reference) ?? new Map<string, ReferenceOption<unknown>>();
		this.created.set(reference, created.set(option.id, option));
		this.rows = new WeakMap();
	}
	option(reference: string, id: string): ReferenceOption<unknown> | undefined {
		return this.options.get(reference)?.get(id) ?? this.created.get(reference)?.get(id);
	}
}

export function railQuestionFor(question: LaneQuestion, rowCount: number, answer: Answer | undefined): RailQuestion {
	return {
		...question,
		rowCount,
		answer,
		accepts: question.accepts.kind === 'pick' ? { ...question.accepts, canCreate: false } : question.accepts
	};
}

function acceptedAnswer(
	question: LaneQuestion,
	answer: Answer | undefined,
	system: DateSystem
): Exclude<Answer, { kind: 'skip' }> | undefined {
	if (
		answer?.kind === 'pick' &&
		question.accepts.kind === 'pick' &&
		question.accepts.options.some((option) => option.id === answer.optionId)
	)
		return answer;
	if (answer?.kind === 'fill' && question.accepts.kind === 'fill' && parseImportDate(answer.value, system))
		return answer;
	return undefined;
}

function reviewRow<C extends ImportColumns, Refs extends ImportReferences<C>, Change>(
	row: SourceRow,
	lane: ImportLane<C, Refs, Change>,
	answers: ReadonlyMap<QuestionKey, Answer>,
	memo: ReviewMemo<Change>
): MemoEntry<Change> {
	const problems: CellProblem[] = [...(row.problems ?? [])];
	const values: Record<string, string | number | null> = {};
	const refs: Record<string, ReferenceOption<unknown> | null> = {};
	const consulted = new Map<QuestionKey, Answer | undefined>();
	const questions = new Map<QuestionKey, RailQuestion>();
	let skipped: { reason: string; question: QuestionKey } | null = null;
	for (const [field, column] of Object.entries(lane.columns))
		if (column.skipWhenBlank && field in row.raw && !row.raw[field].trim())
			return { review: { row, outcome: 'skipped', reason: column.skipWhenBlank }, consulted, questions: [] };
	for (const [field, column] of Object.entries(lane.columns)) {
		const parsed = parseValue(column.kind, row.raw[field] ?? '', column.maxLength, row);
		if (!parsed.ok) problems.push({ field, message: `${column.label}: ${parsed.message}` });
		else if (parsed.value === null && column.required)
			problems.push({ field, message: `${column.label} is required.` });
		else values[field] = parsed.value;
	}
	const invalidFields = new Set(problems.map((problem) => problem.field));
	const referenceRaw: Partial<Record<keyof C & string, string>> = {};
	for (const field in lane.columns) if (field in row.raw) referenceRaw[field] = row.raw[field];
	for (const [name, reference] of Object.entries(lane.references)) {
		refs[name] = null;
		if (reference.reads.some((field) => invalidFields.has(field))) continue;
		const active = reference.reads.every((field) => field in row.raw);
		const lookup = active ? reference.key(referenceRaw) : null;
		if (!lookup) {
			if (reference.required)
				problems.push({ field: reference.reads[0] ?? '', message: `${reference.label} is required.` });
			continue;
		}
		let matches = memo.matches.get(name);
		if (!matches) {
			matches = new Map();
			memo.matches.set(name, matches);
		}
		let match = matches.get(lookup.key);
		if (!match) {
			match = reference.find(lookup.key);
			matches.set(lookup.key, match);
		}
		const key = questionKey({ reference: name, key: lookup.key });
		const answer = answers.get(key);
		consulted.set(key, answer);
		if (match.kind === 'one' && !answer) {
			refs[name] = match.option;
			continue;
		}
		if (match.kind === 'none' && reference.whenMissing === 'none-is-new' && !answer) continue;
		const question: RailQuestion = {
			key,
			reference: name,
			title: match.kind === 'many' ? `Which ${reference.label}?` : `Unknown ${reference.label}`,
			subject: lookup.display,
			rowCount: 1,
			accepts: {
				kind: 'pick',
				options: match.kind === 'many' ? match.candidates : withCreated(reference.options, memo.created.get(name)),
				canCreate: match.kind !== 'many' && reference.create !== undefined,
				suggested: match.kind === 'none' ? match.suggestion?.id : undefined
			},
			answer
		};
		questions.set(key, question);
		if (answer?.kind === 'skip') {
			skipped = { reason: `Skipped ${reference.label}: ${lookup.display}`, question: key };
			continue;
		}
		if (answer?.kind === 'pick') {
			const option =
				match.kind === 'many'
					? match.candidates.find((candidate) => candidate.id === answer.optionId)
					: memo.option(name, answer.optionId);
			if (option) {
				refs[name] = option;
				continue;
			}
		}
		problems.push({
			field: reference.reads[0] ?? '',
			message: answer ? 'That option is no longer available.' : `Choose ${reference.label} in the fix rail.`
		});
	}
	const resolved: Record<string, string> = {};
	for (const [name, reference] of Object.entries(lane.references)) {
		const option = refs[name];
		if (option && reference.reads.length === 1) resolved[reference.reads[0]] = option.label;
	}
	const unresolved = (): ReviewedRow<Change> => ({ row, outcome: 'fix', problems, questions: [...questions.keys()] });
	let review: ReviewedRow<Change>;
	if (skipped) review = { row, outcome: 'skipped', ...skipped };
	else if (problems.length) review = unresolved();
	else {
		const result = lane.review({
			values: values as RowValues<C>,
			refs: refs as ResolvedRefs<Refs>,
			parseDate: (raw) => parseImportDate(raw, row),
			ask: (question) => {
				const answer = answers.get(question.key);
				consulted.set(question.key, answer);
				questions.set(question.key, railQuestionFor(question, 1, answer));
				if (answer?.kind === 'skip') skipped = { reason: `Skipped: ${question.subject}`, question: question.key };
				return acceptedAnswer(question, answer, row);
			}
		});
		for (const question of result.outcome === 'fix' ? (result.questions ?? []) : []) {
			const answer = answers.get(question.key);
			consulted.set(question.key, answer);
			questions.set(question.key, railQuestionFor(question, 1, answer));
			if (answer?.kind === 'skip') skipped = { reason: `Skipped: ${question.subject}`, question: question.key };
		}
		const { shown, ...outcome } = result;
		Object.assign(resolved, shown);
		if (skipped) review = { row, outcome: 'skipped', ...skipped };
		else if (outcome.outcome === 'fix')
			review = { row, outcome: 'fix', problems: outcome.problems, questions: [...questions.keys()] };
		else if ([...questions.values()].some((question) => !acceptedAnswer(question, question.answer, row)))
			review = unresolved();
		else review = { row, ...outcome };
	}
	if (Object.keys(resolved).length) review = { ...review, resolved };
	return { review, consulted, questions: [...questions.values()] };
}

function withCreated(
	options: readonly ReferenceOption<unknown>[],
	created: ReadonlyMap<string, ReferenceOption<unknown>> | undefined
): readonly ReferenceOption<unknown>[] {
	if (!created?.size) return options;
	const listed = new Set(options.map((option) => option.id));
	return [...options, ...[...created.values()].filter((option) => !listed.has(option.id))];
}

export function reviewRows<C extends ImportColumns, Refs extends ImportReferences<C>, Change>(
	rows: readonly SourceRow[],
	lane: ImportLane<C, Refs, Change>,
	answers: ReadonlyMap<QuestionKey, Answer>,
	skipped: ReadonlySet<RowId>,
	memo: ReviewMemo<Change>
): ReviewState<Change> {
	if (memo.lane !== lane) {
		memo.resetLane(lane);
		for (const [name, reference] of Object.entries(lane.references))
			memo.options.set(name, new Map(reference.options.map((option) => [option.id, option])));
	}
	const questions = new Map<QuestionKey, RailQuestion>();
	const reviewed: ReviewedRow<Change>[] = [];
	const keys = new Map<string, number[]>();
	for (const row of rows) {
		if (skipped.has(row.id) || (row.pivot && skipped.has(sourceRowId(row.sheetIndex, row.rowNumber - 1)))) {
			reviewed.push({ row, outcome: 'skipped', reason: 'You skipped this row.' });
			continue;
		}
		let entry = memo.rows.get(row);
		if (!entry || [...entry.consulted].some(([key, value]) => answers.get(key) !== value)) {
			entry = reviewRow(row, lane, answers, memo);
			memo.rows.set(row, entry);
		}
		for (const question of entry.questions) {
			const aggregated = questions.get(question.key);
			if (aggregated) aggregated.rowCount++;
			else questions.set(question.key, { ...question, rowCount: 1 });
		}
		const result = entry.review;
		if ('key' in result) {
			const group = keys.get(result.key);
			if (group) group.push(reviewed.length);
			else keys.set(result.key, [reviewed.length]);
		}
		reviewed.push(result);
	}
	for (const indices of keys.values()) {
		if (indices.length < 2) continue;
		for (const index of indices) {
			const other = reviewed[indices[index === indices[0] ? 1 : 0]].row;
			reviewed[index] = {
				row: reviewed[index].row,
				resolved: reviewed[index].resolved,
				outcome: 'fix',
				problems: [
					{ field: '', message: `Same record as row ${other.rowNumber} on ${other.sheetName}. Skip one of these rows.` }
				],
				questions: []
			};
		}
	}
	holdRemovalsOfKeptRecords(reviewed);
	if (lane.inFileOverlap) holdInFileOverlaps(reviewed, lane.inFileOverlap, answers, questions);
	const counts: Record<Outcome, number> = { fix: 0, new: 0, update: 0, unchanged: 0, skipped: 0 };
	for (const row of reviewed) counts[row.outcome]++;
	const changeCount = counts.new + counts.update;
	return {
		rows: reviewed,
		questions: [...questions.values()],
		counts,
		changeCount,
		commitBlocker: counts.fix
			? `Fix ${counts.fix} rows before importing.`
			: changeCount
				? null
				: 'There are no changes to import.'
	};
}

function holdRemovalsOfKeptRecords<Change>(reviewed: ReviewedRow<Change>[]): void {
	const kept = new Map<string, number>();
	reviewed.forEach((item, index) => {
		if (item.outcome === 'unchanged') kept.set(item.key, index);
	});
	if (!kept.size) return;
	const held = new Map<number, string[]>();
	const hold = (index: number, message: string) => held.set(index, [...(held.get(index) ?? []), message]);
	reviewed.forEach((item, index) => {
		if (item.outcome !== 'update') return;
		for (const key of item.removes ?? []) {
			const keeper = kept.get(key);
			if (keeper === undefined) continue;
			const { row } = reviewed[keeper];
			hold(index, `Removes the record row ${row.rowNumber} on ${row.sheetName} keeps. Skip one of these rows.`);
			hold(keeper, `Row ${item.row.rowNumber} on ${item.row.sheetName} removes this record. Skip one of these rows.`);
		}
	});
	for (const [index, messages] of held) {
		const { row, resolved } = reviewed[index];
		reviewed[index] = {
			row,
			resolved,
			outcome: 'fix',
			problems: messages.map((message) => ({ field: '', message })),
			questions: []
		};
	}
}

function holdInFileOverlaps<Change>(
	reviewed: ReviewedRow<Change>[],
	rule: NonNullable<ImportLane<ImportColumns, ImportReferences<ImportColumns>, Change>['inFileOverlap']>,
	answers: ReadonlyMap<QuestionKey, Answer>,
	questions: Map<QuestionKey, RailQuestion>
): void {
	const groups = new Map<string, { index: number; change: Change }[]>();
	reviewed.forEach((item, index) => {
		if (item.outcome !== 'new' && item.outcome !== 'update') return;
		const key = rule.group(item.change);
		const group = groups.get(key);
		if (group) group.push({ index, change: item.change });
		else groups.set(key, [{ index, change: item.change }]);
	});
	if (!groups.size) return;
	const { question } = rule;
	const answer = answers.get(question.key);
	const keepBoth = acceptedAnswer(question, answer, reviewed[0].row) !== undefined;
	let rowCount = 0;
	for (const group of groups.values()) {
		const kept: typeof group = [];
		for (const item of group) {
			const partner = group.find((other) => other !== item && rule.overlaps(item.change, other.change));
			if (!partner) {
				kept.push(item);
				continue;
			}
			rowCount++;
			const earlier = kept.find((other) => rule.overlaps(item.change, other.change));
			if (keepBoth || (answer?.kind === 'skip' && !earlier)) {
				kept.push(item);
				continue;
			}
			const { row, resolved } = reviewed[item.index];
			const other = reviewed[(earlier ?? partner).index].row;
			const where = `row ${other.rowNumber} on ${other.sheetName}`;
			reviewed[item.index] =
				answer?.kind === 'skip'
					? { row, resolved, outcome: 'skipped', reason: `Overlaps ${where}.`, question: question.key }
					: {
							row,
							resolved,
							outcome: 'fix',
							problems: [
								{ field: '', message: `Overlaps ${where}. Keep both in the fix rail, or skip one of these rows.` }
							],
							questions: [question.key]
						};
		}
	}
	if (rowCount) questions.set(question.key, railQuestionFor(question, rowCount, answer));
}
