import { describe, expect, it, vi } from 'vitest';
import { createTestContext } from '$lib/server/adapters/inMemory';
import type { OrganizationOverviewCountsPort, OrganizationUnitCountsPort } from '$features/organization/index.server';
import { createReadyAppShellRouteData, createOrganizationLoadEventData } from '../../appShell.test-support';

const { loadWithContextMock, createOverviewContextMock } = vi.hoisted(() => ({
	loadWithContextMock: vi.fn(),
	createOverviewContextMock: vi.fn()
}));

vi.mock('$lib/server/adapters/httpAdapter', async () => {
	const actual = await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>(
		'$lib/server/adapters/httpAdapter'
	);
	return { ...actual, loadWithContext: loadWithContextMock };
});

vi.mock('../settingsRequestContexts.server', async () => {
	const actual = await vi.importActual<typeof import('../settingsRequestContexts.server')>(
		'../settingsRequestContexts.server'
	);
	return { ...actual, createSettingsOverviewContext: createOverviewContextMock };
});

import { load } from './+page.server';
import { loadWithContextCore } from '$lib/server/adapters/httpAdapter';

const CAPABILITIES = {
	calendar: 'configure',
	personnel: 'configure',
	training: 'configure',
	criticalTasks: 'configure',
	onboarding: 'configure',
	ratingScheme: 'configure'
} as const;

const TABLE_COUNTS: Record<string, number> = { training_types: 5, ict_tasks: 0, onboarding_templates: 0 };

const unitCounts: OrganizationUnitCountsPort = {
	countRows: async ({ table }) => TABLE_COUNTS[table] ?? 0,
	countRatingSchemeEntries: async () => 12
};

function event(role: 'owner' | 'admin' | 'member') {
	return {
		depends: () => undefined,
		cookies: {},
		...createOrganizationLoadEventData(
			createReadyAppShellRouteData({ orgId: 'org-1', orgName: 'C Co', orgUrlSegment: 'c-co', role })
		)
	} as never;
}

function admit(role: 'owner' | 'admin' | 'member', overviewCounts: OrganizationOverviewCountsPort) {
	const ctx = createTestContext({
		auth: {
			orgId: 'org-1',
			role,
			isPrivileged: role !== 'member',
			capabilityMap: CAPABILITIES,
			scopeSet: { kind: 'organization' }
		}
	});
	createOverviewContextMock.mockReturnValue({ disabledFeatures: ['evaluations'], unitCounts, overviewCounts });
	loadWithContextMock.mockImplementationOnce(async (_locals, _cookies, _orgId, config) =>
		loadWithContextCore(ctx, config, () => config.context(ctx))
	);
}

describe('overview settings page server', () => {
	it.each(['owner', 'admin'] as const)('streams the three checks to an %s', async (role) => {
		admit(role, { countActiveUngroupedPeople: async () => 4, countMembersCoveringNoGroups: async () => 2 });

		const data = (await load(event(role))) as {
			settingsOverview: {
				ungroupedPeople: Promise<number>;
				membersCoveringNoGroups: Promise<number>;
				featuresNotSetUp: Promise<string[]>;
			};
		};

		expect(await data.settingsOverview.ungroupedPeople).toBe(4);
		expect(await data.settingsOverview.membersCoveringNoGroups).toBe(2);
		expect(await data.settingsOverview.featuresNotSetUp).toEqual(['criticalTasks', 'onboarding']);
	});

	it('answers before any count settles', async () => {
		const never = new Promise<number>(() => {});
		admit('owner', { countActiveUngroupedPeople: () => never, countMembersCoveringNoGroups: () => never });

		await expect(load(event('owner'))).resolves.toHaveProperty('settingsOverview');
	});

	it('denies a member with configure authority before any port is built or read', async () => {
		const countActiveUngroupedPeople = vi.fn(async () => 1);
		admit('member', { countActiveUngroupedPeople, countMembersCoveringNoGroups: async () => 1 });

		await expect(load(event('member'))).rejects.toMatchObject({ status: 403 });
		expect(createOverviewContextMock).not.toHaveBeenCalled();
		expect(countActiveUngroupedPeople).not.toHaveBeenCalled();
	});
});
