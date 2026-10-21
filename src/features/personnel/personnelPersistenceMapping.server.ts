import type { LossCandidate, Personnel, PersonnelEditableFields, PersonnelInsert } from './contracts';

export const PERSONNEL_FIELDS = '*, groups:groups!personnel_organization_group_fkey(name)';

export function toPersonnel(row: Record<string, unknown>): Personnel {
	return {
		id: row.id as string,
		slug: row.slug as string,
		rank: row.rank as string,
		lastName: row.last_name as string,
		firstName: row.first_name as string,
		mos: (row.mos as string) ?? '',
		clinicRole: row.clinic_role as string,
		ets: (row.ets as string | null) ?? null,
		deros: (row.deros as string | null) ?? null,
		groupId: (row.group_id as string | null) ?? null,
		groupName: ((row.groups as Record<string, unknown>)?.name as string) ?? '',
		archivedAt: (row.archived_at as string | null) ?? null
	};
}

export function personnelEditableRow(
	input: Partial<PersonnelEditableFields> & { slug?: string }
): Record<string, unknown> {
	return {
		rank: input.rank,
		last_name: input.lastName,
		first_name: input.firstName,
		mos: input.mos,
		clinic_role: input.clinicRole,
		ets: input.ets,
		deros: input.deros,
		group_id: input.groupId,
		slug: input.slug
	};
}

export function personnelInsertRow(input: PersonnelInsert, orgId: string): Record<string, unknown> {
	return {
		...personnelEditableRow(input),
		organization_id: orgId,
		mos: input.mos ?? '',
		ets: input.ets ?? null,
		deros: input.deros ?? null,
		group_id: input.groupId ?? null
	};
}

export function throwPersonnelMutationError(error: { code?: string; message: string; details?: string | null }): never {
	if (error.code === '23505' && error.message.includes('"personnel_org_slug_key"')) {
		throw Object.assign(new Error(error.message), { code: error.code, details: error.details });
	}
	throw new Error(error.message);
}

export const LOSS_CANDIDATE_FIELDS = 'id, rank, last_name, ets, deros, group_id';

export interface LossCandidateRow {
	id: string;
	rank: string;
	last_name: string;
	ets: string | null;
	deros: string | null;
	group_id: string | null;
}

export function toLossCandidate(row: LossCandidateRow): LossCandidate {
	return {
		id: row.id,
		rank: row.rank,
		lastName: row.last_name,
		ets: row.ets,
		deros: row.deros,
		groupId: row.group_id
	};
}
