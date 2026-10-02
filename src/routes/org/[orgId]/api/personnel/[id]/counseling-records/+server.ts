import { personnelArtifactsContext, handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import type { RequestEvent } from '@sveltejs/kit';

import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import { fail } from '$lib/errors';
import {
	createPersonnelCounselingRecord,
	listPersonnelCounselingRecords,
	type PersonnelCounselingRecordInput
} from '$features/personnel/index.server';
import type { PersonnelCounselingRecord } from '$features/personnel/contracts';

function personnelIdFromEvent(event: RequestEvent): string {
	const personnelId = event.params.id;
	if (!personnelId) fail(400, 'Missing personnel id');
	return personnelId;
}

export const _getConfig: RouteConfig<{ personnelId: string }, PersonnelCounselingRecord[]> = {
	policyAction: POLICY_ACTION_CATALOG.personnel.readSensitiveRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => ({
		personnelId: personnelIdFromEvent(event)
	}),
	fn: (ctx, input) => listPersonnelCounselingRecords(personnelArtifactsContext(ctx), input.personnelId)
};

export const _postConfig: RouteConfig<PersonnelCounselingRecordInput, PersonnelCounselingRecord> = {
	mutation: true,
	policyAction: POLICY_ACTION_CATALOG.personnel.manageRecords,
	policyResource: { kind: 'unscoped' },
	parseInput: async (event: RequestEvent) => {
		const formData = await event.request.formData();
		return {
			personnelId: personnelIdFromEvent(event),
			dateConducted: String(formData.get('dateConducted') ?? ''),
			title: String(formData.get('title') ?? ''),
			summary: String(formData.get('summary') ?? ''),
			file: formData.get('file') as File
		};
	},
	fn: (ctx, input) => createPersonnelCounselingRecord(personnelArtifactsContext(ctx), input)
};

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
