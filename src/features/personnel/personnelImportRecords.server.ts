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
import { createActivePersonnelRankResolver, createPersonnelCatalogRankResolver } from './rankValidation.server';
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

	const catalog = ctx.loadRankCatalog();
	const catalogPorts = { loadRankCatalog: () => catalog };
	const updateIds = input.records.flatMap((record) => (record.op === 'update' ? [record.personnelId] : []));
	const hasCreates = input.records.some((record) => record.op === 'create');
	const [groups, references, slugs, createRanks, updateRanks] = await Promise.all([
		ctx.groups.listCatalog(),
		updateIds.length ? ctx.personnel.listArchiveCandidates(updateIds) : [],
		hasCreates ? ctx.personnel.listImportSlugs() : [],
		createActivePersonnelRankResolver(catalogPorts),
		createPersonnelCatalogRankResolver(catalogPorts)
	]);
	const groupIds = new Set(groups.map((group) => group.id));
	const people = new Map(references.map((person) => [person.id, person]));
	const creates: ImportCreateRow[] = [];
	const updated: Personnel[] = [];
	const errors: PersonnelBatchMessage[] = [];

	async function canWrite(op: 'create' | 'update', groupId: string | null): Promise<boolean> {
		const action =
			op === 'create' ? POLICY_ACTION_CATALOG.personnel.importRecords : POLICY_ACTION_CATALOG.personnel.mergeRecords;
		return (await evaluateFeaturePolicy(ctx, action, policyResourceForGroup(groupId))).allowed;
	}

	for (const [index, record] of input.records.entries()) {
		const fields = record.op === 'create' ? record : record.changes;
		const dateError = invalidDate(fields);
		if (dateError) {
			errors.push({ index, message: dateError });
			continue;
		}
		const rankResolver = record.op === 'create' ? createRanks : updateRanks;
		const rank = fields.rank === undefined ? undefined : rankResolver.normalize(fields.rank);
		if (fields.rank !== undefined && !rank) {
			errors.push({ index, message: rankResolver.errorMessage(fields.rank) });
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

		const person = people.get(record.personnelId);
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
		if (fields.mos !== undefined) patch.mos = sanitizeString(fields.mos);
		if (fields.clinicRole !== undefined) patch.clinicRole = sanitizeString(fields.clinicRole);
		if (fields.groupId !== undefined) patch.groupId = fields.groupId;
		if (fields.ets !== undefined) patch.ets = fields.ets;
		if (fields.deros !== undefined) patch.deros = fields.deros;
		if (Object.keys(patch).length === 0) {
			errors.push({ index, message: 'An update must include at least one changed field' });
			continue;
		}

		try {
			const saved = await ctx.personnel.updateEditable(record.personnelId, patch);
			if (!saved) {
				errors.push({ index, message: 'No active personnel row is available in your scope' });
				people.delete(record.personnelId);
				continue;
			}
			updated.push(saved);
			people.set(saved.id, {
				...person,
				rank: saved.rank,
				groupId: saved.groupId,
				archivedAt: saved.archivedAt ?? null
			});
		} catch {
			errors.push({ index, message: 'This update could not be confirmed. Review the record before retrying.' });
			people.delete(record.personnelId);
		}
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
