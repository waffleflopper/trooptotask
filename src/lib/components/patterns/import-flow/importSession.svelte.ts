import { SvelteMap } from 'svelte/reactivity';
import type { Answer, ImportColumns, ImportLane, ImportReferences, QuestionKey, RowId } from './types';
import type { ColumnTarget, HeaderKey, Layout, LoadedFile } from './workbookSource';
import {
	ACCEPTED_EXTENSIONS,
	detectLayout,
	extendColumnTargets,
	missingRequiredFields,
	readImportFile
} from './workbookSource';
import {
	applyEdits,
	buildSourceRows,
	ReviewMemo,
	reviewRows,
	type Outcome,
	type ReviewState,
	type SourceRow
} from './rowModel';
import { buildReceipt, runCommit, type CommitProgress, type PlannedChange, type Receipt } from './commit';
import { downloadNotImported, downloadTemplate } from './workbooks';
import { emptyMap, emptySet, indexBy, withEntries, withEntry, withMember } from './collections';

export type Phase =
	| { step: 'file'; error: string | null; reading: boolean }
	| { step: 'columns' }
	| { step: 'review' }
	| { step: 'committing'; progress: CommitProgress }
	| { step: 'done'; receipt: Receipt };
export type ReviewFilter = Outcome | 'all';

export class ImportSession<C extends ImportColumns, Refs extends ImportReferences<C>, Change> {
	#generation = 0;
	#memo = new ReviewMemo<Change>();
	file = $state.raw<LoadedFile | null>(null);
	layout = $state.raw<Layout | null>(null);
	skipped = $state.raw<ReadonlySet<RowId>>(emptySet());
	edits = $state.raw<ReadonlyMap<RowId, Readonly<Record<string, string>>>>(emptyMap());
	answers = $state.raw<ReadonlyMap<QuestionKey, Answer>>(emptyMap());
	phase = $state.raw<Phase>({ step: 'file', error: null, reading: false });
	filter = $state.raw<ReviewFilter>('all');
	creating = new SvelteMap<QuestionKey, true>();

	constructor(private readonly getLane: () => ImportLane<C, Refs, Change>) {}
	get lane(): ImportLane<C, Refs, Change> {
		return this.getLane();
	}

	readonly sourceRows: readonly SourceRow[] = $derived.by(() =>
		this.file && this.layout ? buildSourceRows(this.file, this.layout, this.lane) : []
	);
	readonly review: ReviewState<Change> = $derived.by(() =>
		reviewRows(applyEdits(this.sourceRows, this.edits), this.lane, this.answers, this.skipped, this.#memo)
	);
	readonly columnBlockers: readonly string[] = $derived.by(() => {
		if (!this.file || !this.layout) return ['Choose a file first.'];
		const included = this.layout.sheets.filter((sheet) => sheet.included);
		if (!included.length) return ['Include at least one sheet.'];
		const problems = missingRequiredFields(this.layout, this.file, this.lane).map(
			(column) => `Map a column to ${column.label} on every included sheet.`
		);
		if (included.some((sheet) => sheet.headerRow === null))
			problems.unshift('Choose a header row for every included sheet.');
		return problems;
	});
	readonly commitBlocker: string | null = $derived(this.columnBlockers[0] ?? this.review.commitBlocker);
	readonly dirty: boolean = $derived(this.file !== null && this.phase.step !== 'done');

	async chooseFile(files: readonly File[]): Promise<void> {
		if (this.phase.step === 'committing') return;
		this.startOver();
		const generation = this.#generation;
		const file = files.find((candidate) =>
			ACCEPTED_EXTENSIONS.some((extension) => candidate.name.toLowerCase().endsWith(extension))
		);
		if (!file) {
			this.phase = { step: 'file', error: 'Choose an .xlsx, .csv, or .tsv file.', reading: false };
			return;
		}
		this.phase = { step: 'file', error: null, reading: true };
		const result = await readImportFile(file);
		if (generation !== this.#generation) return;
		if (result.kind === 'rejected') {
			this.phase = { step: 'file', error: result.message, reading: false };
			return;
		}
		this.file = result.file;
		this.layout = detectLayout(result.file, this.lane);
		this.phase = { step: 'columns' };
	}

	startOver(): void {
		this.#generation++;
		this.#memo.clear();
		this.file = null;
		this.layout = null;
		this.skipped = emptySet();
		this.edits = emptyMap();
		this.answers = emptyMap();
		this.creating.clear();
		this.filter = 'all';
		this.phase = { step: 'file', error: null, reading: false };
	}

	setSheetIncluded(sheetIndex: number, included: boolean): void {
		if (!this.file || !this.layout || this.phase.step === 'committing' || this.phase.step === 'done') return;
		this.layout = extendColumnTargets(
			{
				...this.layout,
				sheets: this.layout.sheets.map((sheet, index) => (index === sheetIndex ? { ...sheet, included } : sheet))
			},
			this.file,
			this.lane
		);
	}
	setHeaderRow(sheetIndex: number, headerRow: number): void {
		if (!this.file || !this.layout || this.phase.step === 'committing' || this.phase.step === 'done') return;
		if (!Number.isInteger(headerRow) || headerRow < 0 || headerRow >= (this.file.sheets[sheetIndex]?.rows.length ?? 0))
			return;
		this.layout = extendColumnTargets(
			{
				...this.layout,
				sheets: this.layout.sheets.map((sheet, index) => (index === sheetIndex ? { ...sheet, headerRow } : sheet))
			},
			this.file,
			this.lane
		);
	}
	setColumnTarget(header: HeaderKey, target: ColumnTarget): void {
		if (!this.layout || this.phase.step === 'committing' || this.phase.step === 'done') return;
		this.layout = { ...this.layout, columns: withEntry(this.layout.columns, header, target) };
	}
	setRowSkipped(rowId: RowId, skipped: boolean): void {
		if (this.phase.step === 'committing' || this.phase.step === 'done') return;
		this.skipped = withMember(this.skipped, rowId, skipped);
	}
	editCell(rowId: RowId, field: keyof C & string, value: string): void {
		if (this.phase.step === 'committing' || this.phase.step === 'done') return;
		const row = this.sourceRows.find((item) => item.id === rowId);
		if (!row) return;
		const shared = row.pivot && field !== row.pivot.field && field !== row.pivot.valueField;
		const targets = shared
			? this.sourceRows.filter((item) => item.sheetIndex === row.sheetIndex && item.rowNumber === row.rowNumber)
			: [row];
		this.edits = withEntries(
			this.edits,
			targets.map((item) => [item.id, { ...this.edits.get(item.id), [field]: value }] as const)
		);
	}
	answer(key: QuestionKey, answer: Answer | null): void {
		if (this.phase.step === 'committing' || this.phase.step === 'done') return;
		this.answers = withEntry(this.answers, key, answer ?? undefined);
	}

	async createOption(key: QuestionKey, name: string): Promise<{ refused: string } | null> {
		if (this.phase.step !== 'review' && this.phase.step !== 'columns') return null;
		if (this.creating.has(key)) return null;
		const question = this.review.questions.find((item) => item.key === key);
		const referenceName = question?.reference;
		const reference = referenceName ? this.lane.references[referenceName] : undefined;
		if (!referenceName || !reference?.create) return { refused: 'This value cannot be created here.' };
		const generation = this.#generation;
		const previousAnswer = this.answers.get(key);
		this.creating.set(key, true);
		try {
			const result = await reference.create(name);
			if (generation !== this.#generation) return null;
			if (result.kind === 'refused') return { refused: result.message };
			this.#memo.addCreated(referenceName, result.option);
			if (this.answers.get(key) === previousAnswer) this.answer(key, { kind: 'pick', optionId: result.option.id });
			return null;
		} catch (error) {
			if (generation !== this.#generation) return null;
			return { refused: error instanceof Error ? error.message : 'The value could not be created.' };
		} finally {
			if (generation === this.#generation) this.creating.delete(key);
		}
	}

	goTo(step: 'file' | 'columns' | 'review'): void {
		if (this.phase.step === 'committing') return;
		if (this.phase.step === 'done') {
			this.startOver();
			return;
		}
		if (step === 'file') {
			this.phase = { step, error: null, reading: false };
			return;
		}
		if (!this.file || !this.layout || (step === 'review' && this.columnBlockers.length)) return;
		this.phase = { step };
	}

	async commit(): Promise<void> {
		if (this.phase.step !== 'review' || this.commitBlocker || this.creating.size) return;
		const generation = this.#generation;
		const isCurrent = () => generation === this.#generation;
		const lane = this.lane;
		const review = this.review;
		const changes: PlannedChange<Change>[] = review.rows.flatMap((item) =>
			item.outcome === 'new' || item.outcome === 'update' ? [{ rowId: item.row.id, change: item.change }] : []
		);
		this.phase = { step: 'committing', progress: { sent: 0, total: changes.length } };
		const result = await runCommit(
			changes,
			(chunk) => lane.commitChunk(chunk),
			(progress) => {
				if (isCurrent()) this.phase = { step: 'committing', progress };
			},
			isCurrent
		);
		if (!isCurrent()) return;
		let receipt = buildReceipt(
			review.rows.flatMap((item) => (item.outcome === 'skipped' ? [{ row: item.row, reason: item.reason }] : [])),
			result.results,
			indexBy(
				review.rows.map((item) => item.row),
				(row) => row.id
			),
			result.stopped,
			review.counts.unchanged
		);
		try {
			await lane.afterCommit?.();
			if (!isCurrent()) return;
		} catch (error) {
			if (!isCurrent()) return;
			receipt = {
				...receipt,
				refreshError: error instanceof Error ? error.message : 'The saved data could not be refreshed.'
			};
		}
		this.phase = { step: 'done', receipt };
	}

	async downloadTemplate(): Promise<void> {
		const generation = this.#generation;
		await downloadTemplate(this.lane, () => generation === this.#generation);
	}
	async downloadNotImported(): Promise<void> {
		if (!this.file || !this.layout || this.phase.step !== 'done') return;
		const generation = this.#generation;
		await downloadNotImported(this.file, this.layout, this.phase.receipt, () => generation === this.#generation);
	}
}
