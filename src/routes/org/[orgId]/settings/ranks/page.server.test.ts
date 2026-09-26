import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	addOrganizationRankServicePackMock,
	bulkSetOrganizationRankCatalogStateMock,
	buildRouteContextMock,
	createSupabaseRankCatalogAdministrationPortMock,
	loadRanksSettingsMock,
	loadSettingsPageMock,
	reactivateOrganizationRankCatalogEntryMock,
	removeOrganizationRankCatalogEntryMock,
	retireOrganizationRankCatalogEntryMock,
	saveOrganizationRankCatalogEntryMock
} = vi.hoisted(() => ({
	addOrganizationRankServicePackMock: vi.fn(),
	bulkSetOrganizationRankCatalogStateMock: vi.fn(),
	buildRouteContextMock: vi.fn(),
	createSupabaseRankCatalogAdministrationPortMock: vi.fn(),
	loadRanksSettingsMock: vi.fn(),
	loadSettingsPageMock: vi.fn(),
	reactivateOrganizationRankCatalogEntryMock: vi.fn(),
	removeOrganizationRankCatalogEntryMock: vi.fn(),
	retireOrganizationRankCatalogEntryMock: vi.fn(),
	saveOrganizationRankCatalogEntryMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);

	return {
		...actual,
		buildRouteContext: buildRouteContextMock
	};
});

vi.mock('$features/personnel/index.server', async () => {
	const actual = await vi.importActual<typeof import('$features/personnel/index.server')>(
		'$features/personnel/index.server'
	);

	return {
		...actual,
		createSupabaseRankCatalogAdministrationPort: createSupabaseRankCatalogAdministrationPortMock,
		addOrganizationRankServicePack: addOrganizationRankServicePackMock,
		bulkSetOrganizationRankCatalogState: bulkSetOrganizationRankCatalogStateMock,
		reactivateOrganizationRankCatalogEntry: reactivateOrganizationRankCatalogEntryMock,
		removeOrganizationRankCatalogEntry: removeOrganizationRankCatalogEntryMock,
		retireOrganizationRankCatalogEntry: retireOrganizationRankCatalogEntryMock,
		saveOrganizationRankCatalogEntry: saveOrganizationRankCatalogEntryMock
	};
});

vi.mock('../settingsLoad.server', () => ({
	loadSettingsPage: loadSettingsPageMock
}));

vi.mock('../settingsRanks.server', async () => {
	const actual = await vi.importActual<typeof import('../settingsRanks.server')>('../settingsRanks.server');

	return {
		...actual,
		loadRanksSettings: loadRanksSettingsMock
	};
});

import { actions, load } from './+page.server';

const routeContext = {
	auth: { orgId: 'org-1', role: 'owner' },
	store: { kind: 'store' },
	rawStore: { kind: 'raw-store' },
	audit: { kind: 'audit' }
};

function actionEvent(
	actionName: string,
	body: URLSearchParams,
	locals: Record<string, unknown> = { user: { id: 'user-1', email: 'user@example.com' }, supabase: {} }
) {
	return {
		request: new Request(`http://localhost/org/org-1/settings/ranks?/${actionName}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body
		}),
		locals,
		params: { orgId: 'org-1' },
		cookies: {},
		getClientAddress: () => '127.0.0.1'
	} as never;
}

describe('rank settings page server', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildRouteContextMock.mockResolvedValue(routeContext);
		createSupabaseRankCatalogAdministrationPortMock.mockReturnValue({ kind: 'rank-admin-port' });
		loadRanksSettingsMock.mockResolvedValue({ sections: { ranks: { commands: { canManageCatalog: true } } } });
		loadSettingsPageMock.mockImplementation(async (event, loader) => loader(routeContext, event));
		addOrganizationRankServicePackMock.mockImplementation(async (_ctx: unknown, input: { service: string }) => ({
			addedCount: input.service === 'navy' ? 7 : 0,
			skippedExistingCount: input.service === 'navy' ? 0 : 1
		}));
		bulkSetOrganizationRankCatalogStateMock.mockImplementation(
			async (_ctx: unknown, input: { service: string; targetState: string }) => ({
				changedCount: input.service === 'marine-corps' && input.targetState === 'retired' ? 2 : 1
			})
		);
		saveOrganizationRankCatalogEntryMock.mockImplementation(
			async (
				_ctx: unknown,
				input: {
					code: string;
					intent: string;
					originalCode: string;
					sortOrder: number;
				}
			) => ({
				code: `${input.intent}:${input.originalCode || 'new'}:${input.code}:${input.sortOrder}`
			})
		);
		reactivateOrganizationRankCatalogEntryMock.mockResolvedValue({ code: 'DET-SGT', state: 'active' });
		retireOrganizationRankCatalogEntryMock.mockResolvedValue({ code: 'DET-SGT', state: 'retired' });
		removeOrganizationRankCatalogEntryMock.mockResolvedValue(undefined);
	});

	it('loads rank settings data', async () => {
		const result = await load({ locals: {}, cookies: {}, parent: async () => ({}) } as never);

		expect(result).toEqual({
			ranksSettings: { sections: { ranks: { commands: { canManageCatalog: true } } } }
		});
	});

	it.each([
		{
			label: 'adds a built-in rank service pack from form data',
			run: () => actions.addServicePack(actionEvent('addServicePack', new URLSearchParams({ service: 'navy' }))),
			expected: { success: true, addedCount: 7, skippedExistingCount: 0 }
		},
		{
			label: 'retires active built-in ranks for a service branch in bulk',
			run: () =>
				actions.bulkRankState(
					actionEvent('bulkRankState', new URLSearchParams({ service: 'marine-corps', targetState: 'retired' }))
				),
			expected: { success: true, service: 'marine-corps', state: 'retired', changedCount: 2 }
		},
		{
			label: 'reactivates retired built-in ranks for a service branch in bulk',
			run: () =>
				actions.bulkRankState(
					actionEvent('bulkRankState', new URLSearchParams({ service: 'army', targetState: 'active' }))
				),
			expected: { success: true, service: 'army', state: 'active', changedCount: 1 }
		},
		{
			label: 'saves a custom rank from form data',
			run: () =>
				actions.saveRank(
					actionEvent(
						'saveRank',
						new URLSearchParams({
							code: 'DET-SGT',
							label: 'Detachment Sergeant',
							service: 'custom',
							category: 'custom',
							payGrade: 'ungraded',
							state: 'active',
							sortOrder: '500',
							intent: 'add'
						})
					)
				),
			expected: { success: true, code: 'create:new:DET-SGT:500' }
		},
		{
			label: 'reactivates retired ranks',
			run: () => actions.reactivateRank(actionEvent('reactivateRank', new URLSearchParams({ code: 'DET-SGT' }))),
			expected: { success: true, code: 'DET-SGT' }
		},
		{
			label: 'deletes unused ranks',
			run: () => actions.deleteRank(actionEvent('deleteRank', new URLSearchParams({ code: 'DET-SGT' }))),
			expected: { success: true, code: 'DET-SGT' }
		}
	])('$label', async ({ run, expected }) => {
		await expect(run()).resolves.toEqual(expected);
	});

	it('rejects edited rank submissions when the readonly code is tampered', async () => {
		const result = await actions.saveRank(
			actionEvent(
				'saveRank',
				new URLSearchParams({
					code: 'OTHER-SGT',
					originalCode: 'DET-SGT',
					intent: 'edit',
					label: 'Detachment Sergeant',
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded',
					state: 'active',
					sortOrder: '500'
				})
			)
		);

		expect(result).toMatchObject({
			status: 400,
			data: { rankError: 'Rank code cannot be changed from this edit form.' }
		});
	});

	it.each([
		{ label: 'blank', params: { sortOrder: '' } },
		{ label: 'missing', params: {} },
		{ label: 'non-numeric', params: { sortOrder: 'field-grade' } },
		{ label: 'decimal', params: { sortOrder: '1.5' } }
	])('returns rankError for $label rank sort order input', async ({ params }) => {
		const formData = new URLSearchParams({
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			intent: 'add'
		});
		if (typeof params.sortOrder === 'string') {
			formData.set('sortOrder', params.sortOrder);
		}

		const result = await actions.saveRank(actionEvent('saveRank', formData));

		expect(result).toMatchObject({
			status: 400,
			data: { rankError: 'Tie-break order must be a whole number.' }
		});
	});

	it('returns rankError when rank sort order exceeds PostgreSQL integer range', async () => {
		const result = await actions.saveRank(
			actionEvent(
				'saveRank',
				new URLSearchParams({
					code: 'DET-SGT',
					label: 'Detachment Sergeant',
					service: 'custom',
					category: 'custom',
					payGrade: 'ungraded',
					state: 'active',
					sortOrder: '2147483648',
					intent: 'add'
				})
			)
		);

		expect(result).toMatchObject({
			status: 400,
			data: { rankError: 'Tie-break order must fit within PostgreSQL integer range.' }
		});
	});

	it('retires ranks and maps denied writes to rankError action failures', async () => {
		retireOrganizationRankCatalogEntryMock.mockRejectedValueOnce(
			Object.assign(new Error('This action requires an organization admin or owner role'), { status: 403 })
		);

		const result = await actions.retireRank(actionEvent('retireRank', new URLSearchParams({ code: 'DET-SGT' })));

		expect(result).toMatchObject({
			status: 403,
			data: { rankError: 'This action requires an organization admin or owner role' }
		});
	});

	it('redirects unauthenticated users from rank actions', async () => {
		await expect(
			actions.addServicePack(actionEvent('addServicePack', new URLSearchParams({ service: 'navy' }), {}))
		).rejects.toMatchObject({ status: 303, location: '/auth/login' });
	});
});
