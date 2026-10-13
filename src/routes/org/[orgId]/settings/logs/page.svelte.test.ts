// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stubToolbarWidths } from '$lib/test-support/toolbarWidths';
import Page from './+page.svelte';

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const auditLog = (actions: string[]) => ({
	logs: actions.map((action, index) => ({
		id: `audit-${index}`,
		userId: 'user-1',
		actor: 'admin@example.com',
		action,
		resourceType: 'organization',
		resourceId: 'org-1',
		details: {},
		createdAt: '2026-04-26T12:00:00Z'
	})),
	totalCount: actions.length,
	last30DaysCount: actions.length,
	page: 1,
	limit: 100,
	actionFilter: '',
	availableActions: actions
});

function renderLogs(actions: string[]) {
	render(Page, {
		props: {
			data: { logsSettings: { sections: { logs: { auditLogPage: auditLog(actions) } } } } as never,
			form: null,
			params: { orgId: 'org-1' }
		}
	});
}

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

	it('filters entries by area or event from the toolbar search', async () => {
		renderLogs(['organization.rename', 'member.invite']);
		const log = within(screen.getByRole('table', { name: 'Organization audit log entries' }));

		await fireEvent.input(screen.getByRole('searchbox', { name: 'Search audit log' }), {
			target: { value: 'invite' }
		});

		expect(log.getByText('Invite')).toBeTruthy();
		expect(log.queryByText('Rename')).toBeNull();
	});

	it('keeps the search working from the collapsed icon', async () => {
		const widths = stubToolbarWidths();
		renderLogs(['organization.rename', 'member.invite']);
		await widths.foldAll();
		expect(screen.queryByRole('searchbox', { name: 'Search audit log' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Search audit log' }));
		await fireEvent.input(await screen.findByRole('searchbox', { name: 'Search audit log' }), {
			target: { value: 'invite' }
		});

		const log = within(screen.getByRole('table', { name: 'Organization audit log entries' }));
		expect(log.getByText('Invite')).toBeTruthy();
		expect(log.queryByText('Rename')).toBeNull();
	});
});
