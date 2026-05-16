import type { RequestEvent } from '@sveltejs/kit';
import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { fail } from '$lib/server/core/errors';
import {
	createPersonnelCounselingRecord,
	listPersonnelCounselingRecords,
	type PersonnelCounselingRecordInput
} from '$lib/server/core/useCases/personnelCounselingRecords';
import type { PersonnelCounselingRecord } from '$features/personnel/personnel-detail.types';

function personnelIdFromEvent(event: RequestEvent): string {
	const personnelId = event.params.id;
	if (!personnelId) fail(400, 'Missing personnel id');
	return personnelId;
}

export const _getConfig: RouteConfig<{ personnelId: string }, PersonnelCounselingRecord[]> = {
	permission: 'personnel',
	deferPolicyToUseCase: true,
	parseInput: async (event: RequestEvent) => ({
		personnelId: personnelIdFromEvent(event)
	}),
	fn: (ctx, input) => listPersonnelCounselingRecords(ctx, input.personnelId)
};

export const _postConfig: RouteConfig<PersonnelCounselingRecordInput, PersonnelCounselingRecord> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
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
	fn: (ctx, input) => createPersonnelCounselingRecord(ctx, input)
};

export const GET = handle(_getConfig);
export const POST = handle(_postConfig);
