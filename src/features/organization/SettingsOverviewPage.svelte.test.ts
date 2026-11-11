// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/svelte';
import SettingsOverviewPage from './SettingsOverviewPage.svelte';
import { OVERVIEW_CHECKS, type OverviewSources } from './settingsOverview';

vi.mock('$app/paths', () => ({ resolve: (path: string) => path }));
afterEach(cleanup);

function sources(overrides: Partial<OverviewSources> = {}): OverviewSources {
	return {
		pendingApprovals: Promise.resolve(0),
		invitationsToFollowUp: Promise.resolve({ deliveryFailed: 0, expiringSoon: 0 }),
		ungroupedPeople: Promise.resolve(0),
		membersCoveringNoGroups: Promise.resolve(0),
		featuresNotSetUp: Promise.resolve([]),
		...overrides
	};
}

function row(key: (typeof OVERVIEW_CHECKS)[number]['key']): HTMLElement {
	const label = OVERVIEW_CHECKS.find((check) => check.key === key)!.label;
	return screen.getByText(label).closest<HTMLElement>('[data-slot="fact-row"]')!;
}

const summaryState = () => screen.getByRole('status').getAttribute('data-state');

describe('Settings overview page', () => {
	it('says the unit is all set, with no fix links, when every check settles at zero', async () => {
		render(SettingsOverviewPage, { orgUrlSegment: 'c-co', sources: sources() });

		expect(summaryState()).toBe('checking');
		await waitFor(() => expect(summaryState()).toBe('allSet'));
		expect(screen.queryAllByRole('link')).toEqual([]);
	});

	it('shows a failed check as its own error while the other checks keep their counts and fixes', async () => {
		render(SettingsOverviewPage, {
			orgUrlSegment: 'c-co',
			sources: sources({
				pendingApprovals: Promise.reject(new Error('Count unavailable')),
				ungroupedPeople: Promise.resolve(7),
				invitationsToFollowUp: Promise.resolve({ deliveryFailed: 2, expiringSoon: 1 })
			})
		});

		await waitFor(() => expect(summaryState()).toBe('attention'));
		expect(row('approvals').querySelector('[data-check-state="failed"]')).not.toBeNull();
		expect(within(row('approvals')).queryByRole('link')).toBeNull();

		const ungrouped = row('ungrouped');
		expect(ungrouped.querySelector('[data-check-state="outstanding"]')).toHaveTextContent('7');
		expect(within(ungrouped).getByRole('link')).toHaveAttribute('href', '/org/c-co/personnel');

		const invitations = row('invitations');
		expect(invitations.querySelector('[data-check-state="outstanding"]')).toHaveTextContent('3');
		expect(invitations).toHaveTextContent('2');
		expect(within(invitations).getByRole('link')).toHaveAttribute('href', '/org/c-co/settings/members');
	});

	it('does not claim all set when a check failed and nothing else is outstanding', async () => {
		render(SettingsOverviewPage, {
			orgUrlSegment: 'c-co',
			sources: sources({ membersCoveringNoGroups: Promise.reject(new Error('Count unavailable')) })
		});

		await waitFor(() => expect(summaryState()).toBe('incomplete'));
	});

	it('keeps the summary on checking while any check is still loading', async () => {
		render(SettingsOverviewPage, {
			orgUrlSegment: 'c-co',
			sources: sources({ ungroupedPeople: new Promise(() => {}), pendingApprovals: Promise.resolve(3) })
		});

		await waitFor(() => expect(row('approvals').querySelector('[data-check-state="outstanding"]')).not.toBeNull());
		expect(summaryState()).toBe('checking');
		expect(row('ungrouped').querySelector('[data-check-state]')).toBeNull();
	});

	it('links each feature that is on with nothing set up to its own fix', async () => {
		render(SettingsOverviewPage, {
			orgUrlSegment: 'c-co',
			sources: sources({ featuresNotSetUp: Promise.resolve(['training', 'onboarding'] as const) })
		});

		await waitFor(() => expect(within(row('features')).getAllByRole('link')).toHaveLength(2));
		expect(
			within(row('features'))
				.getAllByRole('link')
				.map((link) => link.getAttribute('href'))
		).toEqual(['/org/c-co/training/types', '/org/c-co/onboarding/templates']);
	});
});
