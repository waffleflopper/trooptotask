import { invalidate } from '$app/navigation';
import { z } from 'zod';
import type { Personnel } from '$features/personnel/contracts';
import {
	defineImportLane,
	questionKey,
	type ChunkReply,
	type ColumnSplitter,
	type FieldDiff,
	type ImportReference,
	type IsoDate,
	type LaneQuestion,
	type ReferenceOption,
	type RowCommitResult,
	type RowReview
} from '$lib/components/patterns/import-flow';
import { postImportChunk } from '$lib/utils/importChunkRequest';
import type { TrainingBatchRecord } from '../contracts';
import type { PersonnelTraining, TrainingType } from '../training.types';
import { trainingImportColumns as columns } from './trainingImportColumns';

export type TrainingImportColumns = typeof columns;

export interface TrainingImportSource {
	orgId: string;
	orgUrlSegment: string;
	person: ImportReference<TrainingImportColumns, Personnel> & { required: true; whenMissing: 'ask' };
	nameSplitter: ColumnSplitter<TrainingImportColumns>;
	trainingTypes: readonly TrainingType[];
	trainings: readonly PersonnelTraining[];
	canConfigureRequirements: boolean;
}

export type TrainingImportChange = TrainingBatchRecord & { op: 'add' | 'update' };

type Mark =
	| { kind: 'date'; date: IsoDate }
	| { kind: 'x' }
	| { kind: 'exempt' }
	| { kind: 'bad-date' }
	| { kind: 'unknown' };

const X_MARKS = new Set(['x', 'yes', 'y', '✓', '✔', '✔️', 'check', 'done', 'complete', 'completed', 'true']);
const EXEMPT_MARKS = new Set(['exempt', 'exempted', 'e', 'n/a', 'na']);
const EXEMPT_LABEL = 'Exempt';

const replySchema = z.object({
	inserted: z.array(z.unknown()),
	updated: z.array(z.unknown()),
	exempted: z.array(z.unknown()),
	errors: z.array(z.object({ index: z.number().int(), message: z.string() }))
});

function readMark(raw: string, parseDate: (raw: string) => IsoDate | null): Mark {
	if (/^\d{1,4}$/.test(raw.trim())) return { kind: 'bad-date' };
	const date = parseDate(raw);
	if (date) return { kind: 'date', date };
	const mark = raw.trim().toLowerCase().replace(/\.$/, '');
	if (X_MARKS.has(mark)) return { kind: 'x' };
	if (EXEMPT_MARKS.has(mark)) return { kind: 'exempt' };
	return /\d/.test(mark) ? { kind: 'bad-date' } : { kind: 'unknown' };
}

function typeKey(name: string): string {
	return name
		.normalize('NFKD')
		.toLowerCase()
		.replace(/[^a-z0-9]/g, '');
}

function trainingTypeReference(
	types: readonly TrainingType[]
): ImportReference<TrainingImportColumns, TrainingType> & { required: true; whenMissing: 'ask' } {
	const option = (type: TrainingType): ReferenceOption<TrainingType> => ({
		id: type.id,
		label: type.name,
		value: type
	});
	const byKey = new Map(types.map((type) => [typeKey(type.name), type]));
	return {
		label: 'training type',
		reads: ['training'],
		required: true,
		whenMissing: 'ask',
		options: types.map(option),
		key(raw) {
			const display = raw.training?.trim();
			const key = display ? typeKey(display) : '';
			return key && display ? { key, display } : null;
		},
		find(key) {
			const type = byKey.get(key);
			if (type) return { kind: 'one', option: option(type) };
			const near = types.filter((candidate) => {
				const candidateKey = typeKey(candidate.name);
				return candidateKey.includes(key) || key.includes(candidateKey);
			});
			return near.length === 1 ? { kind: 'none', suggestion: option(near[0]) } : { kind: 'none' };
		}
	};
}

async function commitChunk(orgId: string, changes: readonly TrainingImportChange[]): Promise<ChunkReply> {
	const records: TrainingBatchRecord[] = changes.map(({ op: _op, ...record }) => record);
	const reply = await postImportChunk(
		`/org/${orgId}/api/personnel-trainings/batch`,
		{ records },
		{ fallbackMessage: 'These training records could not be imported.', schema: replySchema }
	);
	if (reply.kind !== 'saved') return reply;
	const failures = new Map(reply.data.errors.map((error) => [error.index, error.message]));
	return {
		kind: 'saved',
		results: changes.map((change, index): RowCommitResult => {
			const reason = failures.get(index);
			if (reason !== undefined) return { kind: 'failed', reason };
			return { kind: change.op === 'add' ? 'added' : 'updated' };
		})
	};
}

export function createTrainingImportLane(source: TrainingImportSource) {
	const existing = new Map(
		source.trainings.map((record) => [`${record.personnelId}:${record.trainingTypeId}`, record])
	);
	const exemptAccess: LaneQuestion = {
		key: questionKey({ lane: 'exempt-access' }),
		title: 'Exempt marks need access to training requirements',
		subject: EXEMPT_LABEL,
		skipLabel: 'Leave exempt marks out',
		accepts: { kind: 'pick', options: [] }
	};
	return defineImportLane({
		id: 'training',
		noun: { one: 'completion', other: 'completions' },
		intro: {
			title: 'One row per completion, or one column per training',
			body: 'A date in a cell is a completion. X or yes asks you once per training for the date. Exempt or N/A marks the person exempt. Blank cells never clear a saved record.'
		},
		identity: {
			fields: ['lastName', 'firstName'],
			label: (raw) => [raw.lastName, raw.firstName].filter(Boolean).join(', ')
		},
		columns,
		splitters: [source.nameSplitter],
		pivot: { field: 'training', valueField: 'completed', label: 'Training' },
		references: {
			person: source.person,
			training: trainingTypeReference(source.trainingTypes)
		},
		review({ values, refs, ask, parseDate }): RowReview<TrainingImportChange> {
			const person = refs.person.value;
			const type = refs.training.value;
			const key = `${person.id}:${type.id}`;
			if (!values.completed?.trim()) return { outcome: 'skipped', reason: 'No completion date.' };
			const mark = readMark(values.completed, parseDate);
			if (mark.kind === 'bad-date')
				return { outcome: 'fix', problems: [{ field: 'completed', message: 'Enter a date like 2026-03-11.' }] };

			if (mark.kind === 'exempt') {
				if (!type.canBeExempted)
					return {
						outcome: 'fix',
						problems: [{ field: 'completed', message: `${type.name} can't be marked exempt.` }]
					};
				if (type.exemptPersonnelIds.includes(person.id))
					return { outcome: 'unchanged', key, shown: { completed: EXEMPT_LABEL } };
				if (!source.canConfigureRequirements)
					return {
						outcome: 'fix',
						problems: [
							{ field: '', message: 'Marking someone exempt needs permission to configure training requirements.' }
						],
						questions: [exemptAccess]
					};
				return {
					outcome: 'new',
					key,
					shown: { completed: EXEMPT_LABEL },
					change: { op: 'add', personnelId: person.id, trainingTypeId: type.id, completionDate: null, status: 'exempt' }
				};
			}

			let date: IsoDate | null = mark.kind === 'date' ? mark.date : null;
			if (mark.kind !== 'date') {
				const dateLabel = type.expirationDateOnly ? 'Expiration date' : 'Date';
				const answer =
					mark.kind === 'x'
						? ask({
								key: questionKey({ lane: `x:${type.id}` }),
								title: `${dateLabel} for ${type.name} X marks`,
								subject: values.completed.trim(),
								skipLabel: 'Leave these X marks out',
								accepts: { kind: 'fill', valueKind: 'date' }
							})
						: ask({
								key: questionKey({ lane: `mark:${values.completed.trim().toLowerCase()}` }),
								title: `${dateLabel} for this mark`,
								subject: values.completed.trim(),
								skipLabel: 'Leave these cells out',
								accepts: { kind: 'fill', valueKind: 'date' }
							});
				date = answer?.kind === 'fill' ? parseDate(answer.value) : null;
			}
			if (!date)
				return {
					outcome: 'fix',
					problems: [{ field: 'completed', message: 'Choose a date for this mark in the fix rail.' }]
				};

			const shown = { completed: date };
			const note = values.note;
			const saved = existing.get(key);
			if (!saved)
				return {
					outcome: 'new',
					key,
					shown,
					change: {
						op: 'add',
						personnelId: person.id,
						trainingTypeId: type.id,
						completionDate: date,
						...(note ? { notes: note } : {}),
						status: 'completed'
					}
				};
			const savedDate = (type.expirationDateOnly ? saved.expirationDate : saved.completionDate) ?? '';
			const diff: FieldDiff[] = [];
			if (date !== savedDate)
				diff.push({
					label: type.expirationDateOnly ? 'Expires' : columns.completed.label,
					field: 'completed',
					before: savedDate,
					after: date
				});
			if (note && note !== (saved.notes ?? ''))
				diff.push({ label: columns.note.label, before: saved.notes ?? '', after: note });
			if (!diff.length) return { outcome: 'unchanged', key, shown };
			const notes = note ?? saved.notes;
			return {
				outcome: 'update',
				key,
				shown,
				diff,
				change: {
					op: 'update',
					personnelId: person.id,
					trainingTypeId: type.id,
					completionDate: date,
					...(notes ? { notes } : {}),
					status: 'completed'
				}
			};
		},
		commitChunk: (changes) => commitChunk(source.orgId, changes),
		afterCommit: () => invalidate('app:training-data'),
		savedIn: 'the training tracker',
		exit: { href: `/org/${source.orgUrlSegment}/training`, label: 'Open training' }
	});
}
