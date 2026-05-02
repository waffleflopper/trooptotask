import { handle, type RouteConfig } from '$lib/server/adapters/httpAdapter';
import { importPersonnelBatch } from '$lib/server/core/useCases/personnelBatch';

export const _postConfig: RouteConfig<Record<string, unknown>, unknown> = {
	permission: 'personnel',
	mutation: true,
	deferPolicyToUseCase: true,
	fn: (ctx, input) =>
		importPersonnelBatch(ctx, {
			records: input.records as Array<{
				rank: string;
				lastName: string;
				firstName: string;
				mos?: string | null;
				clinicRole?: string | null;
				groupName?: string | null;
				ets?: string | null;
				deros?: string | null;
			}>
		})
};

export const POST = handle(_postConfig);
