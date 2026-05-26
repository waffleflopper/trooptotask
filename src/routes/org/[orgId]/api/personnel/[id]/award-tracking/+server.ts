import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { RequestEvent } from '@sveltejs/kit';
import {
	setPersonnelAwardTrackingAcknowledged,
	type PersonnelAwardTrackingResult
} from '$lib/server/core/useCases/personnelAwardTracking';

interface PersonnelAwardTrackingInput {
	personnelId: string;
	acknowledged: boolean;
}

export const _postConfig: RouteConfig<PersonnelAwardTrackingInput, PersonnelAwardTrackingResult> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const body = (await event.request.json()) as { acknowledged?: boolean };
		return {
			personnelId: event.params.id as string,
			acknowledged: body.acknowledged === true
		};
	},
	fn: (ctx, input) => setPersonnelAwardTrackingAcknowledged(ctx, input)
};

export const POST = handle(_postConfig);
