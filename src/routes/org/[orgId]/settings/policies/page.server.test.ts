import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PoliciesSettingsPorts } from '../settingsPolicies.server';
import { createReadyAppShellRouteData, createOrganizationLoadEventData } from '../../appShell.test-support';

const { loadWithContextMock } = vi.hoisted(() => ({ loadWithContextMock: vi.fn() }));

vi.mock('$lib/server/adapters/httpAdapter', () => ({ loadWithContext: loadWithContextMock }));

import { load } from './+page.server';

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('policies settings page server', () => {
	it('subscribes to viewer-day changes and uses the viewer day for policy consequences', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date('2026-10-20T02:00:00Z'));
		const ports: PoliciesSettingsPorts = {
			auth: { orgId: 'org-1' },
			disabledFeatures: ['training', 'lossesAndAwards'],
			organizationSettings: { findPolicies: async () => null },
			roster: { listLossCandidates: async () => [], findOldestArchivedAt: async () => null },
			readTrainingBriefing: async () => {
				throw new Error('Training is disabled');
			}
		};
		loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) => config.fn(ports));
		const depends = vi.fn();

		const result = await load({
			cookies: { get: (name: string) => (name === 't2t_tz' ? 'America/New_York' : undefined) },
			...createOrganizationLoadEventData(createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'Test Org' })),
			depends
		} as never);

		expect(depends).toHaveBeenCalledWith('app:viewer-day');
		expect(result).toMatchObject({ policiesSettings: { today: '2026-10-19' } });
	});
});
