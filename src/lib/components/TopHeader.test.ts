// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import type { ComponentProps } from 'svelte';
import TopHeader from './TopHeader.svelte';
import type { OrganizationMemberPermissions } from '$lib/types';

const topHeaderSource = readFileSync('src/lib/components/TopHeader.svelte', 'utf8');
const sidebarSource = readFileSync('src/lib/components/ui/sidebar/sidebar.svelte', 'utf8');

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

vi.mock('$app/stores', () => {
	return {
		page: {
			subscribe: pageStore.subscribe
		}
	};
});

const basePermissions: OrganizationMemberPermissions = {
	canViewCalendar: true,
	canEditCalendar: false,
	canViewPersonnel: true,
	canEditPersonnel: false,
	canViewTraining: false,
	canEditTraining: false,
	canViewCriticalTasks: false,
	canEditCriticalTasks: false,
	canViewOnboarding: false,
	canEditOnboarding: false,
	canViewLeadersBook: false,
	canEditLeadersBook: false,
	canManageMembers: false
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	vi.useRealTimers();
	pageStore.setPath('/org/org-1/personnel');
});

function renderHeader(overrides: Partial<ComponentProps<typeof TopHeader>> = {}) {
	return render(TopHeader, {
		props: {
			orgId: 'org-1',
			orgName: 'Test Org',
			userRole: 'admin',
			permissions: basePermissions,
			allOrgs: [],
			onToggleTheme: vi.fn(),
			isDarkTheme: false,
			unreadNotificationCount: 2,
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

	it('renders help in the account menu', async () => {
		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: /Account menu/i }));

		expect(screen.getByRole('menuitem', { name: 'Help' })).toBeTruthy();
	});

	it('keeps account access available in the shadcn sidebar footer', () => {
		renderHeader();

		expect(screen.getByRole('button', { name: /Account menu/i })).toBeTruthy();
	});

	it('offsets the app shell below fixed banners while preserving available height', () => {
		const { container } = renderHeader();

		const wrapper = container.querySelector('[data-slot="sidebar-wrapper"]');
		expect(wrapper?.getAttribute('style')).toContain('max-height: calc(100dvh - var(--banner-height, 0px))');
		expect(topHeaderSource).toContain('margin-top: var(--banner-height, 0px)');
		expect(topHeaderSource).toContain('height: calc(100dvh - var(--banner-height, 0px))');
		expect(topHeaderSource).toContain('class="sticky top-0');
		expect(topHeaderSource).not.toContain('top-(--banner-height,0px)');
		expect(sidebarSource).toContain('top: var(--banner-height, 0px)');
		expect(sidebarSource).toContain('height: calc(100svh - var(--banner-height, 0px))');
	});

	it('keeps organization settings in the org switcher menu', async () => {
		renderHeader();

		await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

		expect(screen.getByRole('menuitem', { name: 'Org Settings' })).toBeTruthy();
		expect(screen.queryByRole('menuitem', { name: 'Manage Organizations' })).toBeNull();
	});

	it('shows manage organizations only for multi-org users', async () => {
		renderHeader({
			allOrgs: [
				{ id: 'org-1', name: 'Test Org', role: 'admin' },
				{ id: 'org-2', name: 'Second Org', role: 'member' }
			]
		});

		await fireEvent.click(screen.getByRole('button', { name: 'Switch organization' }));

		expect(screen.getByRole('menuitem', { name: 'Manage Organizations' })).toBeTruthy();
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
			permissions: {
				...basePermissions,
				canViewCriticalTasks: true
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
