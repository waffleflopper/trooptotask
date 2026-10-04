import { updatePersonnelExtendedInfo } from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelExtendedInfoContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';

export const _putConfig: RouteConfig<
	Record<string, unknown>,
	unknown,
	ReturnType<typeof createRequestPersonnelExtendedInfoContext>
> = {
	context: createRequestPersonnelExtendedInfoContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const body = (await event.request.json()) as Record<string, unknown>;
		const personnelId = event.params.id;
		if (!personnelId) fail(400, 'Missing personnel id');
		if (typeof body.personnelId === 'string' && body.personnelId !== personnelId) {
			fail(400, 'Personnel id mismatch');
		}
		return { ...body, personnelId };
	},
	fn: (ctx, input) => updatePersonnelExtendedInfo(ctx, input)
};

export const PUT = handle(_putConfig);
