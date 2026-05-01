// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';

import SettingsActivityRail from './SettingsActivityRail.svelte';

vi.mock('$app/navigation', () => ({
	invalidateAll: vi.fn()
}));

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

const approvalRequests = [
	{
		id: 'request-1',
		status: 'pending',
		requester_email: 'requester@example.com',
		resource_description: 'Delete archived record',
		resource_type: 'personnel',
		resource_url: null,
		created_at: '2026-04-26T12:00:00Z',
		denial_reason: null
	}
];

const auditLog = {
	logs: [
		{
			id: 'audit-1',
			userId: 'user-1',
			actor: 'admin@example.com',
			action: 'organization.rename',
			resourceType: 'organization',
			resourceId: 'org-1',
			details: { name: 'Test Org' },
			createdAt: '2026-04-26T12:00:00Z'
		}
	],
	totalCount: 1,
	last30DaysCount: 1,
	page: 1,
	limit: 100,
	actionFilter: '',
	availableActions: ['organization.rename']
};

describe('SettingsActivityRail', () => {
	it('owns activity tab switching and collapse state without route page state', async () => {
		render(SettingsActivityRail, {
			props: {
				orgId: 'org-1',
				pendingApprovalsCount: 1,
				approvalRequests,
				auditLog
			}
		});

		const activity = screen.getByRole('complementary', { name: 'Settings activity' });
		expect(within(activity).getByRole('tab', { name: /Approvals 1/ })).toBeTruthy();
		expect(within(activity).getByText('requester@example.com')).toBeTruthy();

		await fireEvent.click(within(activity).getByRole('tab', { name: 'Audit Log' }));
		expect(within(activity).getByText('Organization › Rename')).toBeTruthy();
		expect(within(activity).getByText('admin@example.com')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Collapse' }));
		expect(screen.getByRole('button', { name: 'Show activity panel' })).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Show activity panel' }));
		expect(screen.getByRole('button', { name: 'Collapse' })).toBeTruthy();
	});
});
