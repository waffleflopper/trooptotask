/**
 * Bulk personnel import — creates up to MAX_BATCH_SIZE personnel records from a CSV upload.
 *
 * Checks the org's subscription seat limit before inserting; excess rows are trimmed to
 * fit available seats (partial acceptance). Normalizes rank strings against ALL_RANKS and
 * sanitizes all string fields.
 *
 * For single-record personnel mutations, see `personnel.ts`.
 */
import { fail } from '$lib/server/core/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { PersonnelEntity } from '$lib/server/entities/personnel';
import { ALL_RANKS } from '$lib/types';
import { sanitizeString } from '$lib/server/validation';
import type { WriteWithSubscriptionPorts } from '$lib/server/core/ports';
import { requireFeaturePolicy } from './featurePolicy';
import { buildAvailablePersonnelSlug, buildPersonnelSlugBase } from './personnelSlug';

const entity = PersonnelEntity;
const AUDIT_RESOURCE = 'personnel';
const MAX_BATCH_SIZE = 500;

const ALL_RANKS_LOWER = ALL_RANKS.map((r) => r.toLowerCase());
const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

interface BatchRecord {
	rank: string;
	lastName: string;
	firstName: string;
	mos?: string | null;
	clinicRole?: string | null;
	groupName?: string | null;
	ets?: string | null;
	deros?: string | null;
}

interface BatchInput {
	records: BatchRecord[];
}

interface BatchError {
	index: number;
	message: string;
}

interface BatchResult {
	inserted: unknown[];
	errors: BatchError[];
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

export async function importPersonnelBatch(ctx: WriteWithSubscriptionPorts, input: BatchInput): Promise<BatchResult> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.importRecords, { kind: 'unscoped' }, AUDIT_RESOURCE);

	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		fail(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	// Fetch groups for name matching
	const groups = await ctx.store.findMany<{ id: string; name: string }>('groups', ctx.auth.orgId);
	const groupMap = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));

	// Validate all records
	const validRows: Array<{ index: number; row: Record<string, unknown> }> = [];
	const errors: BatchError[] = [];
	const existingSlugRows = await ctx.store.findMany<{ slug: string | null }>('personnel', ctx.auth.orgId, undefined, {
		select: 'slug'
	});
	const reservedSlugs = new Set(
		existingSlugRows
			.map((row) => row.slug)
			.filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
	);

	for (let i = 0; i < records.length; i++) {
		const rec = records[i];
		const rank = sanitizeString(rec.rank);
		const lastName = sanitizeString(rec.lastName);
		const firstName = sanitizeString(rec.firstName);

		if (!rank || !lastName || !firstName) {
			errors.push({ index: i, message: 'Rank, Last Name, and First Name are required' });
			continue;
		}

		const rankIdx = ALL_RANKS_LOWER.indexOf(rank.toLowerCase());
		if (rankIdx === -1) {
			errors.push({ index: i, message: `Invalid rank "${rank}"` });
			continue;
		}

		const dateValidationError = validateBatchDateFields(rec.ets, rec.deros);
		if (dateValidationError) {
			errors.push({ index: i, message: dateValidationError });
			continue;
		}

		const groupName = sanitizeString(rec.groupName);
		let groupId: string | null = null;
		if (groupName) {
			groupId = groupMap.get(groupName.toLowerCase()) ?? null;
		}

		if (!isGroupAllowedByScope(ctx.auth.scopeSet, groupId)) {
			errors.push({ index: i, message: 'You can only add personnel to your assigned group' });
			continue;
		}
		await requireFeaturePolicy(
			ctx,
			POLICY_ACTION_CATALOG.personnel.importRecords,
			groupId ? { kind: 'group', groupId } : { kind: 'organization' },
			AUDIT_RESOURCE
		);

		validRows.push({
			index: i,
			row: {
				organization_id: ctx.auth.orgId,
				slug: buildAvailablePersonnelSlug(buildPersonnelSlugBase({ lastName, firstName }), reservedSlugs),
				rank: ALL_RANKS[rankIdx],
				last_name: lastName,
				first_name: firstName,
				mos: sanitizeString(rec.mos) || '',
				clinic_role: sanitizeString(rec.clinicRole) || '',
				ets: sanitizeString(rec.ets) || null,
				deros: sanitizeString(rec.deros) || null,
				group_id: groupId
			}
		});
		reservedSlugs.add(validRows[validRows.length - 1].row.slug as string);
	}

	if (validRows.length === 0) {
		return { inserted: [], errors };
	}

	// Enforce personnel cap against full batch size
	const available = await ctx.subscription.getAvailablePersonnelSlots();
	if (available !== null) {
		if (available <= 0) {
			for (const { index } of validRows) {
				errors.push({
					index,
					message: 'Personnel cap reached — upgrade or archive personnel before adding this record'
				});
			}
			return { inserted: [], errors };
		}
		if (validRows.length > available) {
			const excess = validRows.splice(available);
			for (const { index } of excess) {
				errors.push({
					index,
					message: 'Personnel cap reached — upgrade or archive personnel before adding this record'
				});
			}
		}
	}

	// Bulk insert
	const insertedRows = await ctx.store.insertMany<Record<string, unknown>>(
		entity.table,
		ctx.auth.orgId,
		validRows.map((v) => v.row),
		entity.select
	);

	ctx.subscription.invalidateTierCache();

	ctx.audit.log({
		action: `${AUDIT_RESOURCE}.bulk_created`,
		resourceType: AUDIT_RESOURCE,
		details: { count: insertedRows.length }
	});

	return {
		inserted: insertedRows.map((row) => entity.fromDb(row)),
		errors
	};
}

function isGroupAllowedByScope(
	scopeSet: WriteWithSubscriptionPorts['auth']['scopeSet'],
	groupId: string | null
): boolean {
	if (scopeSet.kind === 'organization') {
		return true;
	}

	return groupId !== null && scopeSet.groupIds.includes(groupId);
}
