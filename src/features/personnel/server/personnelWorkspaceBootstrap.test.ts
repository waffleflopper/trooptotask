import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cookies } from '@sveltejs/kit';
import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
import type { PersonnelBootstrap } from '$lib/server/core/useCases/personnelWorkspaceQuery';
import type { Group } from '$lib/stores/groups.svelte';
import type { Personnel, PersonnelLookup, StatusType } from '$lib/types';

const { fetchPersonnelBootstrapMock, loadWithContextMock, mockCtx } = vi.hoisted(() => ({
	fetchPersonnelBootstrapMock: vi.fn(),
	loadWithContextMock: vi.fn(),
	mockCtx: {
		auth: {
			userId: 'user-1',
			orgId: '11111111-1111-1111-1111-111111111111'
		}
	}
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return {
		...actual,
		loadWithContext: loadWithContextMock
	};
});

vi.mock('$lib/server/core/useCases/personnelWorkspaceQuery', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/core/useCases/personnelWorkspaceQuery')>(
		'$lib/server/core/useCases/personnelWorkspaceQuery'
	);
	return {
		...actual,
		fetchPersonnelBootstrap: fetchPersonnelBootstrapMock
	};
});

import { streamPersonnelWorkspaceBootstrap } from './personnelWorkspaceBootstrap';

describe('streamPersonnelWorkspaceBootstrap', () => {
	const personnelData: PersonnelBootstrap = {
		personnel: [{ id: 'p1', firstName: 'John', lastName: 'Smith' } as Personnel],
		personnelLookup: [{ id: 'p1', rank: 'SGT', firstName: 'John', lastName: 'Smith' } as PersonnelLookup],
		groups: [{ id: 'g1', name: 'Alpha', sortOrder: 0 } as Group],
		statusTypes: [{ id: 'st1', name: 'Leave', color: '#ff0', textColor: '#000' } as StatusType],
		rankCatalog: [
			{
				organizationId: '11111111-1111-1111-1111-111111111111',
				code: 'SGT',
				label: 'Sergeant',
				service: 'army',
				category: 'enlisted',
				payGrade: 'E-5',
				state: 'active',
				source: 'built-in',
				sortOrder: 0
			}
		],
		pinnedGroups: ['Alpha'],
		lossWarningWindowDays: 180,
		awardTrackingAcknowledgedPersonnelIds: ['p1']
	};

	beforeEach(() => {
		vi.clearAllMocks();
		fetchPersonnelBootstrapMock.mockResolvedValue(personnelData);
		loadWithContextMock.mockImplementation((_locals, _cookies, _orgId, config) => {
			const data = Promise.resolve(config.fn(mockCtx as never));
			return config.defer ? Promise.resolve({ data }) : data;
		});
	});

	it('streams a lane-keyed Personnel workspace result with explicit Personnel hydration targets', async () => {
		const routeData = await streamPersonnelWorkspaceBootstrap({
			locals: {} as App.Locals,
			cookies: {} as Cookies,
			orgId: 'route-segment'
		});

		const workspace = await routeData.personnel.data;

		expect(loadWithContextMock).toHaveBeenCalledWith(
			expect.anything(),
			expect.anything(),
			'route-segment',
			expect.objectContaining({
				policyAction: POLICY_ACTION_CATALOG.personnel.viewRoster,
				policyResource: { kind: 'unscoped' },
				defer: true
			})
		);
		expect(loadWithContextMock.mock.calls[0]?.[3]).not.toHaveProperty('permission');
		expect(fetchPersonnelBootstrapMock).toHaveBeenCalledWith(mockCtx);
		expect(workspace).toEqual({
			laneKey: 'personnel',
			data: personnelData,
			hydration: {
				orgId: '11111111-1111-1111-1111-111111111111',
				personnel: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: personnelData.personnel
				},
				groups: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: personnelData.groups
				},
				statusTypes: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: personnelData.statusTypes
				},
				pinnedGroups: {
					mode: 'replace',
					deferred: false,
					snapshotKey: expect.any(String),
					items: personnelData.pinnedGroups
				}
			}
		});
		expect(workspace.hydration.personnel.snapshotKey).toMatch(/^resolved:/);
		expect(workspace.hydration.personnel.snapshotKey).not.toContain('John');
		expect(workspace.hydration.personnel.snapshotKey).not.toContain(JSON.stringify(personnelData.personnel));
	});
});
