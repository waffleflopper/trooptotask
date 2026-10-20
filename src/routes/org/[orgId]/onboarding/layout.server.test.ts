import { describe, expect, it, vi } from 'vitest';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { createReadyAppShellRouteData, createUrlBlindLayoutEvent } from '../appShell.test-support';
import { _createOnboardingLayoutLoad } from './+layout.server';

type OnboardingLoadEvent = Parameters<ReturnType<typeof _createOnboardingLayoutLoad>>[0];

function eventFor(onboarding: 'none' | 'view') {
	const parentData = createReadyAppShellRouteData({ orgId: 'org-1', role: 'member' });
	if (parentData.shell.kind !== 'ready') throw new Error('Expected ready shell fixture');
	parentData.shell.member.capabilityMap = { ...createCapabilityMap('none'), onboarding };
	parentData.shell.member.scopeSet = { kind: 'groups', groupIds: ['group-1'] };
	return createUrlBlindLayoutEvent<OnboardingLoadEvent>(parentData);
}

describe('Onboarding layout', () => {
	it('returns an explicit forbidden page before streaming for a member without Onboarding view', async () => {
		const stream = vi.fn();
		const load = _createOnboardingLayoutLoad({ streamOnboardingWorkspace: stream });

		await expect(load(eventFor('none').event)).rejects.toMatchObject({ status: 403 });
		expect(stream).not.toHaveBeenCalled();
	});

	it('streams the active workspace for a Group-scoped viewer without reading the URL', async () => {
		const workspace = { onboarding: { data: Promise.resolve(null as never) } };
		const stream = vi.fn(async () => workspace);
		const { event, depends } = eventFor('view');

		expect(await _createOnboardingLayoutLoad({ streamOnboardingWorkspace: stream })(event)).toBe(workspace);
		expect(stream).toHaveBeenCalledWith(expect.objectContaining({ orgId: 'org-1' }));
		expect(depends).toHaveBeenCalledWith('app:org-core', 'app:onboarding-data', 'app:viewer-day');
	});
});
