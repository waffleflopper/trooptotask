import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import type { TrainingBootstrap } from '$lib/server/core/useCases/trainingQuery';

const { findManyMock, loadWithContextMock, mockCtx } = vi.hoisted(() => {
	const findManyMock = vi.fn();
	const loadWithContextMock = vi.fn();

	return {
		findManyMock,
		loadWithContextMock,
		mockCtx: {
			auth: {
				userId: 'user-1'
			},
			store: {
				findMany: findManyMock
			}
		}
	};
});

vi.mock('./httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('./httpAdapter')>('./httpAdapter');
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

import { createSupabaseTrainingWorkspacePort } from './supabaseOrgShell';

describe('createSupabaseTrainingWorkspacePort', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = config.fn(mockCtx as never);
			return config.defer ? { data } : data;
		});
	});

	it('streams the outer training bootstrap before deferred reference queries resolve', async () => {
		const deferredRows = new Promise<Record<string, unknown>[]>(() => undefined);

		findManyMock.mockImplementation((table: string) => {
			switch (table) {
				case 'personnel':
				case 'groups':
				case 'training_types':
				case 'training_views':
				case 'user_pinned_groups':
				case 'personnel_trainings':
					return deferredRows;
				default:
					throw new Error(`Unexpected table ${table}`);
			}
		});

		const port = createSupabaseTrainingWorkspacePort(
			{} as App.Locals,
			{} as Cookies,
			'11111111-1111-1111-1111-111111111111'
		);
		const streamed = await port.streamWorkspaceData<TrainingBootstrap>('training');
		let bootstrap: TrainingBootstrap | undefined;

		void streamed.data.then((value) => {
			bootstrap = value;
		});

		await new Promise((resolve) => setTimeout(resolve, 0));

		expect(bootstrap).toBeDefined();
		expect(bootstrap?.personnel).toBeInstanceOf(Promise);
		expect(bootstrap?.groups).toBeInstanceOf(Promise);
		expect(bootstrap?.trainingTypes).toBeInstanceOf(Promise);
		expect(bootstrap?.trainingViews).toBeInstanceOf(Promise);
		expect(bootstrap?.pinnedGroups).toBeInstanceOf(Promise);
		expect(bootstrap?.personnelTrainings).toBeInstanceOf(Promise);
	});
});
