import { z } from 'zod';
import { formatDayMonth, formatDayMonthYear } from '$lib/utils/dates';
import { dateOnlySchema } from '$lib/utils/inputSchemas';

/** An entry as it was saved: labels taken when it was written, never looked up when it is read. */
export interface SavedAuditEntry {
	action: string;
	recordLabel: string | null;
	subjectLabel: string | null;
	details: Record<string, unknown> | null;
}

export interface AuditSentenceContext {
	/** "YYYY-MM-DD" the entry was written, in the viewer's time zone. A date in another year shows its year. */
	loggedOn: string;
}

/** One kind of entry: what it must carry, how it reads, and how several from one action read together. */
export interface AuditKind {
	/** The sentence, or null when the saved entry lacks something the kind requires. */
	read(entry: SavedAuditEntry, context: AuditSentenceContext): string | null;
	batch: { verb: string; one: string; many: string };
}

/**
 * `entry` declares what the kind requires: `record` and `subject` are the saved record and person labels, `details`
 * the saved details. Free text such as notes and reasons is never part of a kind.
 */
function auditKind<Schema extends z.ZodType>(spec: {
	entry: Schema;
	sentence(entry: z.infer<Schema>, context: AuditSentenceContext): string;
	batch: AuditKind['batch'];
}): AuditKind {
	return {
		batch: spec.batch,
		read(saved, context) {
			const parsed = spec.entry.safeParse({
				record: saved.recordLabel,
				subject: saved.subjectLabel,
				details: saved.details ?? {}
			});
			return parsed.success ? spec.sentence(parsed.data, context) : null;
		}
	};
}

const savedLabel = z.string().trim().min(1);
const labelChange = z.object({ from: savedLabel.nullable(), to: savedLabel.nullable() });
const dateChange = z.object({ from: dateOnlySchema, to: dateOnlySchema });
const span = { startDate: dateOnlySchema, endDate: dateOnlySchema };

function day(date: string, { loggedOn }: AuditSentenceContext): string {
	return date.slice(0, 4) === loggedOn.slice(0, 4) ? formatDayMonth(date) : formatDayMonthYear(date);
}

/** "10–20 Nov", "28 Nov–3 Dec", or "10 Nov" for one day. */
function range(start: string, end: string, context: AuditSentenceContext): string {
	if (start === end) return day(start, context);
	if (start.slice(0, 4) !== end.slice(0, 4)) return `${formatDayMonthYear(start)}–${formatDayMonthYear(end)}`;
	const first = start.slice(0, 7) === end.slice(0, 7) ? String(Number(start.slice(8, 10))) : formatDayMonth(start);
	return `${first}–${day(end, context)}`;
}

/** "from 10 Nov to 20 Nov", or "on 10 Nov" for one day. */
function fromTo(start: string, end: string, context: AuditSentenceContext): string {
	return start === end ? `on ${day(start, context)}` : `from ${day(start, context)} to ${day(end, context)}`;
}

const availabilityEntry = z.object({ record: savedLabel, subject: savedLabel, details: z.object(span) });
const availabilityChange = z.object({
	record: savedLabel,
	subject: savedLabel,
	details: z.object({
		...span,
		change: z
			.object({
				person: labelChange.optional(),
				status: labelChange.optional(),
				startDate: dateChange.optional(),
				endDate: dateChange.optional(),
				note: z.object({ withheld: z.literal(true) }).optional()
			})
			.refine((change) => Object.values(change).some(Boolean))
	})
});
const availabilityNoun = { one: 'availability entry', many: 'availability entries' };

function availabilityUpdated(
	{ record, subject, details }: z.infer<typeof availabilityChange>,
	context: AuditSentenceContext
): string {
	const { change, startDate, endDate } = details;
	const status = change.status ? `${change.status.from ?? 'an entry'} to ${record}` : record;
	const person = change.person?.from ? `${subject} (moved from ${change.person.from})` : subject;
	const now = range(startDate, endDate, context);
	if (!change.status && !change.person && !change.startDate && !change.endDate) {
		return `Changed the note on ${record} for ${subject} on ${now}`;
	}
	const dates =
		change.startDate || change.endDate
			? ` from ${range(change.startDate?.from ?? startDate, change.endDate?.from ?? endDate, context)} to ${now}`
			: ` on ${now}`;
	return `Changed ${status} for ${person}${dates}${change.note ? ', and its note' : ''}`;
}

/** Every cataloged kind. A kind written here is read only from its saved labels. */
export const AUDIT_KINDS = {
	'availability.created': auditKind({
		entry: availabilityEntry,
		sentence: ({ record, subject, details }, context) =>
			`Added ${record} for ${subject} ${fromTo(details.startDate, details.endDate, context)}`,
		batch: { verb: 'Added', ...availabilityNoun }
	}),
	'availability.updated': auditKind({
		entry: availabilityChange,
		sentence: availabilityUpdated,
		batch: { verb: 'Changed', ...availabilityNoun }
	}),
	'availability.deleted': auditKind({
		entry: availabilityEntry,
		sentence: ({ record, subject, details }, context) =>
			`Deleted ${record} for ${subject} ${fromTo(details.startDate, details.endDate, context)}`,
		batch: { verb: 'Deleted', ...availabilityNoun }
	})
} as const satisfies Record<string, AuditKind>;

export type AuditKindName = keyof typeof AUDIT_KINDS;

export function auditKindOf(action: string): AuditKind | undefined {
	return Object.hasOwn(AUDIT_KINDS, action) ? AUDIT_KINDS[action as AuditKindName] : undefined;
}

/** The cataloged sentence for a saved entry, or null for an uncataloged action or an entry missing what its kind requires. */
export function catalogSentence(entry: SavedAuditEntry, context: AuditSentenceContext): string | null {
	return auditKindOf(entry.action)?.read(entry, context) ?? null;
}

/**
 * One line for entries a single action wrote: "Added 3 availability entries, deleted 1 availability entry".
 * `partial` marks an action whose older entries were not loaded, so each count is a floor.
 */
export function batchSentence(actions: readonly string[], { partial = false } = {}): string {
	const counts = new Map<string, number>();
	for (const action of actions) counts.set(action, (counts.get(action) ?? 0) + 1);
	return [...counts]
		.map(([action, count], index) => {
			const kind = auditKindOf(action)?.batch ?? { verb: 'Recorded', one: 'entry', many: 'entries' };
			const verb = index === 0 ? kind.verb : kind.verb.toLowerCase();
			return `${verb} ${partial ? 'at least ' : ''}${count.toLocaleString('en-US')} ${count === 1 ? kind.one : kind.many}`;
		})
		.join(', ');
}
