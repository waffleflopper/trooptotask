import { createClient } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	addOrganizationRankServicePackMock,
	buildRouteRequestMock,
	createSupabaseRankCatalogAdministrationPortMock,
	loadRanksSettingsMock,
	loadSettingsPageMock,
	removeOrganizationRankCatalogEntryMock,
	setOrganizationRankCatalogStatesMock,
	saveOrganizationRankCatalogEntryMock
} = vi.hoisted(() => ({
	addOrganizationRankServicePackMock: vi.fn(),
	buildRouteRequestMock: vi.fn(),
	createSupabaseRankCatalogAdministrationPortMock: vi.fn(),
	loadRanksSettingsMock: vi.fn(),
	loadSettingsPageMock: vi.fn(),
	removeOrganizationRankCatalogEntryMock: vi.fn(),
	setOrganizationRankCatalogStatesMock: vi.fn(),
	saveOrganizationRankCatalogEntryMock: vi.fn()
}));

vi.mock('$lib/server/adapters/requestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/requestContexts.server')>(
		'$lib/server/adapters/requestContexts.server'
	);

	return {
		...actual,
		buildRouteRequest: buildRouteRequestMock
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
		removeOrganizationRankCatalogEntry: removeOrganizationRankCatalogEntryMock,
		setOrganizationRankCatalogStates: setOrganizationRankCatalogStatesMock,
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
import { createSettingsRanksContext } from '../settingsRequestContexts.server';
import { RequestFailure } from '$lib/errors';

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
		buildRouteRequestMock.mockResolvedValue(routeContext);
		createSupabaseRankCatalogAdministrationPortMock.mockReturnValue({ kind: 'rank-admin-port' });
		setOrganizationRankCatalogStatesMock.mockResolvedValue({ changedCount: 2 });
	});

	it('uses saved roster rank references for both Settings warnings and deletion decisions', async () => {
		const supabase = createClient('http://ordinary.invalid', 'synthetic-ordinary-key', {
			auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
			global: {
				fetch: async (input) => {
					const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
					if (url.pathname !== '/rest/v1/sign_in_rosters' || url.searchParams.get('organization_id') !== 'eq.org-1')
						throw new Error('Unexpected roster reference read');
					return Response.json([{ filter_config: { ranks: ['DET-SGT'] }, personnel_snapshot: [] }]);
				}
			}
		});
		const request = { ...routeContext, supabase };
		buildRouteRequestMock.mockResolvedValue(request);
		loadSettingsPageMock.mockImplementation(async (_event, context, loader) => loader(context(request)));
		loadRanksSettingsMock.mockImplementation(async (ctx: ReturnType<typeof createSettingsRanksContext>) => ({
			warnings: await ctx.readSignInRosterRankReferences()
		}));
		removeOrganizationRankCatalogEntryMock.mockImplementation(async (_ctx, _input, _training, readRosters) => {
			const references = await readRosters();
			if (references.some((row: { filterRanks: string[] }) => row.filterRanks.includes('DET-SGT')))
				throw new RequestFailure(409, 'Retire referenced rank instead');
		});

		await expect(load({ locals: {}, cookies: {}, parent: async () => ({}) } as never)).resolves.toEqual({
			ranksSettings: { warnings: [{ filterRanks: ['DET-SGT'], snapshotRanks: [] }] }
		});
		await expect(
			actions.deleteRank(actionEvent('deleteRank', new URLSearchParams({ code: 'DET-SGT' })))
		).resolves.toMatchObject({
			status: 409,
			data: { rankError: 'Retire referenced rank instead' }
		});
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
		expect(saveOrganizationRankCatalogEntryMock).not.toHaveBeenCalled();
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
		expect(saveOrganizationRankCatalogEntryMock).not.toHaveBeenCalled();
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
		expect(saveOrganizationRankCatalogEntryMock).not.toHaveBeenCalled();
	});

	it('sends each posted rank with its own state', async () => {
		const body = new URLSearchParams([
			['code', 'CPL'],
			['state', 'retired'],
			['code', 'DET-SGT'],
			['state', 'active']
		]);

		const result = await actions.setRankStates(actionEvent('setRankStates', body));

		expect(result).toEqual({ success: true, changedCount: 2 });
		expect(setOrganizationRankCatalogStatesMock.mock.calls[0][1]).toEqual({
			changes: [
				{ code: 'CPL', state: 'retired' },
				{ code: 'DET-SGT', state: 'active' }
			]
		});
	});

	it('maps denied rank state writes to rankError action failures', async () => {
		setOrganizationRankCatalogStatesMock.mockRejectedValueOnce(
			new RequestFailure(403, 'This action requires an organization admin or owner role')
		);

		const result = await actions.setRankStates(
			actionEvent('setRankStates', new URLSearchParams({ code: 'DET-SGT', state: 'retired' }))
		);

		expect(result).toMatchObject({
			status: 403,
			data: { rankError: 'This action requires an organization admin or owner role' }
		});
	});

	it('redirects unauthenticated users from rank actions', async () => {
		await expect(
			actions.addServicePack(actionEvent('addServicePack', new URLSearchParams({ service: 'navy' }), {}))
		).rejects.toMatchObject({ status: 303, location: '/auth/login' });
		expect(addOrganizationRankServicePackMock).not.toHaveBeenCalled();
	});
});
