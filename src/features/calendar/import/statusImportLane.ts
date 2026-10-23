import { z } from 'zod';
import type { Personnel } from '$features/personnel/contracts';
import {
	defineImportLane,
	questionKey,
	type ChunkReply,
	type ColumnSplitter,
	type ImportReference,
	type LaneQuestion,
	type RowCommitResult,
	type RowReview
} from '$lib/components/patterns/import-flow';
import { fromDayNumber, toDayNumber } from '$lib/utils/dayNumber';
import { postImportChunk } from '$lib/utils/importChunkRequest';
import {
	AVAILABILITY_BATCH_LIMIT,
	type AvailabilityEntry,
	type AvailabilityImportEntry,
	type CalendarDateRange,
	type StatusType
} from '../contracts';
import { MAX_CALENDAR_RANGE_DAYS } from '../utils/calendarRange';
import { statusImportColumns as columns } from './statusImportColumns';
import { statusReference } from './statusReference';

export type StatusImportColumns = typeof columns;

export interface StatusImportSource {
	orgId: string;
	orgUrlSegment: string;
	person: ImportReference<StatusImportColumns, Personnel> & { required: true; whenMissing: 'ask' };
	nameSplitter: ColumnSplitter<StatusImportColumns>;
	statusTypes: readonly StatusType[];
	entries: readonly AvailabilityEntry[];
	/** Ranges already read for this import; outlives the lane, which is rebuilt as the stores change. */
	loaded: CalendarDateRange[];
	createStatusType?: (name: string) => Promise<StatusType | null>;
	reloadEntries(range: CalendarDateRange): Promise<void>;
}

const replySchema = z.object({
	added: z.number().int(),
	removed: z.number().int(),
	errors: z.array(z.object({ index: z.number().int(), message: z.string() }))
});

const OVERLAP_ANSWERS = { keep: 'keep', replace: 'replace' } as const;
const IN_FILE_QUESTION: LaneQuestion = {
	key: questionKey({ lane: 'in-file-overlap' }),
	title: 'Rows overlap each other',
	subject: 'One person, overlapping dates in this file',
	skipLabel: 'Skip the later rows',
	accepts: { kind: 'pick', options: [{ id: OVERLAP_ANSWERS.keep, label: 'Keep both' }] }
};
const OVERLAP_QUESTION: LaneQuestion = {
	key: questionKey({ lane: 'overlap' }),
	title: 'Rows overlap the calendar',
	subject: 'Dates already on the calendar',
	skipLabel: 'Keep the calendar, skip these rows',
	accepts: {
		kind: 'pick',
		options: [
			{ id: OVERLAP_ANSWERS.keep, label: 'Keep both' },
			{ id: OVERLAP_ANSWERS.replace, label: 'Replace the calendar entries' }
		]
	}
};

type DaySpan = [first: number, last: number];

function uncovered([first, last]: DaySpan, covered: readonly DaySpan[]): DaySpan[] {
	let open: DaySpan[] = [[first, last]];
	for (const [start, end] of covered)
		open = open.flatMap(([from, to]): DaySpan[] =>
			end < from || start > to
				? [[from, to]]
				: [...(from < start ? [[from, start - 1] as DaySpan] : []), ...(end < to ? [[end + 1, to] as DaySpan] : [])]
		);
	return open;
}

function calendarReadsCovering(
	ranges: readonly Partial<{ startDate: string; endDate: string }>[],
	loaded: readonly CalendarDateRange[] = []
): CalendarDateRange[] {
	const covered = loaded.map((range): DaySpan => [toDayNumber(range.rangeStart), toDayNumber(range.rangeEnd)]);
	const spans = ranges
		.flatMap(({ startDate, endDate }) => {
			const days = [startDate, endDate].filter((date): date is string => !!date).map(toDayNumber);
			return days.length ? uncovered([Math.min(...days), Math.max(...days)], covered) : [];
		})
		.sort((a, b) => a[0] - b[0]);
	const windows: number[][] = [];
	for (const [first, end] of spans) {
		let start = first;
		const last = windows.at(-1);
		if (last && end - last[0] < MAX_CALENDAR_RANGE_DAYS) {
			last[1] = Math.max(last[1], end);
			continue;
		}
		if (last && start <= last[1]) start = last[1] + 1;
		for (; end - start >= MAX_CALENDAR_RANGE_DAYS; start += MAX_CALENDAR_RANGE_DAYS)
			windows.push([start, start + MAX_CALENDAR_RANGE_DAYS - 1]);
		windows.push([start, end]);
	}
	return windows.map(([start, end]) => ({ rangeStart: fromDayNumber(start), rangeEnd: fromDayNumber(end) }));
}

function withinReplacementCap(entries: readonly AvailabilityImportEntry[]): AvailabilityImportEntry[][] {
	const parts: AvailabilityImportEntry[][] = [[]];
	let replaced = 0;
	for (const entry of entries) {
		const count = entry.overlap === 'replace' ? entry.replaces.length : 0;
		if (replaced + count > AVAILABILITY_BATCH_LIMIT && parts.at(-1)!.length) {
			parts.push([]);
			replaced = 0;
		}
		parts.at(-1)!.push(entry);
		replaced += count;
	}
	return parts;
}

const entryKey = (entry: Pick<AvailabilityEntry, 'personnelId' | 'statusTypeId' | 'startDate' | 'endDate'>) =>
	`${entry.personnelId}|${entry.statusTypeId}|${entry.startDate}|${entry.endDate}`;

const overlaps = (a: AvailabilityImportEntry, b: AvailabilityImportEntry) =>
	a.startDate <= b.endDate && a.endDate >= b.startDate;

export function createStatusImportLane(source: StatusImportSource) {
	const statusNames = new Map(source.statusTypes.map((status) => [status.id, status.name]));
	const saved = new Map<string, AvailabilityEntry[]>();
	for (const entry of source.entries) {
		const entries = saved.get(entry.personnelId);
		if (entries) entries.push(entry);
		else saved.set(entry.personnelId, [entry]);
	}
	const describe = (entry: AvailabilityEntry) =>
		`${entry.startDate} → ${entry.endDate} ${statusNames.get(entry.statusTypeId) ?? 'Status'}`;
	const written = new Map<string, AvailabilityImportEntry[]>();

	async function post(entries: readonly AvailabilityImportEntry[]): Promise<Exclude<ChunkReply, { kind: 'stopped' }>> {
		const sent = entries.map((entry) => {
			const alongside = (written.get(entry.personnelId) ?? [])
				.filter((other) => overlaps(other, entry))
				.map(({ statusTypeId, startDate, endDate }) => ({ statusTypeId, startDate, endDate }));
			return alongside.length ? { ...entry, alongside } : entry;
		});
		for (const entry of entries) {
			const person = written.get(entry.personnelId);
			if (person) person.push(entry);
			else written.set(entry.personnelId, [entry]);
		}
		const reply = await postImportChunk(
			`/org/${source.orgId}/api/availability/import`,
			{ entries: sent },
			{ fallbackMessage: 'These statuses could not be imported.', schema: replySchema }
		);
		if (reply.kind !== 'saved') return reply;
		const failures = new Map(reply.data.errors.map((error) => [error.index, error.message]));
		return {
			kind: 'saved',
			results: entries.map((entry, index): RowCommitResult => {
				const reason = failures.get(index);
				if (reason !== undefined) return { kind: 'failed', reason };
				return { kind: entry.overlap === 'replace' ? 'updated' : 'added' };
			})
		};
	}

	async function commitChunk(entries: readonly AvailabilityImportEntry[]): Promise<ChunkReply> {
		const results: RowCommitResult[] = [];
		for (const part of withinReplacementCap(entries)) {
			const reply = await post(part);
			if (reply.kind !== 'saved') {
				results.push(
					...part.map(
						(): RowCommitResult =>
							reply.kind === 'unconfirmed' ? { kind: 'unconfirmed' } : { kind: 'failed', reason: reply.message }
					)
				);
				return { kind: 'stopped', results, stop: reply };
			}
			results.push(...reply.results);
		}
		return { kind: 'saved', results };
	}

	return defineImportLane({
		id: 'calendar-statuses',
		noun: { one: 'status', other: 'statuses' },
		intro: {
			title: 'One row per status',
			body: 'Each row puts one person on a status for a range of days. Rows already on the calendar are left alone, and a saved entry is only removed when you choose to replace one the file overlaps.'
		},
		identity: {
			columnLabel: 'Person',
			fields: ['lastName', 'firstName'],
			label: (raw) => [raw.rank, [raw.lastName, raw.firstName].filter(Boolean).join(', ')].filter(Boolean).join(' ')
		},
		columns,
		splitters: [source.nameSplitter],
		references: {
			person: source.person,
			status: statusReference(source.statusTypes, source.createStatusType)
		},
		async beforeReview(rows) {
			for (const range of calendarReadsCovering(rows, source.loaded)) {
				await source.reloadEntries(range);
				source.loaded.push(range);
			}
		},
		review({ values, refs, ask }): RowReview<AvailabilityImportEntry> {
			const { startDate, endDate } = values;
			if (endDate < startDate)
				return { outcome: 'fix', problems: [{ field: 'endDate', message: 'To is before From.' }] };
			const person = refs.person.value;
			const status = refs.status.value;
			const key = entryKey({ personnelId: person.id, statusTypeId: status.id, startDate, endDate });
			const overlapping = (saved.get(person.id) ?? [])
				.filter((entry) => entry.startDate <= endDate && entry.endDate >= startDate)
				.sort((a, b) => a.startDate.localeCompare(b.startDate));
			if (
				overlapping.some(
					(entry) => entry.statusTypeId === status.id && entry.startDate === startDate && entry.endDate === endDate
				)
			)
				return { outcome: 'unchanged', key };
			const entry = {
				personnelId: person.id,
				statusTypeId: status.id,
				startDate,
				endDate,
				note: values.note
			};
			if (!overlapping.length) return { outcome: 'new', key, change: { ...entry, overlap: 'none' } };
			const answer = ask(OVERLAP_QUESTION);
			if (answer?.kind !== 'pick') {
				const message = `Overlaps ${overlapping.map(describe).join(', ')}. Choose what happens in the fix rail.`;
				return {
					outcome: 'fix',
					problems: [
						{ field: 'startDate', message },
						{ field: 'endDate', message }
					]
				};
			}
			if (answer.optionId === OVERLAP_ANSWERS.keep)
				return { outcome: 'new', key, change: { ...entry, overlap: 'keep' } };
			if (overlapping.length > AVAILABILITY_BATCH_LIMIT)
				return {
					outcome: 'fix',
					problems: [
						{
							field: 'startDate',
							message: 'This row overlaps too many saved entries to replace in one import. Choose Keep both or Skip.'
						}
					]
				};
			return {
				outcome: 'update',
				key,
				change: {
					...entry,
					overlap: 'replace',
					replaces: overlapping.map(({ id, statusTypeId, startDate, endDate, note }) => ({
						id,
						statusTypeId,
						startDate,
						endDate,
						note: note ?? null
					}))
				},
				diff: overlapping.map((entry) => ({ label: 'Replaces', before: describe(entry), after: '' })),
				removes: overlapping.map(entryKey)
			};
		},
		inFileOverlap: {
			group: (entry) => entry.personnelId,
			overlaps,
			question: IN_FILE_QUESTION
		},
		commitChunk,
		async afterCommit() {
			const entries = [...written.values()].flat();
			written.clear();
			for (const range of calendarReadsCovering(entries)) await source.reloadEntries(range);
		},
		savedIn: 'the calendar',
		exit: { href: `/org/${source.orgUrlSegment}/calendar`, label: 'Open the calendar' }
	});
}
