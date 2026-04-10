import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrainingType } from '$features/training/training.types';

const { loadWithContextMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', () => ({
	loadWithContext: loadWithContextMock
}));

import { load } from './+page.server';

describe('onboarding templates page server load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockResolvedValue({
			templates: [],
			templateSteps: []
		});
	});

	it('materializes streamed onboarding workspace data before reading training types', async () => {
		const trainingTypes = [{ id: 'tt1', name: 'CPR' } as TrainingType];

		const result = await load({
			params: { orgId: 'org-1' },
			locals: { session: null },
			cookies: {},
			parent: vi.fn().mockResolvedValue({
				onboarding: {
					data: Promise.resolve({
						workspace: 'onboarding',
						data: {
							trainingTypes
						}
					})
				}
			})
		} as never);

		expect(loadWithContextMock).toHaveBeenCalledOnce();
		expect(result).toEqual({
			session: null,
			orgId: 'org-1',
			templates: [],
			templateSteps: [],
			trainingTypes
		});
	});
});
