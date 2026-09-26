import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { policyResourceForGroup, requireFeaturePolicy } from '$lib/access/index.server';
import type { PersonnelArtifactTable, PersonnelArtifactWritePort, PersonnelArtifactWriter } from './contracts';

function fail(status: number, message: string): never {
	throw Object.assign(new Error(message), { status });
}

function assertArtifactPatch(patch: Record<string, unknown>): void {
	if ('id' in patch || 'organization_id' in patch || 'personnel_id' in patch) {
		fail(400, 'Artifact identity cannot be changed');
	}
}

function assertArtifactInsert(data: Record<string, unknown>): void {
	if ('organization_id' in data || 'personnel_id' in data) {
		fail(400, 'Artifact Person is bound by the write session');
	}
}

/** Bind service-role operations to a Person only after the request actor is admitted. */
export function createSupabasePersonnelArtifactWritePort(
	requestClient: SupabaseClient,
	getAdminClient: () => SupabaseClient
): PersonnelArtifactWritePort {
	return {
		async forPerson(actor, personnelId): Promise<PersonnelArtifactWriter> {
			const { data: person, error } = await requestClient
				.from('personnel')
				.select('group_id')
				.eq('organization_id', actor.orgId)
				.eq('id', personnelId)
				.maybeSingle();
			if (error) throw new Error(error.message);
			if (!person) fail(404, 'Personnel record not found');

			await requireFeaturePolicy(
				{ auth: actor },
				POLICY_ACTION_CATALOG.personnel.manageRecords,
				policyResourceForGroup(person.group_id),
				'personnel',
				personnelId
			);
			const admin = getAdminClient();
			const base = (table: PersonnelArtifactTable) =>
				admin.from(table).select('*').eq('organization_id', actor.orgId).eq('personnel_id', personnelId);

			const writer: PersonnelArtifactWriter = {
				async find<T>(table: PersonnelArtifactTable, id: string) {
					const { data, error } = await base(table).eq('id', id).maybeSingle();
					if (error) throw new Error(error.message);
					return (data as T | null) ?? null;
				},
				async insert<T>(table: PersonnelArtifactTable, data: Record<string, unknown>) {
					assertArtifactInsert(data);
					const { data: inserted, error } = await admin
						.from(table)
						.insert({ ...data, organization_id: actor.orgId, personnel_id: personnelId })
						.select('*')
						.single();
					if (error) throw new Error(error.message);
					return inserted as T;
				},
				async update<T>(table: PersonnelArtifactTable, id: string, patch: Record<string, unknown>) {
					assertArtifactPatch(patch);
					const { data, error } = await admin
						.from(table)
						.update(patch)
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id)
						.select('*')
						.single();
					if (error) throw new Error(error.message);
					return data as T;
				},
				async delete(table, id) {
					const { error } = await admin
						.from(table)
						.delete()
						.eq('organization_id', actor.orgId)
						.eq('personnel_id', personnelId)
						.eq('id', id);
					if (error) throw new Error(error.message);
				}
			};
			return writer;
		}
	};
}
