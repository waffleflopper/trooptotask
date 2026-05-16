// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationMember } from '$lib/types';
import OrganizationMemberManager from './OrganizationMemberManager.svelte';

vi.mock('$app/forms', () => ({
	enhance: () => () => {}
}));

const basePermissions = {
	canViewCalendar: true,
	canEditCalendar: true,
	canViewPersonnel: true,
	canEditPersonnel: true,
	canViewTraining: true,
	canEditTraining: true,
	canViewCriticalTasks: true,
	canEditCriticalTasks: true,
	canViewOnboarding: true,
	canEditOnboarding: true,
	canViewRatingScheme: true,
	canEditRatingScheme: true,
	canManageMembers: true
};

const members: OrganizationMember[] = [
	{
		id: 'member-owner',
		organizationId: 'org-1',
		userId: 'user-owner',
		email: 'owner@example.com',
		role: 'owner',
		scopedGroupId: null,
		createdAt: '2026-03-01',
		...basePermissions
	},
	{
		id: 'member-admin',
		organizationId: 'org-1',
		userId: 'user-admin',
		email: 'admin@example.com',
		role: 'admin',
		scopedGroupId: null,
		createdAt: '2026-03-02',
		...basePermissions
	}
];

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.restoreAllMocks();
});

describe('OrganizationMemberManager', () => {
	it('opens ownership transfer in the shared app dialog', async () => {
		render(OrganizationMemberManager, {
			props: {
				orgId: 'org-1',
				members,
				invitations: [],
				isOwner: true,
				isAdmin: true,
				canManageMembers: true,
				groups: []
			}
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Transfer' }));

		expect(screen.getByRole('dialog', { name: 'Transfer Ownership' })).toBeTruthy();
		expect(screen.getByText(/You will become an Admin member/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Transfer Ownership' })).toBeTruthy();
	});
});
