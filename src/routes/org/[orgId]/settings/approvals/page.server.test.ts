import { describe, expect, it, vi } from 'vitest';
import { createSuspendedAppShellRouteData, createOrganizationLoadEventData } from '../../appShell.test-support';
import { load } from './+page.server';

describe('approvals settings page load', () => {
	it('registers the pending approvals read for review refreshes', async () => {
		const depends = vi.fn();

		await expect(
			load({
				cookies: {},
				depends,
				...createOrganizationLoadEventData(createSuspendedAppShellRouteData())
			} as never)
		).rejects.toMatchObject({ status: 303 });

		expect(depends).toHaveBeenCalledWith('app:settings-pending-approvals');
		expect(depends).toHaveBeenCalledWith('app:org-core');
	});
});
