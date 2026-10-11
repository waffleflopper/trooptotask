// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
});

describe('logs settings page', () => {
	it('renders a safe fallback when logs settings are unavailable', () => {
		render(Page, {
			props: {
				data: {} as never,
				form: null,
				params: { orgId: 'org-1' }
			}
		});

		expect(screen.getByRole('heading', { name: 'Audit Log' })).toBeTruthy();
		expect(screen.getByText('Organization logs are not available.')).toBeTruthy();
	});

	it('names the search term when a search hides every entry', async () => {
		const auditLogPage = {
			logs: [
				{
					id: 'audit-1',
					userId: 'user-1',
					actor: 'admin@example.com',
					action: 'organization.rename',
					resourceType: 'organization',
					resourceId: 'org-1',
					details: {},
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
		render(Page, {
			props: {
				data: { logsSettings: { sections: { logs: { auditLogPage } } } } as never,
				form: null,
				params: { orgId: 'org-1' }
			}
		});

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search audit log' }), {
			target: { value: 'zzz' }
		});

		expect(screen.queryByText('admin@example.com')).toBeNull();
		expect(screen.getByText(/"zzz"/)).toBeTruthy();
	});
});
