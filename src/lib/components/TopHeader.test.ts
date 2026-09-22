// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import TopHeader from './TopHeader.svelte';
import type { CapabilityMap } from '$lib/access/memberAccessShape';

const { pageStore } = vi.hoisted(() => {
	let current = {
		url: new URL('https://example.test/org/org-1/personnel'),
		data: {} as Record<string, unknown>
	};
	const subscribers = new Set<(value: typeof current) => void>();

	return {
		pageStore: {
			subscribe(fn: (value: typeof current) => void) {
				subscribers.add(fn);
				fn(current);
				return () => subscribers.delete(fn);
			},
			setPath(pathname: string, data: Record<string, unknown> = {}) {
				current = {
					url: new URL(`https://example.test${pathname}`),
					data
				};
				for (const subscriber of subscribers) subscriber(current);
			}
		}
	};
});

const { goto } = vi.hoisted(() => {
	return { goto: vi.fn() };
});

vi.mock('$app/navigation', () => {
	return { goto };
});

vi.mock('$app/stores', () => {
	return {
		page: {
			subscribe: pageStore.subscribe
		}
	};
});

const baseCapabilityMap: CapabilityMap = {
	calendar: 'view',
	personnel: 'view',
	training: 'none',
	criticalTasks: 'none',
	onboarding: 'none',
	ratingScheme: 'none'
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.unstubAllGlobals();
	vi.useRealTimers();
	pageStore.setPath('/org/org-1/personnel');
});

beforeEach(() => {
	vi.stubGlobal(
		'fetch',
		vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);

			if (url.includes('part=notification-count')) {
				return {
					ok: true,
					json: async () => ({ ok: true, unreadNotificationCount: 2 })
				};
			}

			if (url.includes('part=organization-switcher')) {
				return {
					ok: true,
					json: async () => ({ ok: true, organizations: [] })
				};
			}

			return {
				ok: true,
				json: async () => []
			};
		})
	);
});

function renderHeader(overrides: Partial<ComponentProps<typeof TopHeader>> = {}) {
	return render(TopHeader, {
		props: {
			orgId: 'org-1',
			orgName: 'Test Org',
			userRole: 'admin',
			membershipId: 'membership-1',
			capabilityMap: baseCapabilityMap,
			onToggleTheme: vi.fn(),
			isDarkTheme: false,
			...overrides
		}
	});
}

describe('TopHeader', () => {
	it('renders a feedback utility button when a feedback handler is provided', async () => {
		const onFeedback = vi.fn();

		renderHeader({ onFeedback });

		await fireEvent.click(screen.getByRole('button', { name: 'Send feedback' }));

		expect(onFeedback).toHaveBeenCalledTimes(1);
	});

	it('does not render the feedback utility button without a feedback handler', () => {
		renderHeader();

		expect(screen.queryByRole('button', { name: 'Send feedback' })).toBeNull();
	});

	it('does not render a standalone help route item in the account menu', async () => {
		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.queryByRole('menuitem', { name: 'Help' })).toBeNull();
	});

	it('keeps account access available in the shadcn sidebar footer', () => {
		renderHeader();

		expect(screen.getByRole('button', { name: /Account menu/i })).toBeTruthy();
	});

	it('puts Organization Settings directly above the account item for admins', () => {
		renderHeader({ userRole: 'admin' });

		const settingsLink = screen.getByRole('link', { name: 'Organization Settings' });
		const accountButton = screen.getByRole('button', { name: /Account menu/i });

		expect(settingsLink.getAttribute('href')).toBe('/org/org-1/settings');
		expect(settingsLink.compareDocumentPosition(accountButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});

	it('does not expose Organization Settings in the sidebar footer for members', () => {
		renderHeader({ userRole: 'member' });

		expect(screen.queryByRole('link', { name: 'Organization Settings' })).toBeNull();
	});

	it('opens the User Account profile from the account menu', async () => {
		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Account' }));

		expect(goto).toHaveBeenCalledWith('/account/profile');
	});

	it('shows a leave organization action for non-owner members', async () => {
		renderHeader({ userRole: 'member' });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.getByRole('menuitem', { name: 'Leave Organization' })).toBeTruthy();
	});

	it('requires typed confirmation before a non-owner member can leave an organization', async () => {
		renderHeader({ userRole: 'member' });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Leave Organization' }));

		expect(await screen.findByRole('dialog', { name: 'Leave Organization' })).toBeTruthy();
		expect(screen.getByText(/Are you sure you wish to leave Test Org/)).toBeTruthy();
		const confirmButton = screen.getByRole('button', { name: 'Leave Organization' });
		expect((confirmButton as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole('textbox', { name: 'Type YES to confirm' })).toBeTruthy();
		expect(screen.getByDisplayValue('membership-1').getAttribute('name')).toBe('membershipId');
		expect(screen.getByDisplayValue('membership-1').closest('form')?.getAttribute('action')).toBe(
			'/org/org-1?/leaveOrganization'
		);

		await fireEvent.input(screen.getByRole('textbox', { name: 'Type YES to confirm' }), {
			target: { value: 'YES' }
		});

		expect((confirmButton as HTMLButtonElement).disabled).toBe(false);
	});

	it('shows leave organization for non-owner members even when membership payload is missing', async () => {
		renderHeader({ userRole: 'member', membershipId: null });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));
		await fireEvent.click(screen.getByRole('menuitem', { name: 'Leave Organization' }));

		expect(
			screen.getByText('We could not identify your organization membership. Refresh the page and try again.')
		).toBeTruthy();
		expect((screen.getByRole('button', { name: 'Leave Organization' }) as HTMLButtonElement).disabled).toBe(true);
	});

	it('shows a leave organization action for admins', async () => {
		renderHeader({ userRole: 'admin' });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.getByRole('menuitem', { name: 'Leave Organization' })).toBeTruthy();
	});

	it('does not show leave organization for owners', async () => {
		renderHeader({ userRole: 'owner' });

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.queryByRole('menuitem', { name: 'Leave Organization' })).toBeNull();
	});

	it('keeps organization settings in the org switcher menu for admins', async () => {
		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

		expect(screen.getByRole('menuitem', { name: 'Organization Settings' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Manage Organizations' })).toBeNull();
	});

	it('does not show organization settings in the org switcher menu for members', async () => {
		renderHeader({ userRole: 'member' });

		await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

		expect(screen.queryByRole('menuitem', { name: 'Organization Settings' })).toBeNull();
	});

	it('hides Duty Rosters while keeping Calendar and Personnel available', () => {
		renderHeader();

		expect(screen.queryByRole('link', { name: /Duty Rosters/ })).toBeNull();
		expect(screen.getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(
			screen
				.getAllByRole('link', { name: 'Personnel' })
				.some((link) => link.getAttribute('href') === '/org/org-1/personnel')
		).toBe(true);
	});

	it('shows manage organizations only for multi-org users', async () => {
		vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('part=organization-switcher')) {
				return {
					ok: true,
					json: async () => ({
						ok: true,
						organizations: [
							{ id: 'org-1', name: 'Test Org', role: 'admin' },
							{ id: 'org-2', name: 'Second Org', role: 'member' }
						]
					})
				} as Response;
			}
			return {
				ok: true,
				json: async () => ({ ok: true, unreadNotificationCount: 2 })
			} as Response;
		});

		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

		expect(await screen.findByRole('menuitem', { name: 'Manage Organizations' })).toBeTruthy();
	});

	it('reloads the deferred notification count when the org route segment changes', async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			const url = String(input);
			if (url.includes('/org/org-2/') && url.includes('part=notification-count')) {
				return {
					ok: true,
					json: async () => ({ ok: true, unreadNotificationCount: 5 })
				} as Response;
			}

			if (url.includes('part=notification-count')) {
				return {
					ok: true,
					json: async () => ({ ok: true, unreadNotificationCount: 2 })
				} as Response;
			}

			return {
				ok: true,
				json: async () => ({ ok: true, organizations: [] })
			} as Response;
		});
		vi.stubGlobal('fetch', fetchMock);

		const view = renderHeader({ orgUrlSegment: 'org-1' });

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-1/api/app-shell-chrome?part=notification-count')
		);

		await view.rerender({
			orgId: 'org-2',
			orgName: 'Second Org',
			orgUrlSegment: 'org-2',
			userRole: 'admin',
			membershipId: 'membership-2',
			capabilityMap: baseCapabilityMap,
			onToggleTheme: vi.fn(),
			isDarkTheme: false
		});

		await waitFor(() =>
			expect(fetchMock).toHaveBeenCalledWith('/org/org-2/api/app-shell-chrome?part=notification-count')
		);
	});

	it('renders route-aware Calendar breadcrumbs for subpages', () => {
		pageStore.setPath('/org/org-1/calendar/settings');

		renderHeader();

		const breadcrumb = screen.getByLabelText('Current section');
		expect(breadcrumb.textContent).toContain('Test Org');
		expect(breadcrumb.textContent).toContain('Calendar');
		expect(breadcrumb.textContent).toContain('Settings');
	});

	it('links Calendar parent breadcrumbs on subpages', () => {
		pageStore.setPath('/org/org-1/calendar/settings');

		renderHeader();

		const breadcrumb = screen.getByLabelText('Current section');
		expect(within(breadcrumb).getByRole('link', { name: 'Test Org' }).getAttribute('href')).toBe('/org/org-1');
		expect(within(breadcrumb).getByRole('link', { name: 'Calendar' }).getAttribute('href')).toBe('/org/org-1/calendar');
		expect(within(breadcrumb).getByText('Settings').getAttribute('aria-current')).toBe('page');
	});

	it('uses a route-provided breadcrumb label for personnel records', () => {
		pageStore.setPath('/org/org-1/critical-tasks/person-1', { breadcrumbLabel: 'CPT Hayes, Emma' });

		renderHeader({
			capabilityMap: {
				...baseCapabilityMap,
				criticalTasks: 'view'
			}
		});

		const breadcrumb = screen.getByLabelText('Current section');
		expect(breadcrumb.textContent).toContain('Critical Tasks');
		expect(breadcrumb.textContent).toContain('CPT Hayes, Emma');
		expect(breadcrumb.textContent).not.toContain('Person');
	});

	it('uses a client-local dashboard date crumb for the dashboard root', async () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2026, 3, 26, 9));
		pageStore.setPath('/org/org-1', { breadcrumbLabel: 'Server Date Should Not Render' });

		renderHeader();

		const breadcrumb = screen.getByLabelText('Current section');
		await waitFor(() => expect(breadcrumb.textContent).toContain('Sunday, Apr 26 2026'));
		expect(breadcrumb.textContent).not.toContain('Server Date Should Not Render');
		expect(within(breadcrumb).getByRole('link', { name: 'Dashboard' }).getAttribute('href')).toBe('/org/org-1');
	});
});
