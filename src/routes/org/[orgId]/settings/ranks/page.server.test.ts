import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	addOrganizationRankServicePackMock,
	buildRouteContextMock,
	createSupabaseRankCatalogAdministrationPortMock,
	loadRanksSettingsMock,
	loadSettingsPageMock,
	removeOrganizationRankCatalogEntryMock,
	retireOrganizationRankCatalogEntryMock,
	saveOrganizationRankCatalogEntryMock
} = vi.hoisted(() => ({
	addOrganizationRankServicePackMock: vi.fn(),
	buildRouteContextMock: vi.fn(),
	createSupabaseRankCatalogAdministrationPortMock: vi.fn(),
	loadRanksSettingsMock: vi.fn(),
	loadSettingsPageMock: vi.fn(),
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

vi.mock('$lib/server/adapters/supabaseRankCatalogAdministration', () => ({
	createSupabaseRankCatalogAdministrationPort: createSupabaseRankCatalogAdministrationPortMock
}));

vi.mock('$lib/server/core/useCases/rankCatalog', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/rankCatalog')>(
		'$lib/server/core/useCases/rankCatalog'
	);

	return {
		...actual,
		addOrganizationRankServicePack: addOrganizationRankServicePackMock,
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
	audit: { kind: 'audit' },
	readOnlyGuard: { kind: 'read-only-guard' }
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
		addOrganizationRankServicePackMock.mockResolvedValue({ addedCount: 1, skippedExistingCount: 0 });
		saveOrganizationRankCatalogEntryMock.mockResolvedValue({ code: 'DET-SGT' });
		retireOrganizationRankCatalogEntryMock.mockResolvedValue({ code: 'DET-SGT', state: 'retired' });
		removeOrganizationRankCatalogEntryMock.mockResolvedValue(undefined);
	});

	it('loads rank settings through the shared settings page loader', async () => {
		const result = await load({ locals: {}, cookies: {}, parent: async () => ({}) } as never);

		expect(loadSettingsPageMock).toHaveBeenCalled();
		expect(loadRanksSettingsMock).toHaveBeenCalledWith(routeContext);
		expect(result).toEqual({
			ranksSettings: { sections: { ranks: { commands: { canManageCatalog: true } } } }
		});
	});

	it('adds a built-in rank service pack from form data', async () => {
		const result = await actions.addServicePack(
			actionEvent('addServicePack', new URLSearchParams({ service: 'navy' }))
		);

		expect(addOrganizationRankServicePackMock).toHaveBeenCalledWith(routeContext, { service: 'navy' });
		expect(result).toEqual({ success: true, addedCount: 1, skippedExistingCount: 0 });
	});

	it('parses custom rank save fields before delegating to the use case', async () => {
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
					sortOrder: '500'
				})
			)
		);

		expect(saveOrganizationRankCatalogEntryMock).toHaveBeenCalledWith(routeContext, {
			code: 'DET-SGT',
			label: 'Detachment Sergeant',
			service: 'custom',
			category: 'custom',
			payGrade: 'ungraded',
			state: 'active',
			sortOrder: 500
		});
		expect(result).toEqual({ success: true, code: 'DET-SGT' });
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
			state: 'active'
		});
		if (typeof params.sortOrder === 'string') {
			formData.set('sortOrder', params.sortOrder);
		}

		const result = await actions.saveRank(actionEvent('saveRank', formData));

		expect(saveOrganizationRankCatalogEntryMock).not.toHaveBeenCalled();
		expect(result).toMatchObject({
			status: 400,
			data: { rankError: 'Tie-break order must be a whole number.' }
		});
	});

	it('retires ranks and maps denied writes to rankError action failures', async () => {
		retireOrganizationRankCatalogEntryMock.mockRejectedValueOnce(
			Object.assign(new Error('This action requires an organization admin or owner role'), { status: 403 })
		);

		const result = await actions.retireRank(actionEvent('retireRank', new URLSearchParams({ code: 'DET-SGT' })));

		expect(retireOrganizationRankCatalogEntryMock).toHaveBeenCalledWith(routeContext, { code: 'DET-SGT' });
		expect(result).toMatchObject({
			status: 403,
			data: { rankError: 'This action requires an organization admin or owner role' }
		});
	});

	it('deletes unused ranks through the rank administration port', async () => {
		const result = await actions.deleteRank(actionEvent('deleteRank', new URLSearchParams({ code: 'DET-SGT' })));

		expect(createSupabaseRankCatalogAdministrationPortMock).toHaveBeenCalledWith(
			expect.objectContaining({ user: { id: 'user-1', email: 'user@example.com' } })
		);
		expect(removeOrganizationRankCatalogEntryMock).toHaveBeenCalledWith(
			{
				...routeContext,
				rankCatalogAdministration: { kind: 'rank-admin-port' }
			},
			{ code: 'DET-SGT' }
		);
		expect(result).toEqual({ success: true, code: 'DET-SGT' });
	});

	it('redirects unauthenticated users before invoking rank actions', async () => {
		await expect(
			actions.addServicePack(actionEvent('addServicePack', new URLSearchParams({ service: 'navy' }), {}))
		).rejects.toMatchObject({ status: 303, location: '/auth/login' });

		expect(buildRouteContextMock).not.toHaveBeenCalled();
		expect(addOrganizationRankServicePackMock).not.toHaveBeenCalled();
	});
});
