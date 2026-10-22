import { fail } from '$lib/errors';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { evaluateFeaturePolicy, policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import type { OrganizationAccessGrant } from '$lib/access/memberAccessShape';
import type { PolicyAuditSink } from '$lib/access/policyAuditSink';
import { sanitizeString } from '$lib/server/validation';
import { isDateOnly } from '$lib/utils/dates';
import type {
	GroupPersistence,
	Personnel,
	PersonnelBatchMessage,
	PersonnelEditableFields,
	PersonnelImportRecordsChanges,
	PersonnelImportRecordsInput,
	PersonnelImportRecordsResult,
	PersonnelInsert,
	PersonnelRecordPersistence
} from './contracts';
import { createActivePersonnelRankResolver } from './rankValidation.server';
import {
	buildAvailablePersonnelSlug,
	buildPersonnelSlugBase,
	conflictingPersonnelSlug,
	isRedactedPersonnelSlugConstraintError
} from './personnelSlug.server';

interface PersonnelImportRecordsContext {
	auth: OrganizationAccessGrant;
	audit: PolicyAuditSink;
	personnel: Pick<
		PersonnelRecordPersistence,
		'listImportSlugs' | 'createMany' | 'listArchiveCandidates' | 'updateEditable'
	>;
	groups: Pick<GroupPersistence, 'listCatalog'>;
	loadRankCatalog: Parameters<typeof createActivePersonnelRankResolver>[0]['loadRankCatalog'];
}

interface ImportCreateRow {
	index: number;
	slugBase: string;
	row: PersonnelInsert;
}

function invalidDate(changes: PersonnelImportRecordsChanges): string | null {
	for (const field of ['ets', 'deros'] as const) {
		const value = changes[field];
		if (value !== undefined && value !== null && !isDateOnly(value)) {
			return `${field.toUpperCase()} must be a valid YYYY-MM-DD date`;
		}
	}
	return null;
}

export async function importPersonnelRecords(
	ctx: PersonnelImportRecordsContext,
	input: PersonnelImportRecordsInput
): Promise<PersonnelImportRecordsResult> {
	await requireFeaturePolicy(ctx, POLICY_ACTION_CATALOG.personnel.importRecords, { kind: 'unscoped' }, 'personnel');
	if (!Array.isArray(input.records) || input.records.length === 0) fail(400, 'records array is required');
	if (input.records.length > 500) fail(400, 'Maximum 500 records per batch');

	const updateIds = [
		...new Set(input.records.flatMap((record) => (record.op === 'update' ? [record.personnelId] : [])))
	];
	const referenceReads = [];
	for (let start = 0; start < updateIds.length; start += 100) {
		referenceReads.push(ctx.personnel.listArchiveCandidates(updateIds.slice(start, start + 100)));
	}
	const hasCreates = input.records.some((record) => record.op === 'create');
	const [groups, references, slugs, ranks] = await Promise.all([
		ctx.groups.listCatalog(),
		Promise.all(referenceReads),
		hasCreates ? ctx.personnel.listImportSlugs() : [],
		createActivePersonnelRankResolver(ctx)
	]);
	const groupIds = new Set(groups.map((group) => group.id));
	const people = new Map(references.flat().map((person) => [person.id, person]));
	const creates: ImportCreateRow[] = [];
	const updates: Array<{ index: number; personnelId: string; patch: Partial<PersonnelEditableFields> }> = [];
	const seenUpdateIds = new Set<string>();
	const updated: Personnel[] = [];
	const errors: PersonnelBatchMessage[] = [];

	async function canWrite(op: 'create' | 'update', groupId: string | null): Promise<boolean> {
		const action =
			op === 'create' ? POLICY_ACTION_CATALOG.personnel.importRecords : POLICY_ACTION_CATALOG.personnel.mergeRecords;
		return (await evaluateFeaturePolicy(ctx, action, policyResourceForGroup(groupId))).allowed;
	}

	for (const [index, record] of input.records.entries()) {
		if (record.op === 'update') {
			if (seenUpdateIds.has(record.personnelId)) {
				errors.push({ index, message: 'This Person is already referenced by an earlier update row' });
				continue;
			}
			seenUpdateIds.add(record.personnelId);
		}
		const person = record.op === 'update' ? people.get(record.personnelId) : undefined;
		const fields = record.op === 'create' ? record : record.changes;
		const dateError = invalidDate(fields);
		if (dateError) {
			errors.push({ index, message: dateError });
			continue;
		}
		const keepsRank =
			fields.rank !== undefined &&
			person !== undefined &&
			fields.rank.trim().toUpperCase() === person.rank?.trim().toUpperCase();
		const rank = fields.rank === undefined || keepsRank ? undefined : ranks.normalize(fields.rank);
		if (fields.rank !== undefined && !keepsRank && !rank) {
			errors.push({ index, message: ranks.errorMessage(fields.rank) });
			continue;
		}

		if (fields.groupId !== undefined && fields.groupId !== null && !groupIds.has(fields.groupId)) {
			errors.push({ index, message: 'That Group is not available in your Organization and scope' });
			continue;
		}

		if (record.op === 'create') {
			const firstName = sanitizeString(record.firstName);
			const lastName = sanitizeString(record.lastName);
			if (!rank || !firstName || !lastName) {
				errors.push({ index, message: 'Rank, Last Name, and First Name are required' });
				continue;
			}
			const groupId = record.groupId ?? null;
			if (!(await canWrite('create', groupId))) {
				errors.push({ index, message: 'You can only add personnel to your assigned groups' });
				continue;
			}
			creates.push({
				index,
				slugBase: buildPersonnelSlugBase({ firstName, lastName }),
				row: {
					rank,
					firstName,
					lastName,
					slug: '',
					mos: sanitizeString(record.mos),
					clinicRole: sanitizeString(record.clinicRole),
					groupId,
					ets: record.ets ?? null,
					deros: record.deros ?? null
				}
			});
			continue;
		}

		if (!person || person.archivedAt || !(await canWrite('update', person.groupId))) {
			errors.push({ index, message: 'No active personnel row is available in your scope' });
			continue;
		}
		if (fields.groupId !== undefined && !(await canWrite('update', fields.groupId))) {
			errors.push({ index, message: 'You can only move personnel into your assigned groups' });
			continue;
		}

		const patch: Partial<PersonnelEditableFields> = {};
		if (rank) patch.rank = rank;
		const mos = sanitizeString(fields.mos);
		const clinicRole = sanitizeString(fields.clinicRole);
		if (mos) patch.mos = mos;
		if (clinicRole) patch.clinicRole = clinicRole;
		if (fields.groupId !== undefined) patch.groupId = fields.groupId;
		if (fields.ets !== undefined) patch.ets = fields.ets;
		if (fields.deros !== undefined) patch.deros = fields.deros;
		if (Object.keys(patch).length === 0) {
			errors.push({ index, message: 'An update must include at least one changed field' });
			continue;
		}

		updates.push({ index, personnelId: record.personnelId, patch });
	}

	for (let start = 0; start < updates.length; start += 12) {
		const savedRows = await Promise.all(
			updates.slice(start, start + 12).map(async ({ index, personnelId, patch }) => {
				try {
					const saved = await ctx.personnel.updateEditable(personnelId, patch, { onlyActive: true });
					if (!saved) errors.push({ index, message: 'No active personnel row is available in your scope' });
					return saved;
				} catch {
					errors.push({ index, message: 'This update could not be confirmed. Review the record before retrying.' });
					return null;
				}
			})
		);
		updated.push(...savedRows.filter((row) => row !== null));
	}

	const created = await createImportRows(ctx, creates, slugs, errors);
	errors.sort((left, right) => left.index - right.index);
	await ctx.audit.log({
		action: 'personnel.bulk_merged',
		resourceType: 'personnel',
		details: { created: created.length, updated: updated.length, errors: errors.length }
	});
	return { created, updated, errors };
}

async function createImportRows(
	ctx: PersonnelImportRecordsContext,
	rows: ImportCreateRow[],
	slugs: Array<{ slug: string | null }>,
	errors: PersonnelBatchMessage[]
): Promise<Personnel[]> {
	const reserved = new Set(slugs.flatMap(({ slug }) => (slug ? [slug] : [])));
	const created: Personnel[] = [];
	function advance(value: ImportCreateRow) {
		value.row.slug = buildAvailablePersonnelSlug(value.slugBase, reserved);
		reserved.add(value.row.slug);
	}
	for (const value of rows) advance(value);

	async function insert(subset: ImportCreateRow[], attempt = 1): Promise<void> {
		try {
			created.push(...(await ctx.personnel.createMany(subset.map(({ row }) => row))));
		} catch (error) {
			const confirmed =
				isRedactedPersonnelSlugConstraintError(error) ||
				conflictingPersonnelSlug(error, ctx.auth.orgId, new Set(subset.map(({ row }) => row.slug))) !== null;
			if (!confirmed) {
				for (const { index } of subset) {
					errors.push({ index, message: 'Unable to confirm this row was created. Check the roster before retrying.' });
				}
				return;
			}
			if (subset.length > 1) {
				const midpoint = Math.floor(subset.length / 2);
				await insert(subset.slice(0, midpoint));
				await insert(subset.slice(midpoint));
			} else if (attempt < 3) {
				advance(subset[0]);
				await insert(subset, attempt + 1);
			} else {
				errors.push({
					index: subset[0].index,
					message: 'Unable to allocate a unique personnel URL. This row was not created.'
				});
			}
		}
	}
	if (rows.length) await insert(rows);
	return created;
}
