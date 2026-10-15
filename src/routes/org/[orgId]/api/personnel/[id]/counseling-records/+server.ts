import { handle, readFormData, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { createRequestPersonnelArtifactsContext } from '$lib/server/adapters/requestContexts.server';
import type { RequestEvent } from '@sveltejs/kit';
import { routePersonnelId } from '../routeIds';

import type { PersonnelCounselingRecord } from '$features/personnel/contracts';
import {
	createPersonnelCounselingRecord,
	listPersonnelCounselingRecords,
	type PersonnelCounselingRecordInput
} from '$features/personnel/index.server';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';

export const _getConfig: RouteConfig<
	{ personnelId: string },
	PersonnelCounselingRecord[],
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => ({
		personnelId: routePersonnelId(event)
	}),
	fn: (ctx, input) => listPersonnelCounselingRecords(ctx, input.personnelId)
};

export const _postConfig: RouteConfig<
	PersonnelCounselingRecordInput,
	PersonnelCounselingRecord,
	ReturnType<typeof createRequestPersonnelArtifactsContext>
> = {
	context: createRequestPersonnelArtifactsContext,
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const formData = await readFormData(event);
		return {
			personnelId: routePersonnelId(event),
			dateConducted: String(formData.get('dateConducted') ?? ''),
			title: String(formData.get('title') ?? ''),
			summary: String(formData.get('summary') ?? ''),
			file: formData.get('file') as File
		};
	},
	fn: (ctx, input) => createPersonnelCounselingRecord(ctx, input)
};

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
