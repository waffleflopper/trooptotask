import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSuspendedAppShellRouteData, createOrganizationLoadEventData } from '../appShell.test-support';

const { loadWithContextMock } = vi.hoisted(() => ({ loadWithContextMock: vi.fn() }));
vi.mock('$lib/server/adapters/httpAdapter', async () => ({
	...(await vi.importActual<typeof import('$lib/server/adapters/httpAdapter')>('$lib/server/adapters/httpAdapter')),
	loadWithContext: loadWithContextMock
}));

import { load as settingsLayout } from './+layout.server';
import { load as settingsIndex } from './+page.server';
import { load as approvals } from './approvals/+page.server';
import { load as archives } from './archives/+page.server';
import { load as danger } from './danger/+page.server';
import { load as exportsLayout } from './exports/+layout.server';
import { load as exports } from './exports/+page.server';
import { load as features } from './features/+page.server';
import { load as general } from './general/+page.server';
import { load as logsLayout } from './logs/+layout.server';
import { load as logs } from './logs/+page.server';
import { load as members } from './members/+page.server';
import { load as overview } from './overview/+page.server';
import { load as policies } from './policies/+page.server';
import { load as ranks } from './ranks/+page.server';

const loaders: [string, (event: never) => unknown][] = [
	['+layout', settingsLayout],
	['+page', settingsIndex],
	['approvals/+page', approvals],
	['archives/+page', archives],
	['danger/+page', danger],
	['exports/+layout', exportsLayout],
	['exports/+page', exports],
	['features/+page', features],
	['general/+page', general],
	['logs/+layout', logsLayout],
	['logs/+page', logs],
	['members/+page', members],
	['overview/+page', overview],
	['policies/+page', policies],
	['ranks/+page', ranks]
];

function suspendedEvent() {
	return {
		cookies: { get: () => undefined },
		depends: () => undefined,
		url: new URL('https://app.test/org/test-org/settings'),
		route: { id: '/org/[orgId]/settings/general' },
		untrack: (fn: () => unknown) => fn(),
		...createOrganizationLoadEventData(
			createSuspendedAppShellRouteData({ orgId: '11111111-1111-4111-8111-111111111111', orgUrlSegment: 'test-org' })
		)
	} as never;
}

describe('Settings loads for a suspended unit', () => {
	beforeEach(() => loadWithContextMock.mockReset());

	it.each(loaders)('settings/%s sends the member to the unit home', async (_file, load) => {
		await expect(async () => load(suspendedEvent())).rejects.toMatchObject({
			status: 303,
			location: '/org/test-org'
		});
		expect(loadWithContextMock).not.toHaveBeenCalled();
	});
});
