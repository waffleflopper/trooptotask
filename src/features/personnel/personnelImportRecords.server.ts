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
import { dodIdInputSchema } from './dodId';
import {
	PersonnelDodIdConflict,
	type PersonnelSheetPersistence,
	type PersonnelDodId
} from './personnelSheetPersistence';
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
	personnelSheets: Pick<PersonnelSheetPersistence, 'listDodIds' | 'findDodIdsInUse' | 'saveDodIds'>;
	loadRankCatalog: Parameters<typeof createActivePersonnelRankResolver>[0]['loadRankCatalog'];
}

interface ImportCreateRow {
	index: number;
	slugBase: string;
	row: PersonnelInsert;
	dodId?: string;
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
	const proposedDodIds = [
		...new Set(
			input.records.flatMap((record) => {
				const parsed = dodIdInputSchema.optional().safeParse((record.op === 'create' ? record : record.changes).dodId);
				return parsed.success && parsed.data ? [parsed.data] : [];
			})
		)
	];
	const [groups, references, slugs, ranks, dodIds, occupiedDodIds] = await Promise.all([
		ctx.groups.listCatalog(),
		Promise.all(referenceReads),
		hasCreates ? ctx.personnel.listImportSlugs() : [],
		createActivePersonnelRankResolver(ctx),
		proposedDodIds.length ? ctx.personnelSheets.listDodIds(proposedDodIds) : [],
		proposedDodIds.length ? ctx.personnelSheets.findDodIdsInUse(proposedDodIds) : []
	]);
	const groupIds = new Set(groups.map((group) => group.id));
	const people = new Map(references.flat().map((person) => [person.id, person]));
	const creates: ImportCreateRow[] = [];
	const updates: Array<{
		index: number;
		personnelId: string;
		patch: Partial<PersonnelEditableFields>;
		dodId?: string;
	}> = [];
	const seenUpdateIds = new Set<string>();
	const seenDodIds = new Set<string>();
	const dodIdOwners = new Map(dodIds.map(({ personnelId, dodId }) => [dodId, personnelId]));
	const occupiedIds = new Set(occupiedDodIds);
	const sheetWrites: Array<PersonnelDodId & { index: number }> = [];
	const idOnlyUpdates = new Set<string>();
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
				errors.push({ kind: 'failed', index, message: 'This Person is already referenced by an earlier update row' });
				continue;
			}
			seenUpdateIds.add(record.personnelId);
		}
		const person = record.op === 'update' ? people.get(record.personnelId) : undefined;
		const fields = record.op === 'create' ? record : record.changes;
		const parsedDodId = dodIdInputSchema.optional().safeParse(fields.dodId);
		if (!parsedDodId.success) {
			errors.push({ kind: 'failed', index, message: 'Enter a 10-digit DoD ID' });
			continue;
		}
		const dodId = parsedDodId.data || undefined;
		if (dodId) {
			if (seenDodIds.has(dodId)) {
				errors.push({ kind: 'failed', index, message: 'This DoD ID is already used by an earlier row in this import' });
				continue;
			}
			seenDodIds.add(dodId);
			const owner = dodIdOwners.get(dodId);
			if (owner && (record.op === 'create' || owner !== record.personnelId)) {
				errors.push({ kind: 'failed', index, message: new PersonnelDodIdConflict().message });
				continue;
			}
			if (!owner && occupiedIds.has(dodId)) {
				errors.push({
					kind: 'failed',
					index,
					message:
						'This DoD ID belongs to someone in this Organization outside the Groups you can manage. If that Soldier belongs in your Group, ask an Organization admin to move them, then import again.'
				});
				continue;
			}
		}
		const dateError = invalidDate(fields);
		if (dateError) {
			errors.push({ kind: 'failed', index, message: dateError });
			continue;
		}
		const keepsRank =
			fields.rank !== undefined &&
			person !== undefined &&
			fields.rank.trim().toUpperCase() === person.rank?.trim().toUpperCase();
		const rank = fields.rank === undefined || keepsRank ? undefined : ranks.normalize(fields.rank);
		if (fields.rank !== undefined && !keepsRank && !rank) {
			errors.push({ kind: 'failed', index, message: ranks.errorMessage(fields.rank) });
			continue;
		}

		if (fields.groupId !== undefined && fields.groupId !== null && !groupIds.has(fields.groupId)) {
			errors.push({ kind: 'failed', index, message: 'That Group is not available in your Organization and scope' });
			continue;
		}

		if (record.op === 'create') {
			const firstName = sanitizeString(record.firstName);
			const lastName = sanitizeString(record.lastName);
			if (!rank || !firstName || !lastName) {
				errors.push({ kind: 'failed', index, message: 'Rank, Last Name, and First Name are required' });
				continue;
			}
			const groupId = record.groupId ?? null;
			if (!(await canWrite('create', groupId))) {
				errors.push({ kind: 'failed', index, message: 'You can only add personnel to your assigned groups' });
				continue;
			}
			creates.push({
				index,
				dodId,
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
			errors.push({ kind: 'failed', index, message: 'No active personnel row is available in your scope' });
			continue;
		}
		if (fields.groupId !== undefined && !(await canWrite('update', fields.groupId))) {
			errors.push({ kind: 'failed', index, message: 'You can only move personnel into your assigned groups' });
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
		if (Object.keys(patch).length === 0 && !dodId) {
			errors.push({ kind: 'failed', index, message: 'An update must include at least one changed field' });
			continue;
		}
		if (Object.keys(patch).length === 0) {
			// The Person was read active and in scope above; rewriting a field from that read could undo a concurrent edit.
			sheetWrites.push({ index, personnelId: record.personnelId, dodId: dodId! });
			idOnlyUpdates.add(record.personnelId);
			continue;
		}

		updates.push({ index, personnelId: record.personnelId, patch, dodId });
	}

	for (let start = 0; start < updates.length; start += 12) {
		const savedRows = await Promise.all(
			updates.slice(start, start + 12).map(async ({ index, personnelId, patch, dodId }) => {
				try {
					const saved = await ctx.personnel.updateEditable(personnelId, patch, { onlyActive: true });
					if (!saved)
						errors.push({ kind: 'failed', index, message: 'No active personnel row is available in your scope' });
					if (saved && dodId) sheetWrites.push({ index, personnelId, dodId });
					return saved;
				} catch {
					errors.push({
						kind: 'unconfirmed',
						index,
						message: 'This update could not be confirmed. Review the record before retrying.'
					});
					return null;
				}
			})
		);
		updated.push(...savedRows.filter((row) => row !== null));
	}

	const created = await createImportRows(ctx, creates, slugs, errors, sheetWrites);
	const sheetFailures = await ctx.personnelSheets.saveDodIds(sheetWrites);
	const sheetIndices = new Map(sheetWrites.map(({ personnelId, index }) => [personnelId, index]));
	for (const { personnelId, reason } of sheetFailures) {
		const index = sheetIndices.get(personnelId);
		if (index === undefined) continue;
		const idOnly = idOnlyUpdates.delete(personnelId);
		errors.push({
			kind: 'failed',
			index,
			message: `${idOnly ? 'The DoD ID was not saved.' : 'The Person was saved, but the DoD ID was not.'} ${reason === 'conflict' ? new PersonnelDodIdConflict().message : 'Review the Data sheet before retrying.'}`
		});
	}
	errors.sort((left, right) => left.index - right.index);
	await ctx.audit.log({
		action: 'personnel.bulk_merged',
		resourceType: 'personnel',
		details: { created: created.length, updated: updated.length + idOnlyUpdates.size, errors: errors.length }
	});
	return { created, updated, errors };
}

async function createImportRows(
	ctx: PersonnelImportRecordsContext,
	rows: ImportCreateRow[],
	slugs: Array<{ slug: string | null }>,
	errors: PersonnelBatchMessage[],
	sheetWrites: Array<PersonnelDodId & { index: number }>
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
			const saved = await ctx.personnel.createMany(subset.map(({ row }) => row));
			created.push(...saved);
			const bySlug = new Map(saved.map((person) => [person.slug, person]));
			for (const { index, row, dodId } of subset) {
				const person = bySlug.get(row.slug);
				if (person && dodId) sheetWrites.push({ index, personnelId: person.id, dodId });
			}
		} catch (error) {
			const confirmed =
				isRedactedPersonnelSlugConstraintError(error) ||
				conflictingPersonnelSlug(error, ctx.auth.orgId, new Set(subset.map(({ row }) => row.slug))) !== null;
			if (!confirmed) {
				for (const { index } of subset) {
					errors.push({
						kind: 'unconfirmed',
						index,
						message: 'Unable to confirm this row was created. Check the roster before retrying.'
					});
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
					kind: 'failed',
					index: subset[0].index,
					message: 'Unable to allocate a unique personnel URL. This row was not created.'
				});
			}
		}
	}
	if (rows.length) await insert(rows);
	return created;
}
