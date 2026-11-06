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

/** What a kind requires of an entry: the saved record and person labels, and the saved details. */
export interface AuditEntryShape {
	record: string | null;
	subject: string | null;
	details: Record<string, unknown>;
}

/**
 * One kind of entry: what it must carry, how it reads, and how several from one action read together.
 * `database` kinds are written by a trigger in the transaction that changes the record, `app` kinds by the server.
 * `retired` kinds are no longer written; they stay so entries already saved keep reading as they did.
 */
export interface AuditKind {
	readonly writer: 'database' | 'app' | 'retired';
	accept(entry: AuditEntryShape): AuditEntryShape | null;
	read(entry: SavedAuditEntry, context: AuditSentenceContext): string | null;
	readonly batch: { verb: string; one: string; many: string };
}

/**
 * `entry` declares what the kind requires: `record` and `subject` are the saved record and person labels, `details`
 * the saved details. Free text such as notes and reasons is never part of a kind.
 */
export function auditKind<Schema extends z.ZodType>(spec: {
	writer: AuditKind['writer'];
	entry: Schema;
	sentence(entry: z.infer<Schema>, context: AuditSentenceContext): string;
	batch: AuditKind['batch'];
}): AuditKind {
	return {
		writer: spec.writer,
		batch: spec.batch,
		accept(entry) {
			const parsed = spec.entry.safeParse(entry);
			if (!parsed.success) return null;
			const kept = parsed.data as Partial<AuditEntryShape>;
			return { record: kept.record ?? null, subject: kept.subject ?? null, details: kept.details ?? {} };
		},
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

export const savedLabel = z.string().trim().min(1);
export const optionalLabel = savedLabel.nullable();
export const labelChange = z.object({ from: optionalLabel, to: optionalLabel });
export const dateChange = z.object({ from: dateOnlySchema.nullable(), to: dateOnlySchema.nullable() });
export const numberChange = z.object({ from: z.number().nullable(), to: z.number().nullable() });
export const withheld = z.object({ withheld: z.literal(true) });

export function changeOf<Shape extends z.ZodRawShape>(shape: Shape) {
	return z.object(shape).refine((change) => Object.values(change).some((field) => field !== undefined));
}

export function day(date: string, { loggedOn }: AuditSentenceContext): string {
	return date.slice(0, 4) === loggedOn.slice(0, 4) ? formatDayMonth(date) : formatDayMonthYear(date);
}

/** "10–20 Nov", "28 Nov–3 Dec", or "10 Nov" for one day. */
export function range(start: string, end: string, context: AuditSentenceContext): string {
	if (start === end) return day(start, context);
	if (start.slice(0, 4) !== end.slice(0, 4)) return `${formatDayMonthYear(start)}–${formatDayMonthYear(end)}`;
	const first = start.slice(0, 7) === end.slice(0, 7) ? String(Number(start.slice(8, 10))) : formatDayMonth(start);
	return `${first}–${day(end, context)}`;
}

/** "from 10 Nov to 20 Nov", or "on 10 Nov" for one day. */
export function fromTo(start: string, end: string, context: AuditSentenceContext): string {
	return start === end ? `on ${day(start, context)}` : `from ${day(start, context)} to ${day(end, context)}`;
}

export function plural(count: number, one: string, many: string): string {
	return `${count.toLocaleString('en-US')} ${count === 1 ? one : many}`;
}

/** A change to a field whose value is free text or a list: the entry says it changed and never keeps it. */
export const flagged = z.literal(true);

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const valueChange = z.object({ from: scalar, to: scalar });

/** Shown beside the field name in a change: a date as the viewer reads it, a boolean as yes or no. */
function shownValue(value: unknown, context: AuditSentenceContext): string {
	if (value === null || value === undefined || value === '') return 'none';
	if (typeof value === 'boolean') return value ? 'yes' : 'no';
	if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return day(value, context);
	return String(value);
}

/** "name Leave → TDY, color #6b7280 → #000000" for the fields a kind declares, in the order it declares them. */
export function describeChange(
	change: Record<string, { from: unknown; to: unknown } | true | undefined>,
	fieldNames: Record<string, string>,
	context: AuditSentenceContext,
	flagNames: Record<string, string> = {}
): string {
	const fields = Object.entries(fieldNames).flatMap(([key, name]) => {
		const field = change[key];
		return field && field !== true
			? [`${name} ${shownValue(field.from, context)} → ${shownValue(field.to, context)}`]
			: [];
	});
	const flags = Object.entries(flagNames).flatMap(([key, name]) => (change[key] === true ? [`${name} changed`] : []));
	return [...fields, ...flags].join(', ');
}

type Details = Record<string, unknown>;

/**
 * The created, changed and deleted kinds of one kind of record. `fields` names each field an update reports, in the
 * order a sentence lists them. `details` are saved on every entry; `suffix` reads them into the sentence. A kind
 * `about` a person requires the person's saved label.
 */
export function lifecycle<DetailShape extends z.ZodRawShape = Record<string, never>>(spec: {
	writer: AuditKind['writer'];
	noun: string;
	plural: string;
	about?: boolean;
	details?: DetailShape;
	fields: Record<string, string>;
	/** Fields that hold free text or a list: a change is noted by name and the values are never saved. */
	flags?: Record<string, string>;
	suffix?: (details: z.infer<z.ZodObject<DetailShape>>, context: AuditSentenceContext) => string;
}) {
	const detailShape = z.object(spec.details ?? ({} as DetailShape));
	const subject = spec.about ? savedLabel : z.string().nullish();
	const created = z.object({ record: savedLabel, subject, details: detailShape });
	const changed = z.object({
		record: savedLabel,
		subject,
		details: detailShape.extend({
			change: changeOf({
				...Object.fromEntries(Object.keys(spec.fields).map((key) => [key, valueChange.optional()])),
				...Object.fromEntries(Object.keys(spec.flags ?? {}).map((key) => [key, flagged.optional()]))
			})
		})
	});
	const about = (record: string, who: string | null | undefined) =>
		`${record}${spec.about && who ? ` for ${who}` : ''}`;
	const tail = (details: Details, context: AuditSentenceContext) =>
		spec.suffix ? spec.suffix(details as z.infer<z.ZodObject<DetailShape>>, context) : '';
	const batch = (verb: string) => ({ verb, one: spec.noun, many: spec.plural });
	return {
		created: auditKind({
			writer: spec.writer,
			entry: created,
			sentence: ({ record, subject: who, details }, context) =>
				`Added ${spec.noun} ${about(record, who)}${tail(details, context)}`,
			batch: batch('Added')
		}),
		updated: auditKind({
			writer: spec.writer,
			entry: changed,
			sentence: ({ record, subject: who, details }, context) =>
				`Changed ${spec.noun} ${about(record, who)}${tail(details, context)}: ${describeChange(
					(details as { change: Record<string, { from: unknown; to: unknown } | true | undefined> }).change,
					spec.fields,
					context,
					spec.flags
				)}`,
			batch: batch('Changed')
		}),
		deleted: auditKind({
			writer: spec.writer,
			entry: created,
			sentence: ({ record, subject: who, details }, context) =>
				`Deleted ${spec.noun} ${about(record, who)}${tail(details, context)}`,
			batch: batch('Deleted')
		})
	};
}
