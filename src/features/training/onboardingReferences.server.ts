import type { SupabaseClient } from '@supabase/supabase-js';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { requireFeaturePolicy } from '$lib/access/index.server';
import { TrainingTypeEntity } from '$lib/server/entities/trainingType';
import type { TrainingOnboardingActor, TrainingOnboardingReferencesPort } from './contracts';

const PAGE_SIZE = 500;
const PERSONNEL_BATCH_SIZE = 100;
const MAX_CONCURRENT_BATCHES = 4;

async function requireOnboardingReferenceRead(actor: TrainingOnboardingActor): Promise<void> {
	await requireFeaturePolicy(
		{ auth: actor },
		POLICY_ACTION_CATALOG.onboarding.viewWorkflows,
		{ kind: 'unscoped' },
		'training_reference'
	);
}

export function createSupabaseTrainingOnboardingReferencesPort(
	getAdminClient: () => SupabaseClient
): TrainingOnboardingReferencesPort {
	return {
		async listTypes(actor) {
			await requireOnboardingReferenceRead(actor);
			const client = getAdminClient();
			const rows: Record<string, unknown>[] = [];
			for (let offset = 0; ; offset += PAGE_SIZE) {
				const { data, error } = await client
					.from('training_types')
					.select(TrainingTypeEntity.select)
					.eq('organization_id', actor.orgId)
					.order('sort_order', { ascending: true })
					.order('id', { ascending: true })
					.range(offset, offset + PAGE_SIZE - 1);
				if (error) throw new Error(error.message);
				const page = (data ?? []) as unknown as Record<string, unknown>[];
				rows.push(...page);
				if (page.length < PAGE_SIZE) break;
			}
			return TrainingTypeEntity.fromDbArray(rows);
		},
		async completedTypeIds(actor, personnelIds, trainingTypeIds) {
			await requireOnboardingReferenceRead(actor);
			if (
				personnelIds.length === 0 ||
				trainingTypeIds.length === 0 ||
				(actor.scopeSet.kind === 'groups' && actor.scopeSet.groupIds.length === 0)
			) {
				return new Map();
			}

			const client = getAdminClient();
			const completed = new Map<string, Set<string>>();
			const uniquePersonnelIds = [...new Set(personnelIds)];
			for (
				let batchStart = 0;
				batchStart < uniquePersonnelIds.length;
				batchStart += PERSONNEL_BATCH_SIZE * MAX_CONCURRENT_BATCHES
			) {
				const batches = Array.from({ length: MAX_CONCURRENT_BATCHES }, (_, index) =>
					uniquePersonnelIds.slice(
						batchStart + index * PERSONNEL_BATCH_SIZE,
						batchStart + (index + 1) * PERSONNEL_BATCH_SIZE
					)
				).filter((batch) => batch.length > 0);
				const results = await Promise.all(
					batches.map(async (batch) => {
						const records: Array<{ personnel_id: string; training_type_id: string }> = [];
						for (let offset = 0; ; offset += PAGE_SIZE) {
							let query = client
								.from('personnel_trainings')
								.select(
									'personnel_id, training_type_id, personnel!inner(organization_id, group_id), training_types!inner(organization_id)'
								)
								.eq('organization_id', actor.orgId)
								.eq('personnel.organization_id', actor.orgId)
								.eq('training_types.organization_id', actor.orgId)
								.in('personnel_id', batch)
								.in('training_type_id', trainingTypeIds);
							if (actor.scopeSet.kind === 'groups') {
								query = query.in('personnel.group_id', actor.scopeSet.groupIds);
							}
							const { data, error } = await query
								.order('personnel_id', { ascending: true })
								.order('training_type_id', { ascending: true })
								.order('id', { ascending: true })
								.range(offset, offset + PAGE_SIZE - 1);
							if (error) throw new Error(error.message);
							const page = (data ?? []) as Array<{ personnel_id: string; training_type_id: string }>;
							records.push(...page);
							if (page.length < PAGE_SIZE) break;
						}
						return records;
					})
				);
				for (const record of results.flat()) {
					const typeIds = completed.get(record.personnel_id) ?? new Set<string>();
					typeIds.add(record.training_type_id);
					completed.set(record.personnel_id, typeIds);
				}
			}
			return completed;
		}
	};
}
