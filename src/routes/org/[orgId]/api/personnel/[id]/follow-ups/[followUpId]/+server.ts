import type { RequestEvent } from '@sveltejs/kit';
import { fail } from '$lib/server/core/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import {
	archivePersonnelFollowUp,
	setPersonnelFollowUpStatus,
	updatePersonnelFollowUp
} from '$lib/server/core/useCases/personnelFollowUps';

function routeIds(event: RequestEvent): { personnelId: string; followUpId: string } {
	const personnelId = event.params.id;
	const followUpId = event.params.followUpId;
	if (!personnelId) fail(400, 'Missing personnel id');
	if (!followUpId) fail(400, 'Missing follow-up id');
	return { personnelId, followUpId };
}

export const _patchConfig: RouteConfig<Record<string, unknown>, unknown> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
	parseInput: async (event) => {
		const ids = routeIds(event);
		const body = (await event.request.json()) as Record<string, unknown>;
		return { ...body, ...ids };
	},
	fn: (ctx, input) => {
		const hasEditFields = input.title !== undefined || input.notes !== undefined || input.dueDate !== undefined;
		if (input.status !== undefined && hasEditFields) {
			fail(400, 'Update status separately from follow-up details');
		}
		if (input.status === 'archived') return archivePersonnelFollowUp(ctx, input);
		if (input.status === 'open' || input.status === 'completed') return setPersonnelFollowUpStatus(ctx, input);
		return updatePersonnelFollowUp(ctx, input);
	}
};

export const PATCH = handle(_patchConfig);
