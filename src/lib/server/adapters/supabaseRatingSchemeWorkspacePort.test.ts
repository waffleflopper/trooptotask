import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';

const { loadWithContextMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn()
}));

vi.mock('./httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('./httpAdapter')>('./httpAdapter');
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

import { createSupabaseRatingSchemeWorkspacePort } from './supabaseOrgShell';

describe('createSupabaseRatingSchemeWorkspacePort', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockResolvedValue({
			personnelLookup: [],
			ratingSchemeEntries: [],
			lossWarningWindowDays: 180
		});
	});

	it('delegates authorization to Rating Scheme policy decisions in the workspace query', async () => {
		const orgId = '11111111-1111-1111-1111-111111111111';
		const port = createSupabaseRatingSchemeWorkspacePort({} as App.Locals, {} as Cookies, orgId);

		await port.getWorkspaceData('rating-scheme');

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			orgId,
			expect.objectContaining({ permission: 'none' })
		);
	});
});
