import { describe, expect, it, vi } from 'vitest';
import { createSuspendedAppShellRouteData } from '../../appShell.test-support';
import { load } from './+page.server';

describe('approvals settings page load', () => {
	it('registers the pending approvals read so a review refreshes the list without other loads', async () => {
		const depends = vi.fn();

		const result = await load({
			locals: {},
			cookies: {},
			depends,
			parent: async () => createSuspendedAppShellRouteData()
		} as never);

		expect(depends.mock.calls).toEqual([['app:settings-pending-approvals']]);
		expect(result).toEqual({});
	});
});
