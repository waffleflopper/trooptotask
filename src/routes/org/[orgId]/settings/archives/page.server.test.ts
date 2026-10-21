import { describe, expect, it, vi } from 'vitest';
import { createSuspendedAppShellRouteData } from '../../appShell.test-support';
import { load } from './+page.server';

describe('archives settings page load', () => {
	it('registers the archived people read so a restore or delete refreshes the list without other loads', async () => {
		const depends = vi.fn();

		const result = await load({
			locals: {},
			cookies: {},
			depends,
			parent: async () => createSuspendedAppShellRouteData()
		} as never);

		expect(depends.mock.calls).toEqual([['app:settings-archived-people']]);
		expect(result).toEqual({});
	});
});
