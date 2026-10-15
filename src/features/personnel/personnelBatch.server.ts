/**
 * Bulk personnel import — creates up to MAX_BATCH_SIZE personnel records from a CSV upload.
 *
 * Validates each row against Group scope and the Organization rank catalog,
 * sanitizes string fields, and reports invalid rows without discarding valid ones.
 *
 * Single-record creation and editing use Personnel-owned record operations.
 */
import { fail } from '$lib/errors';
import { isDateOnly } from '$lib/utils/dates';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { sanitizeString } from '$lib/server/validation';
import { requireFeaturePolicy } from '$lib/access/index.server';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import type { Personnel, PersonnelInsert, PersonnelRecordPersistence, GroupPersistence } from './contracts';
import type { PersonnelBatchMessage, PersonnelImportInput, PersonnelImportResult } from './personnelImport.types';
import {
	buildAvailablePersonnelSlug,
	buildPersonnelSlugBase,
	conflictingPersonnelSlug,
	isRedactedPersonnelSlugConstraintError
} from './personnelSlug.server';
import { createActivePersonnelRankResolver } from './rankValidation.server';
import { listGroupCatalog } from './groupCatalog.server';

const AUDIT_RESOURCE = 'personnel';
const MAX_BATCH_SIZE = 500;
const SLUG_RETRY_LIMIT = 3;

interface PersonnelImportContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	personnel: Pick<PersonnelRecordPersistence, 'listImportSlugs' | 'createMany'>;
	groups: Pick<GroupPersistence, 'listCatalog'>;
	loadRankCatalog: Parameters<typeof createActivePersonnelRankResolver>[0]['loadRankCatalog'];
}

interface ValidImportRow {
	index: number;
	slugBase: string;
	row: PersonnelInsert;
}

function validateBatchDateFields(ets: string | null | undefined, deros: string | null | undefined): string | null {
	const invalidFields: string[] = [];
	const sanitizedEts = sanitizeString(ets);
	const sanitizedDeros = sanitizeString(deros);

	if (sanitizedEts && !isDateOnly(sanitizedEts)) {
		invalidFields.push('ETS');
	}

	if (sanitizedDeros && !isDateOnly(sanitizedDeros)) {
		invalidFields.push('DEROS');
	}

	if (invalidFields.length === 0) return null;

	if (invalidFields.length === 1) {
		return `${invalidFields[0]} must be a valid YYYY-MM-DD date`;
	}

	return `${invalidFields.join(' and ')} must be valid YYYY-MM-DD dates`;
}

export async function importPersonnelBatch(
	ctx: PersonnelImportContext,
	input: PersonnelImportInput
): Promise<PersonnelImportResult> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.importRecords, { kind: 'unscoped' }, AUDIT_RESOURCE);

	const { records } = input;

	if (!Array.isArray(records) || records.length === 0) {
		fail(400, 'records array is required');
	}

	if (records.length > MAX_BATCH_SIZE) {
		fail(400, `Maximum ${MAX_BATCH_SIZE} records per batch`);
	}

	// Fetch groups for name matching
	const groups = await listGroupCatalog(ctx);
	const groupMap = new Map(groups.map((g) => [g.name.toLowerCase(), g.id]));

	// Validate all records
	const validRows: ValidImportRow[] = [];
	const errors: PersonnelBatchMessage[] = [];
	const existingSlugRows = await ctx.personnel.listImportSlugs();
	const rankResolver = await createActivePersonnelRankResolver(ctx);
	const visibleSlugs = new Set(
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

		const normalizedRank = rankResolver.normalize(rank);
		if (!normalizedRank) {
			errors.push({ index: i, message: rankResolver.errorMessage(rank) });
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
			slugBase: buildPersonnelSlugBase({ lastName, firstName }),
			row: {
				rank: normalizedRank,
				slug: '',
				lastName,
				firstName,
				mos: sanitizeString(rec.mos) || '',
				clinicRole: sanitizeString(rec.clinicRole) || '',
				ets: sanitizeString(rec.ets) || null,
				deros: sanitizeString(rec.deros) || null,
				groupId
			}
		});
	}

	if (validRows.length === 0) {
		return { inserted: [], errors };
	}

	let insertedRows: Personnel[] = [];
	const reservedSlugs = new Set(visibleSlugs);
	for (const { slugBase, row } of validRows) {
		row.slug = buildAvailablePersonnelSlug(slugBase, reservedSlugs);
		reservedSlugs.add(row.slug as string);
	}

	function advanceSlug(value: ValidImportRow) {
		// Keep every other row's planned URL, acknowledged URL and failed candidate reserved.
		value.row.slug = buildAvailablePersonnelSlug(value.slugBase, reservedSlugs);
		reservedSlugs.add(value.row.slug as string);
	}

	function confirmedSubsetConflict(error: unknown, subset: ValidImportRow[]): boolean {
		return (
			isRedactedPersonnelSlugConstraintError(error) ||
			conflictingPersonnelSlug(error, ctx.auth.orgId, new Set(subset.map(({ row }) => row.slug as string))) !== null
		);
	}

	function reportUnconfirmed(subset: ValidImportRow[]) {
		for (const { index } of subset) {
			errors.push({ index, message: 'Unable to confirm this row was created. Check the roster before retrying.' });
		}
	}

	async function insertSubset(subset: ValidImportRow[]): Promise<void> {
		let saved: Personnel[];
		try {
			saved = await ctx.personnel.createMany(subset.map(({ row }) => row));
		} catch (error) {
			await recoverFailedSubset(subset, error);
			return;
		}
		insertedRows.push(...saved);
	}

	async function recoverFailedSubset(subset: ValidImportRow[], error: unknown): Promise<void> {
		if (!confirmedSubsetConflict(error, subset)) {
			// An uncertain response may follow persistence; never probe or resubmit this subset.
			reportUnconfirmed(subset);
			return;
		}
		if (subset.length > 1) {
			// The failed statement saved nothing. Split only confirmed constraint failures;
			// unrelated halves still insert in bulk rather than one request per file row.
			const midpoint = Math.floor(subset.length / 2);
			await insertSubset(subset.slice(0, midpoint));
			await insertSubset(subset.slice(midpoint));
			return;
		}

		const value = subset[0];
		// This singleton rejection identifies its own candidate, including with redacted DETAIL.
		// Count it as candidate attempt one; failed larger attribution probes are separate.
		for (let attempt = 2; attempt <= SLUG_RETRY_LIMIT; attempt += 1) {
			advanceSlug(value);
			let saved: Personnel[];
			try {
				saved = await ctx.personnel.createMany([value.row]);
			} catch (retryError) {
				if (!confirmedSubsetConflict(retryError, subset)) {
					reportUnconfirmed(subset);
					return;
				}
				continue;
			}
			insertedRows.push(...saved);
			return;
		}
		errors.push({
			index: value.index,
			message: 'Unable to allocate a unique personnel URL. This row was not created.'
		});
	}

	for (let attempt = 1; attempt <= SLUG_RETRY_LIMIT; attempt += 1) {
		try {
			insertedRows = await ctx.personnel.createMany(validRows.map((value) => value.row));
			break;
		} catch (error) {
			if (isRedactedPersonnelSlugConstraintError(error)) {
				await recoverFailedSubset(validRows, error);
				break;
			}
			const rejected = conflictingPersonnelSlug(
				error,
				ctx.auth.orgId,
				new Set(validRows.map(({ row }) => row.slug as string))
			);
			if (attempt === SLUG_RETRY_LIMIT || rejected === null) throw error;
			advanceSlug(validRows.find(({ row }) => row.slug === rejected)!);
		}
	}

	if (insertedRows.length > 0) {
		ctx.audit.log({
			action: `${AUDIT_RESOURCE}.bulk_created`,
			resourceType: AUDIT_RESOURCE,
			details: { count: insertedRows.length }
		});
	}

	return {
		inserted: insertedRows,
		errors
	};
}

function isGroupAllowedByScope(scopeSet: OrganizationAccessGrant['scopeSet'], groupId: string | null): boolean {
	if (scopeSet.kind === 'organization') {
		return true;
	}

	return groupId !== null && scopeSet.groupIds.includes(groupId);
}
