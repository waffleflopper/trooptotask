import { describe, expect, it, vi } from 'vitest';
import { createSuspendedAppShellRouteData } from '../../appShell.test-support';
import { load } from './+page.server';

describe('approvals settings page load', () => {
	it('registers the pending approvals read for review refreshes', async () => {
		const depends = vi.fn();

		await load({
			locals: {},
			cookies: {},
			depends,
			parent: async () => createSuspendedAppShellRouteData()
		} as never);

		expect(depends.mock.calls).toEqual([['app:settings-pending-approvals']]);
	});
});
