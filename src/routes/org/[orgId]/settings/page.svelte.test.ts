// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => () => {}
}));

vi.mock('$features/groups/components/OrganizationMemberManager.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$lib/components/PageToolbar.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$lib/config/billing', () => ({
	isBillingEnabled: false
}));

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

const baseData = {
	session: null,
	allOrgs: [],
	orgId: 'org-1',
	orgName: 'Test Org',
	isOwner: true,
	isAdmin: false,
	canManageMembers: true,
	permissions: { canManageMembers: true },
	members: [],
	invitations: [],
	groups: [],
	exportInfo: {
		exportsUsed: 0,
		exportsLimit: Infinity,
		isLimited: false
	}
};

describe('org settings page', () => {
	it('shows the organization-name success banner only for the rename action payload', () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: { nameSuccess: true } as never
			}
		});

		expect(screen.getByText('Organization name updated!')).toBeTruthy();
	});

	it('does not show the organization-name success banner for generic action success payloads', () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: { success: true } as never
			}
		});

		expect(screen.queryByText('Organization name updated!')).toBeNull();
	});
});
