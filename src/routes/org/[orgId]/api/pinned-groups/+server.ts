import { handle } from '$lib/server/adapters/httpAdapter';
import { createPinnedGroupUseCases } from '$lib/server/core/useCases/pinnedGroupCrud';

const useCases = createPinnedGroupUseCases();

export const POST = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: async (ctx, input) => {
		if (input.action === 'replace') {
			const groups = (input.groups as string[]) ?? [];
			return useCases.replace(ctx, groups);
		}
		return useCases.pin(ctx, {
			groupName: input.groupName as string,
			sortOrder: (input.sortOrder as number) ?? 0
		});
	}
});

export const DELETE = handle<Record<string, unknown>, unknown>({
	permission: 'calendar',
	mutation: true,
	fn: (ctx, input) => useCases.unpin(ctx, input.groupName as string)
});
