// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { openToolbarMore, openToolbarSubmenu, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const { goto } = vi.hoisted(() => ({ goto: vi.fn(async () => {}) }));
vi.mock('$app/navigation', () => ({ goto }));

import Page from './+page.svelte';

type PageProps = ComponentProps<typeof Page>;

afterEach(() => {
	cleanup();
	goto.mockClear();
});

function organizationsData(data: Partial<PageProps['data']>): PageProps['data'] {
	const baseData: PageProps['data'] = {
		viewer: null,
		adminUserId: 'admin-1',
		adminEmail: 'admin@example.test',
		adminRole: 'support',
		accessiblePages: ['dashboard', 'users', 'organizations'],
		visibleNavGroups: [
			{
				label: null,
				items: [{ label: 'Dashboard', href: '/admin', page: 'dashboard' }]
			}
		],
		organizations: [],
		pagination: {
			page: 1,
			pageSize: 25,
			totalCount: 0,
			totalPages: 1,
			q: '',
			status: 'all'
		},
		activationHealth: {
			generatedAt: '2026-06-28T12:00:00.000Z',
			overallState: 'no_candidates',
			candidateLimit: 100,
			counts: {
				candidateOrganizations: 0,
				activatedOrganizations: 0,
				meaningfulRosters: 0,
				acceptedLeaders: 0,
				setupStarted: 0,
				inProgressOrganizations: 0
			},
			organizations: [],
			diagnosticsError: false
		}
	};

	return { ...baseData, ...data };
}

function renderOrganizationsPage(data: Partial<PageProps['data']>) {
	return render(Page, { props: { data: organizationsData(data) } });
}

describe('admin organizations page', () => {
	it('renders retained activation progress and Organization navigation', () => {
		renderOrganizationsPage({
			organizations: [
				{
					id: 'org-1',
					name: 'Able Company',
					memberCount: 1,
					personnelCount: 2,
					ownerEmail: 'owner@example.com',
					isSuspended: false,
					suspended_at: null,
					created_at: '2026-06-01T00:00:00.000Z'
				}
			],
			pagination: {
				page: 1,
				pageSize: 25,
				totalCount: 1,
				totalPages: 1,
				q: '',
				status: 'all'
			},
			activationHealth: {
				generatedAt: '2026-06-28T12:00:00.000Z',
				overallState: 'in_progress',
				candidateLimit: 100,
				counts: {
					candidateOrganizations: 3,
					activatedOrganizations: 0,
					meaningfulRosters: 0,
					acceptedLeaders: 0,
					setupStarted: 1,
					inProgressOrganizations: 1
				},
				organizations: [
					{
						id: 'org-1',
						organization: { id: 'org-1', name: 'Able Company' },
						state: 'in_progress',
						score: 70,
						milestones: [],
						nextSteps: ['Import or add at least 5 active personnel.'],
						supportBundle: {
							organizationId: 'org-1',
							organizationName: 'Able Company',
							acquisition: {
								organizationCreatedAt: '2026-06-01T00:00:00.000Z'
							},
							activation: {
								activePersonnel: 2,
								members: 1,
								leaderMembers: 1,
								statusTypes: 4,
								assignmentTypes: 1,
								onboardingTemplateSteps: 2,
								trainingTypes: 3,
								ratingSchemeEntries: 1,
								meaningfulRosterThreshold: 5
							},
							nextSteps: ['Import or add at least 5 active personnel.']
						}
					}
				],
				diagnosticsError: false
			}
		});

		expect(screen.getByText('2 / 5')).toBeTruthy();
		expect(
			screen
				.getAllByRole('link', { name: 'Able Company' })
				.every((link) => link.getAttribute('href') === '/admin/organizations/org-1')
		).toBe(true);
	});

	it('shows the search, page size and suspension status held in the URL', () => {
		renderOrganizationsPage({
			pagination: { page: 2, pageSize: 50, totalCount: 60, totalPages: 2, q: 'Able & Baker', status: 'suspended' }
		});
		const toolbar = within(screen.getByRole('toolbar', { name: 'Organizations controls' }));
		expect(toolbar.getByRole('searchbox', { name: 'Search' })).toHaveProperty('value', 'Able & Baker');
		expect(toolbar.getByRole('button', { name: 'Status' }).textContent).toContain('Suspended');
		expect(toolbar.getByRole('button', { name: 'Rows' }).textContent).toContain('50');
		expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
	});

	async function chooseOption(trigger: HTMLElement, option: string) {
		trigger.focus();
		await fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		await fireEvent.pointerUp(await screen.findByRole('option', { name: option }));
	}

	it('applies each filter from the first page when it changes and keeps the other filters', async () => {
		renderOrganizationsPage({
			pagination: { page: 3, pageSize: 25, totalCount: 90, totalPages: 4, q: 'Able', status: 'all' }
		});
		await chooseOption(screen.getByRole('button', { name: 'Status' }), 'Suspended');
		expect(goto).toHaveBeenLastCalledWith('/admin/organizations?page=1&pageSize=25&q=Able&status=suspended', {
			keepFocus: true
		});
		await chooseOption(screen.getByRole('button', { name: 'Rows' }), '50');
		expect(goto).toHaveBeenLastCalledWith('/admin/organizations?page=1&pageSize=50&q=Able', { keepFocus: true });
		expect(goto).toHaveBeenCalledTimes(2);
	});

	it('applies the search once typing pauses and keeps the status and page size', async () => {
		vi.useFakeTimers();
		try {
			renderOrganizationsPage({
				pagination: { page: 3, pageSize: 50, totalCount: 90, totalPages: 2, q: '', status: 'active' }
			});
			const search = screen.getByRole('searchbox', { name: 'Search' });
			search.focus();
			await fireEvent.input(search, { target: { value: 'Able & Baker' } });
			expect(goto).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(300);
			expect(goto).toHaveBeenCalledOnce();
			expect(goto).toHaveBeenLastCalledWith('/admin/organizations?page=1&pageSize=50&q=Able+%26+Baker&status=active', {
				keepFocus: true
			});
			expect(document.activeElement).toBe(search);
		} finally {
			vi.useRealTimers();
		}
	});

	it('follows the URL back to an empty search and keeps it out of a later Status change', async () => {
		vi.useFakeTimers();
		try {
			const pagination = { page: 1, pageSize: 25, totalCount: 90, totalPages: 4, q: '', status: 'all' };
			const view = renderOrganizationsPage({ pagination });
			await fireEvent.input(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'abc' } });
			await vi.advanceTimersByTimeAsync(300);
			expect(goto).toHaveBeenLastCalledWith('/admin/organizations?page=1&pageSize=25&q=abc', { keepFocus: true });

			await view.rerender({ data: organizationsData({ pagination: { ...pagination, q: 'abc' } }) });
			await view.rerender({ data: organizationsData({ pagination }) });
			expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveProperty('value', '');
		} finally {
			vi.useRealTimers();
		}
		await chooseOption(screen.getByRole('button', { name: 'Status' }), 'Suspended');
		expect(goto).toHaveBeenLastCalledWith('/admin/organizations?page=1&pageSize=25&status=suspended', {
			keepFocus: true
		});
	});

	it('keeps a typed trailing space when the server trims the committed search, then still follows Back', async () => {
		vi.useFakeTimers();
		try {
			const pagination = { page: 1, pageSize: 25, totalCount: 90, totalPages: 4, q: '', status: 'all' };
			const view = renderOrganizationsPage({ pagination });
			const search = () => screen.getByRole('searchbox', { name: 'Search' });
			await fireEvent.input(search(), { target: { value: 'acme ' } });
			await vi.advanceTimersByTimeAsync(300);

			await view.rerender({ data: organizationsData({ pagination: { ...pagination, q: 'acme' } }) });
			expect(search(), 'the server trims q, but the box keeps the space being typed').toHaveProperty('value', 'acme ');

			await view.rerender({ data: organizationsData({ pagination }) });
			expect(search(), 'Back to an empty search empties the box').toHaveProperty('value', '');
		} finally {
			vi.useRealTimers();
		}
	});

	it('changes a filter folded into More from its submenu and keeps it reachable by name', async () => {
		const toolbarWidths = stubToolbarWidths();
		renderOrganizationsPage({
			pagination: { page: 2, pageSize: 25, totalCount: 90, totalPages: 4, q: '', status: 'all' }
		});
		await toolbarWidths.foldAll();
		const toolbar = within(screen.getByRole('toolbar', { name: 'Organizations controls' }));
		expect(toolbar.queryByRole('button', { name: 'Status' })).toBeNull();
		expect(toolbar.queryByRole('button', { name: 'Rows' })).toBeNull();

		await openToolbarMore('Organizations controls');
		await openToolbarSubmenu('Rows, 25');
		await fireEvent.click(await screen.findByRole('menuitemradio', { name: '100' }));
		expect(goto).toHaveBeenLastCalledWith('/admin/organizations?page=1&pageSize=100', { keepFocus: true });
	});

	it('pages through the Organization index with buttons that keep focus and the filters', async () => {
		renderOrganizationsPage({
			pagination: { page: 2, pageSize: 25, totalCount: 60, totalPages: 3, q: 'Able & Baker', status: 'suspended' }
		});
		expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
		const next = screen.getByRole('button', { name: 'Next' });
		next.focus();
		await fireEvent.click(next);
		expect(goto).toHaveBeenCalledWith('/admin/organizations?page=3&pageSize=25&q=Able+%26+Baker&status=suspended', {
			keepFocus: true
		});
		expect(document.activeElement).toBe(next);
		await fireEvent.click(screen.getByRole('button', { name: 'Previous' }));
		expect(goto).toHaveBeenLastCalledWith('/admin/organizations?page=1&pageSize=25&q=Able+%26+Baker&status=suspended', {
			keepFocus: true
		});
	});

	it('moves focus to Previous when Next reaches the last Organization page and keeps the range text', async () => {
		const organization = {
			id: 'org-60',
			name: 'Org 60',
			memberCount: 1,
			personnelCount: 1,
			ownerEmail: 'owner@example.test',
			isSuspended: false,
			suspended_at: null,
			created_at: '2026-06-01T00:00:00.000Z'
		};
		const second = organizationsData({
			organizations: [organization],
			pagination: { page: 2, pageSize: 25, totalCount: 60, totalPages: 3, q: '', status: 'all' }
		});
		const view = render(Page, { props: { data: second } });
		expect(screen.getByText('Showing 26-50 of 60')).toBeTruthy();
		goto.mockImplementationOnce(async () => {
			await view.rerender({
				data: { ...second, pagination: { ...second.pagination, page: 3 } }
			});
		});
		const next = screen.getByRole('button', { name: 'Next' });
		next.focus();
		await fireEvent.click(next);
		await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Previous' })));
		expect(screen.getByText('Showing 51-60 of 60')).toBeTruthy();
	});

	it('warns when activation health diagnostics are unavailable', () => {
		renderOrganizationsPage({
			activationHealth: {
				generatedAt: '2026-06-28T12:00:00.000Z',
				overallState: 'diagnostics_unavailable',
				candidateLimit: 100,
				counts: {
					candidateOrganizations: 0,
					activatedOrganizations: 0,
					meaningfulRosters: 0,
					acceptedLeaders: 0,
					setupStarted: 0,
					inProgressOrganizations: 0
				},
				organizations: [],
				diagnosticsError: true
			}
		});

		expect(screen.getAllByText('Activation health diagnostics could not be fully loaded.')).toHaveLength(2);
		expect(screen.getByText(/Roster, member, and setup counts may be incomplete/)).toBeTruthy();
		expect(screen.getByText('Unavailable')).toBeTruthy();
		expect(screen.getByText('Activation health data is unavailable until diagnostics load successfully.')).toBeTruthy();
		expect(
			screen.getByText('Activation health diagnostics are unavailable. Retry after the health scan succeeds.')
		).toBeTruthy();
		expect(screen.queryByText('No Organizations found for activation health.')).toBeNull();
		expect(screen.queryByText(/Organizations · \d+ activated/)).toBeNull();
	});
});
