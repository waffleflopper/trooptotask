// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import type { ComponentProps } from 'svelte';
import TopHeader from './TopHeader.svelte';
import type { OrganizationMemberPermissions } from '$lib/types';

vi.mock('$app/stores', async () => {
	const { readable } = await import('svelte/store');

	return {
		page: readable({
			url: new URL('https://example.test/org/org-1/personnel')
		})
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

	it('renders help in the utility cluster', () => {
		renderHeader();

		expect(screen.getByRole('link', { name: 'Help' }).getAttribute('href')).toBe('/help');
	});
});
