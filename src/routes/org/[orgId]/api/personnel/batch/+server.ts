import { handle } from '$lib/server/adapters/httpAdapter';
import { importPersonnelBatch } from '$lib/server/core/useCases/personnelBatch';

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'personnel',
	mutation: true,
	fn: (ctx, input) =>
		importPersonnelBatch(ctx, {
			records: input.records as Array<{
				rank: string;
				lastName: string;
				firstName: string;
				mos?: string;
				clinicRole?: string;
				groupName?: string;
			}>
		})
});
