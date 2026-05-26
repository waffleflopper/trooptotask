import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { DashboardBootstrap } from '$lib/server/core/useCases/dashboardQuery';

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

import { createSupabaseDashboardWorkspacePort } from './supabaseOrgShell';

describe('createSupabaseDashboardWorkspacePort', () => {
	const dashboardBootstrap: DashboardBootstrap = {
		availabilityEntries: [],
		assignmentTypes: [],
		todayAssignments: [],
		pinnedGroups: [],
		ratingSchemeEntries: [],
		activeOnboardings: [],
		todayDutyEvents: [],
		personnel: [],
		groups: [],
		statusTypes: [],
		trainingTypes: [],
		lossWarningWindowDays: 180,
		awardTrackingAcknowledgedPersonnelIds: []
	};

	beforeEach(() => {
		vi.clearAllMocks();
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve(dashboardBootstrap);
			return config.defer ? Promise.resolve({ data }) : data;
		});
	});

	it('lets identity-owned dashboard authorization resolve the current user resource', async () => {
		const port = createSupabaseDashboardWorkspacePort(
			{} as App.Locals,
			{} as Cookies,
			'11111111-1111-1111-1111-111111111111'
		);

		const streamed = await port.streamWorkspaceData<DashboardBootstrap>('dashboard');

		await expect(streamed.data).resolves.toEqual(dashboardBootstrap);
		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'11111111-1111-1111-1111-111111111111',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.identity.viewDashboard,
				defer: true,
				fn: expect.any(Function)
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('policyResource');
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
	});
});
