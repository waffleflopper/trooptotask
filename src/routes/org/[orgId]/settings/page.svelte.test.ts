// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import VisibleStub from '$lib/test-stubs/VisibleStub.svelte';

const { billingEnabledMock } = vi.hoisted(() => ({
	billingEnabledMock: vi.fn(() => false)
}));

vi.mock('$app/forms', () => ({
	enhance: () => () => {}
}));

vi.mock('$features/groups/components/OrganizationMemberManager.svelte', () => ({
	default: VisibleStub
}));

vi.mock('$lib/config/billing', () => ({
	get isBillingEnabled() {
		return billingEnabledMock();
	}
}));

import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	billingEnabledMock.mockReturnValue(false);
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
	it('places account shortcuts in the floating toolbar without the old overview stats', () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		expect(screen.getByRole('toolbar', { name: 'Organization settings controls' })).toBeTruthy();
		expect(screen.getByRole('link', { name: 'Sign Out' }).getAttribute('href')).toBe('/auth/logout');
		expect(screen.getByRole('link', { name: 'Switch Organization' }).getAttribute('href')).toBe('/dashboard?show=all');
		expect(screen.queryByText('Pending Invites')).toBeNull();
		expect(screen.queryByText('Active people with access to this organization')).toBeNull();
	});

	it('exposes organization settings actions as a named toolbar action group', () => {
		billingEnabledMock.mockReturnValue(true);

		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		const toolbar = screen.getByRole('toolbar', { name: 'Organization settings controls' });
		const actions = within(toolbar).getByRole('group', { name: 'Organization settings actions' });

		expect(within(actions).getByRole('link', { name: 'Sign Out' }).getAttribute('href')).toBe('/auth/logout');
		expect(within(actions).getByRole('link', { name: 'Switch Organization' }).getAttribute('href')).toBe(
			'/dashboard?show=all'
		);
		expect(within(actions).getByRole('link', { name: 'Manage Billing' }).getAttribute('href')).toBe(
			'/org/org-1/billing'
		);
	});

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

	it('allows delete confirmation when the typed name only differs by extra whitespace', async () => {
		render(Page, {
			props: {
				data: baseData as never,
				form: null as never
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Delete Organization' }));
		await fireEvent.input(screen.getByLabelText('Type Test Org to confirm:'), {
			target: { value: '  Test    Org  ' }
		});

		expect((screen.getByRole('button', { name: 'Delete Permanently' }) as HTMLButtonElement).disabled).toBe(false);
	});
});
