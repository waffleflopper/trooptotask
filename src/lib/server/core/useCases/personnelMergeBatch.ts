import { fail } from '$lib/server/core/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { sanitizeString } from '$lib/server/validation';
import type { WritePorts } from '$lib/server/core/ports';
import { requireFeaturePolicy } from './featurePolicy';
import { createPersonnelCatalogRankResolver } from './personnelRankCatalog';
import { listGroupCatalog } from '$features/personnel/index.server';

const entity = PersonnelEntity;
const MAX_BATCH_SIZE = 500;
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface MergeBatchRecord {
	rank: string;
	lastName: string;
	firstName: string;
	groupName?: string | null;
	ets?: string | null;
	deros?: string | null;
}

interface MergeBatchInput {
	records: MergeBatchRecord[];
}

interface BatchMessage {
	index: number;
	message: string;
}

interface MergeBatchResult {
	matched: Array<{ index: number; personnelId: string }>;
	updated: unknown[];
	skipped: BatchMessage[];
	ambiguous: BatchMessage[];
	errors: BatchMessage[];
}

function normalize(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase();
}

function isValidIsoDate(value: string): boolean {
	if (!ISO_DATE_REGEX.test(value)) return false;

	const [year, month, day] = value.split('-').map((part) => Number(part));
	const utcDate = new Date(Date.UTC(year, month - 1, day));

	return utcDate.getUTCFullYear() === year && utcDate.getUTCMonth() === month - 1 && utcDate.getUTCDate() === day;
}

function validateBatchDateFields(ets: string | null | undefined, deros: string | null | undefined): string | null {
	const invalidFields: string[] = [];
	const sanitizedEts = sanitizeString(ets);
	const sanitizedDeros = sanitizeString(deros);

	if (sanitizedEts && !isValidIsoDate(sanitizedEts)) {
		invalidFields.push('ETS');
	}

	if (sanitizedDeros && !isValidIsoDate(sanitizedDeros)) {
		invalidFields.push('DEROS');
	}

	if (invalidFields.length === 0) return null;

	if (invalidFields.length === 1) {
		return `${invalidFields[0]} must be a valid YYYY-MM-DD date`;
	}

	return `${invalidFields.join(' and ')} must be valid YYYY-MM-DD dates`;
}

export async function mergePersonnelBatch(ctx: WritePorts, input: MergeBatchInput): Promise<MergeBatchResult> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.mergeRecords, { kind: 'unscoped' }, 'personnel');

	if (!Array.isArray(input.records) || input.records.length === 0) {
		fail(400, 'records array is required');
	}

	if (input.records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	const [people, groups, rankResolver] = await Promise.all([
		ctx.store.findMany<Record<string, unknown>>('personnel', ctx.auth.orgId, undefined, {
			isNull: { archived_at: true }
		}),
		listGroupCatalog(ctx),
		createPersonnelCatalogRankResolver(ctx)
	]);

	const groupNameById = new Map(groups.map((group) => [group.id, group.name]));
	const matched: Array<{ index: number; personnelId: string }> = [];
	const updated: Record<string, unknown>[] = [];
	const skipped: BatchMessage[] = [];
	const ambiguous: BatchMessage[] = [];
	const errors: BatchMessage[] = [];

	for (let index = 0; index < input.records.length; index++) {
		const record = input.records[index];
		const rank = sanitizeString(record.rank);
		const lastName = sanitizeString(record.lastName);
		const firstName = sanitizeString(record.firstName);

		if (!rank || !lastName || !firstName) {
			errors.push({ index, message: 'Rank, Last Name, and First Name are required' });
			continue;
		}
		const normalizedRank = rankResolver.normalize(rank);

		const desiredEts = sanitizeString(record.ets);
		const desiredDeros = sanitizeString(record.deros);
		const dateValidationError = validateBatchDateFields(record.ets, record.deros);
		if (dateValidationError) {
			errors.push({ index, message: dateValidationError });
			continue;
		}
		if (!desiredEts && !desiredDeros) {
			skipped.push({ index, message: 'No ETS or DEROS value provided for update' });
			continue;
		}

		const desiredGroupName = sanitizeString(record.groupName);
		const candidates = people.filter((person) => {
			const personRank = sanitizeString(person.rank as string, 80);
			if (normalizedRank) {
				if (rankResolver.normalize(personRank) !== normalizedRank) return false;
			} else if (normalize(personRank) !== normalize(rank)) {
				return false;
			}
			if (normalize(person.last_name as string) !== lastName.toLowerCase()) return false;
			if (normalize(person.first_name as string) !== firstName.toLowerCase()) return false;
			return true;
		});

		if (candidates.length === 0) {
			errors.push({
				index,
				message: normalizedRank ? 'No active personnel row matched this record' : rankResolver.errorMessage(rank)
			});
			continue;
		}

		let person: (typeof candidates)[number] | null = null;
		if (candidates.length === 1) {
			person = candidates[0];
		} else if (desiredGroupName) {
			const groupMatches = candidates.filter((candidate) => {
				const groupId = (candidate.group_id as string | null) ?? null;
				return normalize(groupId ? groupNameById.get(groupId) : null) === desiredGroupName.toLowerCase();
			});

			if (groupMatches.length === 1) {
				person = groupMatches[0];
			} else if (groupMatches.length === 0) {
				errors.push({ index, message: 'No active personnel row matched this record' });
				continue;
			} else {
				ambiguous.push({ index, message: 'Multiple personnel rows matched this record' });
				continue;
			}
		} else {
			ambiguous.push({ index, message: 'Multiple personnel rows matched this record' });
			continue;
		}

		if (!person) {
			errors.push({ index, message: 'No active personnel row matched this record' });
			continue;
		}
		matched.push({ index, personnelId: person.id as string });

		await requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.personnel.mergeRecords,
			person.group_id ? { kind: 'group', groupId: person.group_id as string } : { kind: 'organization' },
			'personnel',
			person.id as string
		);

		const patch: Record<string, unknown> = {};
		if (desiredEts && desiredEts !== ((person.ets as string | null) ?? null)) {
			patch.ets = desiredEts;
		}
		if (desiredDeros && desiredDeros !== ((person.deros as string | null) ?? null)) {
			patch.deros = desiredDeros;
		}

		if (Object.keys(patch).length === 0) {
			skipped.push({ index, message: 'Matched personnel already has the requested values' });
			continue;
		}

		const result = await ctx.store.update<Record<string, unknown>>(
			entity.table,
			ctx.auth.orgId,
			person.id as string,
			patch
		);
		updated.push(result);
	}

	ctx.audit.log({
		action: 'personnel.bulk_merged',
		resourceType: 'personnel',
		details: {
			matched: matched.length,
			updated: updated.length,
			skipped: skipped.length,
			ambiguous: ambiguous.length,
			errors: errors.length
		}
	});

	return {
		matched,
		updated: updated.map((row) => entity.fromDb(row)),
		skipped,
		ambiguous,
		errors
	};
}
