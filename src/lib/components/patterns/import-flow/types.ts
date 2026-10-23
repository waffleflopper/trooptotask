declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type RowId = Brand<string, 'RowId'>;

export type QuestionKey = Brand<string, 'QuestionKey'>;

export type IsoDate = Brand<string, 'IsoDate'>;

export type ValueKind = 'text' | 'date' | 'integer';

type ValueOf<K extends ValueKind> = K extends 'date' ? IsoDate : K extends 'integer' ? number : string;

export interface ImportColumn<K extends ValueKind = ValueKind> {
	label: string;
	kind: K;
	required?: boolean;

	aliases: readonly string[];

	example?: string;

	hint?: string;

	maxLength?: number;
}

export type ImportColumns = Record<string, ImportColumn>;

export type RowValues<C extends ImportColumns> = {
	[F in keyof C]: C[F] extends { required: true } ? ValueOf<C[F]['kind']> : ValueOf<C[F]['kind']> | null;
};

export interface ColumnSplitter<C extends ImportColumns> {
	label: string;
	aliases: readonly string[];
	fills: readonly (keyof C & string)[];

	split(raw: string): Partial<Record<keyof C & string, string>> | null;
	join?(values: Readonly<Partial<Record<keyof C & string, string>>>): string;
}

export interface PivotSpec<C extends ImportColumns> {
	field: keyof C & string;
	valueField: keyof C & string;

	label: string;
}

export interface ReferenceOption<T> {
	id: string;
	label: string;

	hint?: string;
	value: T;
}

export type ReferenceMatch<T> =
	| { kind: 'one'; option: ReferenceOption<T> }
	| { kind: 'many'; candidates: readonly ReferenceOption<T>[] }
	| { kind: 'none'; suggestion?: ReferenceOption<T> };

export type CreateOptionResult<T> =
	| { kind: 'created'; option: ReferenceOption<T> }
	| { kind: 'refused'; message: string };

export interface ImportReference<C extends ImportColumns, T> {
	label: string;

	reads: readonly (keyof C & string)[];

	key(raw: Partial<Record<keyof C & string, string>>): { key: string; display: string } | null;
	find(key: string): ReferenceMatch<T>;

	options: readonly ReferenceOption<T>[];

	whenMissing: 'ask' | 'none-is-new';

	required?: true;

	create?(name: string): Promise<CreateOptionResult<T>>;
}

export type ImportReferences<C extends ImportColumns> = Record<string, ImportReference<C, unknown>>;

type OptionValue<R> = R extends { options: readonly ReferenceOption<infer T>[] } ? T : never;

export type ResolvedRefs<Refs> = {
	[K in keyof Refs]: Refs[K] extends { required: true; whenMissing: 'ask' }
		? ReferenceOption<OptionValue<Refs[K]>>
		: ReferenceOption<OptionValue<Refs[K]>> | null;
};

export type Answer = { kind: 'pick'; optionId: string } | { kind: 'fill'; value: string } | { kind: 'skip' };

export interface LaneQuestion {
	key: QuestionKey;
	title: string;

	skipLabel?: string;

	subject: string;
	accepts: { kind: 'pick'; options: readonly { id: string; label: string }[] } | { kind: 'fill'; valueKind: 'date' };
}

export type Ask = (question: LaneQuestion) => Exclude<Answer, { kind: 'skip' }> | undefined;

export interface CellProblem<F extends string = string> {
	field: F;
	message: string;
}

export interface FieldDiff {
	label: string;
	field?: string;
	before: string;
	after: string;
}

export type RowReview<Change> = (
	| { outcome: 'new'; key: string; change: Change }
	| { outcome: 'update'; key: string; change: Change; diff: readonly FieldDiff[] }
	| { outcome: 'unchanged'; key: string }
	| { outcome: 'fix'; problems: readonly CellProblem[]; questions?: readonly LaneQuestion[] }
	| { outcome: 'skipped'; reason: string }
) & {
	shown?: Readonly<Record<string, string>>;
};

export interface ReviewInput<C extends ImportColumns, Refs> {
	values: RowValues<C>;
	refs: ResolvedRefs<Refs>;
	ask: Ask;
	parseDate(raw: string): IsoDate | null;
}

export type RowCommitResult = { kind: 'added' } | { kind: 'updated' } | { kind: 'failed'; reason: string };

export type ChunkReply =
	| { kind: 'saved'; results: readonly RowCommitResult[] }
	| { kind: 'refused'; message: string }
	| { kind: 'unconfirmed' };

export interface ImportLane<C extends ImportColumns, Refs extends ImportReferences<C>, Change> {
	id: string;
	noun: { one: string; other: string };
	intro?: { title: string; body: string };
	identity?: { fields: readonly (keyof C & string)[]; label(raw: Readonly<Record<string, string>>): string };
	savedIn?: string;
	columns: C;
	splitters?: readonly ColumnSplitter<C>[];
	pivot?: PivotSpec<C>;
	references: Refs;

	review(input: ReviewInput<C, Refs>): RowReview<Change>;

	commitChunk(changes: readonly Change[]): Promise<ChunkReply>;

	afterCommit?(): Promise<void>;
	exit: { href: string; label: string };
}

export function defineImportLane<C extends ImportColumns, Refs extends ImportReferences<C>, Change>(
	lane: ImportLane<C, Refs, Change>
): ImportLane<C, Refs, Change> {
	return lane;
}

export function questionKey(source: { reference: string; key: string } | { lane: string }): QuestionKey {
	return (
		'reference' in source
			? `ref:${encodeURIComponent(source.reference)}:${encodeURIComponent(source.key)}`
			: `ask:${encodeURIComponent(source.lane)}`
	) as QuestionKey;
}
