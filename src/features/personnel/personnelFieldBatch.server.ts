import { z } from 'zod';
import { RequestFailure } from '$lib/errors';
import { dateOnlySchema, issueMessage, uuidSchema } from '$lib/utils/inputSchemas';
import {
	BULK_FIELDS,
	BULK_FIELD_KEYS,
	PERSONNEL_FIELD_BATCH_LIMIT,
	PERSONNEL_FIELD_VALUE_MAX_LENGTH,
	type BulkField,
	type PersonnelFieldBatchResult,
	type PersonnelFieldResult
} from './personnelFieldBatch';
import { failField, failParse } from './personnelFieldFailure';
import { applyPersonnelRecordUpdate, preparePersonnelRecordUpdate } from './personnelRecordOperations.server';
import { normalizeActivePersonnelRank } from './rankValidation.server';

type FieldBatchContext = Parameters<typeof preparePersonnelRecordUpdate>[0];

const FIELD_BATCH_CONCURRENCY = 8;
const UNCONFIRMED_MESSAGE = 'This update could not be confirmed. Review the record before retrying.';

const batchInput = z.object({
	personnelIds: z
		.array(uuidSchema, 'Choose People to update')
		.min(1, 'Choose People to update')
		.max(PERSONNEL_FIELD_BATCH_LIMIT, `Update at most ${PERSONNEL_FIELD_BATCH_LIMIT} People at a time`),
	field: z.enum(BULK_FIELD_KEYS, { error: 'Choose a field to set' }),
	value: z
		.string({ error: 'Enter a value' })
		.trim()
		.min(1, 'Enter a value')
		.max(PERSONNEL_FIELD_VALUE_MAX_LENGTH, `Use ${PERSONNEL_FIELD_VALUE_MAX_LENGTH} characters or fewer`)
});

/** The value as it will be stored, or a 400 that names `value`. A bad value fails the request once, not per Person. */
async function resolveValue(ctx: FieldBatchContext, field: BulkField, value: string): Promise<string> {
	switch (BULK_FIELDS[field].input) {
		case 'catalog':
			return normalizeActivePersonnelRank(ctx, value);
		case 'date': {
			const parsed = dateOnlySchema.safeParse(value);
			if (!parsed.success) failField('value', issueMessage(parsed.error));
			return parsed.data;
		}
		case 'text':
			return value;
	}
}

function once<T>(load: () => Promise<T>): () => Promise<T> {
	let loaded: Promise<T> | undefined;
	return () => (loaded ??= load());
}

function resultOf(id: string, error: unknown): PersonnelFieldResult {
	if (error instanceof RequestFailure) {
		if (error.status === 403) return { id, outcome: 'refused', message: error.message };
		if (error.status === 404) return { id, outcome: 'unavailable', message: error.message };
		if (error.status < 500) return { id, outcome: 'failed', message: error.message };
	}
	return { id, outcome: 'failed', message: UNCONFIRMED_MESSAGE };
}

/** Each Person goes through the same policy check and write as a single edit, so one refusal never stops the rest. */
async function setOne(ctx: FieldBatchContext, id: string, field: BulkField, value: string) {
	try {
		const prepared = await preparePersonnelRecordUpdate(ctx, { id, [field]: value });
		await applyPersonnelRecordUpdate(ctx, prepared, { onlyActive: true });
		return { id, outcome: 'updated' } as const;
	} catch (error) {
		return resultOf(id, error);
	}
}

async function inBatches<T, R>(items: readonly T[], size: number, run: (item: T) => Promise<R>): Promise<R[]> {
	const results: R[] = [];
	for (let start = 0; start < items.length; start += size) {
		results.push(...(await Promise.all(items.slice(start, start + size).map(run))));
	}
	return results;
}

export async function setPersonnelFieldBatch(
	ctx: FieldBatchContext,
	input: Record<string, unknown>
): Promise<PersonnelFieldBatchResult> {
	const parsed = batchInput.safeParse(input);
	if (!parsed.success) failParse(parsed.error);
	const { field } = parsed.data;
	const ids = [...new Set(parsed.data.personnelIds)];
	const batch = { ...ctx, loadRankCatalog: once(ctx.loadRankCatalog) };
	const value = await resolveValue(batch, field, parsed.data.value);
	const results = await inBatches(ids, FIELD_BATCH_CONCURRENCY, (id) => setOne(batch, id, field, value));
	return { field, value, results };
}
