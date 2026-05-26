import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { mergePersonnelBatch } from '$lib/server/core/useCases/personnelMergeBatch';

interface PersonnelMergeRecord {
	rank: string;
	lastName: string;
	firstName: string;
	groupName?: string | null;
	ets?: string | null;
	deros?: string | null;
}

interface PersonnelMergeInput {
	records: PersonnelMergeRecord[];
}

export const _postConfig: RouteConfig<PersonnelMergeInput, Awaited<ReturnType<typeof mergePersonnelBatch>>> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.mergeRecords,
	policyResource: { kind: 'unscoped' },
	fn: (ctx, input) => mergePersonnelBatch(ctx, input)
};

export const POST = handle(_postConfig);
