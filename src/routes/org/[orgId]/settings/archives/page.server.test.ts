import { describe, expect, it, vi } from 'vitest';
import { createSuspendedAppShellRouteData, createOrganizationLoadEventData } from '../../appShell.test-support';
import { load } from './+page.server';

describe('archives settings page load', () => {
	it('registers the archived people read for restore and delete refreshes', async () => {
		const depends = vi.fn();

		const result = await load({
			cookies: {},
			depends,
			...createOrganizationLoadEventData(createSuspendedAppShellRouteData())
		} as never);

		expect(result).toEqual({});
		expect(depends).toHaveBeenCalledWith('app:settings-archived-people', 'app:viewer-day');
		expect(depends).toHaveBeenCalledWith('app:org-core');
	});
});
