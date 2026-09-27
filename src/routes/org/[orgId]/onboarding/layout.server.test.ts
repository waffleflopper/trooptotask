import { describe, expect, it, vi } from 'vitest';
import { createCapabilityMap } from '$lib/access/memberAccessShape';
import { createReadyAppShellRouteData } from '$lib/test-support/appShellRouteData';
import { _createOnboardingLayoutLoad } from './+layout.server';

type OnboardingLoadEvent = Parameters<ReturnType<typeof _createOnboardingLayoutLoad>>[0];

function eventFor(onboarding: 'none' | 'view') {
	const parentData = createReadyAppShellRouteData({ orgId: 'org-1', role: 'member' });
	if (parentData.shell.kind !== 'ready') throw new Error('Expected ready shell fixture');
	parentData.shell.member.capabilityMap = { ...createCapabilityMap('none'), onboarding };
	parentData.shell.member.scopeSet = { kind: 'groups', groupIds: ['group-1'] };
	return {
		locals: {} as App.Locals,
		cookies: {} as import('@sveltejs/kit').Cookies,
		url: new URL('https://example.test/org/org-1/onboarding'),
		depends: vi.fn(),
		parent: vi.fn(async () => parentData)
	} as unknown as OnboardingLoadEvent;
}

describe('Onboarding layout admission', () => {
	it('returns an explicit forbidden page before streaming for a member without Onboarding view', async () => {
		const stream = vi.fn();
		const load = _createOnboardingLayoutLoad({ streamOnboardingWorkspace: stream });

		await expect(load(eventFor('none'))).rejects.toMatchObject({ status: 403 });
		expect(stream).not.toHaveBeenCalled();
	});

	it('streams for a Group-scoped Onboarding viewer without Personnel or Training capability', async () => {
		const stream = vi.fn(async () => ({ onboarding: { data: Promise.resolve(null as never) } }));
		const load = _createOnboardingLayoutLoad({ streamOnboardingWorkspace: stream });

		await load(eventFor('view'));
		expect(stream).toHaveBeenCalled();
	});
});
