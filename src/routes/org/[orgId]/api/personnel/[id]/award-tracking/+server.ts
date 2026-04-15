import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
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
	permission: 'personnel',
	mutation: true,
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
