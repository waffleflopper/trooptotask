// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import Page from './+page.svelte';
import type { OnboardingTemplate, PersonnelOnboarding } from '$features/onboarding/contracts';
import { createReadyAppShellRouteData } from '../../appShell.test-support';
import type { Personnel } from '$features/personnel/contracts';
import { openToolbarMore, stubToolbarWidths } from '$lib/test-support/toolbarWidths';

const { gotoMock } = vi.hoisted(() => ({ gotoMock: vi.fn() }));
vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	goto: gotoMock
}));

vi.mock('$features/app-shell', () => ({
	getAppShellContext: () => ({
		orgId: 'org-1',
		orgUrlSegment: 'org-1',
		scopeSet: { kind: 'organization' }
	})
}));

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	gotoMock.mockReset();
});

function renderHistory(
	onboardings: PersonnelOnboarding[],
	personnel: Personnel[] = [],
	templates: OnboardingTemplate[] = []
) {
	return render(Page, {
		props: {
			data: {
				...createReadyAppShellRouteData({ orgId: 'org-1' }),
				identitySessionScope: null,
				session: null,
				history: { onboardings, personnel, templates }
			}
		}
	});
}

describe('onboarding history page', () => {
	it('links back to the Onboarding pipeline from the row and from More', async () => {
		const widths = stubToolbarWidths();
		renderHistory([]);

		const row = within(screen.getByRole('toolbar', { name: 'Onboarding history controls' }));
		expect(row.getByRole('link', { name: 'Onboarding' }).getAttribute('href')).toBe('/org/org-1/onboarding');

		await widths.foldAll();
		expect(row.queryByRole('link', { name: 'Onboarding' })).toBeNull();
		const menu = await openToolbarMore('Onboarding history controls');
		await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Onboarding' }));
		await waitFor(() => expect(gotoMock).toHaveBeenCalledWith('/org/org-1/onboarding'));
	});

	it.each([
		{ currentStage: 'Reviewed', selectedText: 'Step 2: 2 Reviewed' },
		{ currentStage: 'Archived review', selectedText: null }
	])(
		'identifies saved paperwork stage $currentStage without allowing edits',
		async ({ currentStage, selectedText }) => {
			const personnel: Personnel[] = [
				{
					id: 'p-stage',
					rank: 'SGT',
					firstName: 'Sam',
					lastName: 'Stage',
					mos: '68W',
					clinicRole: 'Medic',
					groupId: 'group-alpha',
					groupName: 'Alpha'
				}
			];
			const onboardings: PersonnelOnboarding[] = [
				{
					id: 'history-stage',
					personnelId: 'p-stage',
					startedAt: '2026-01-01',
					completedAt: '2026-02-01',
					cancelledAt: null,
					status: 'completed',
					templateId: null,
					steps: [
						{
							id: 'paperwork-stage',
							onboardingId: 'history-stage',
							stepName: 'Saved paperwork',
							stepType: 'paperwork',
							trainingTypeId: null,
							stages: ['Submitted', 'Reviewed', 'Filed'],
							sortOrder: 0,
							completed: false,
							currentStage,
							notes: [],
							templateStepId: null,
							active: true,
							progressChangedAt: '2026-09-01T12:00:00.000Z'
						}
					]
				}
			];
			renderHistory(onboardings, personnel);
			await fireEvent.click(screen.getByRole('button', { name: /SGT Stage, Sam/ }));

			expect(screen.getByText(`Current stage: ${currentStage}`)).toBeTruthy();
			const stages = within(screen.getByRole('list', { name: 'Saved paperwork paperwork stages' })).getAllByRole(
				'listitem'
			);
			expect(stages).toHaveLength(3);
			expect(
				within(screen.getByRole('list', { name: 'Saved paperwork paperwork stages' })).queryAllByRole('button')
			).toEqual([]);
			expect(
				stages
					.filter((stage) => stage.getAttribute('aria-current') === 'step')
					.map((stage) => stage.textContent?.replace(/\s+/g, ' ').trim())
			).toEqual(selectedText ? [selectedText] : []);
		}
	);

	it('does not render its own main landmark inside the app shell', () => {
		renderHistory([]);

		expect(screen.queryByRole('main')).toBeNull();
	});

	it('does not render redundant archived summary cards', () => {
		const onboardings: PersonnelOnboarding[] = [];

		renderHistory(onboardings);

		expect(screen.queryByText('Completed or cancelled onboarding records')).toBeNull();
		expect(screen.queryByText('Packets closed successfully')).toBeNull();
		expect(screen.queryByText('Packets stopped before completion')).toBeNull();
	});

	it('keeps archived personnel visible in completed history records', () => {
		const personnel: Personnel[] = [
			{
				id: 'p-archived',
				rank: 'SGT',
				firstName: 'Avery',
				lastName: 'Archived',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: 'group-alpha',
				groupName: 'Alpha',
				archivedAt: '2026-03-01T00:00:00Z'
			}
		];
		const onboardings: PersonnelOnboarding[] = [
			{
				id: 'onboarding-1',
				personnelId: 'p-archived',
				startedAt: '2026-01-01T00:00:00Z',
				completedAt: '2026-02-01T00:00:00Z',
				cancelledAt: null,
				status: 'completed',
				steps: [],
				templateId: null
			}
		];

		renderHistory(onboardings, personnel);

		expect(screen.getByText('SGT Archived, Avery')).toBeTruthy();
		expect(screen.queryByText('Unknown')).toBeNull();
	});

	it('renders completed and cancelled history records while excluding active onboardings', () => {
		const personnel: Personnel[] = [
			{
				id: 'p-completed',
				rank: 'SGT',
				firstName: 'Casey',
				lastName: 'Complete',
				mos: '11B',
				clinicRole: 'Team Leader',
				groupId: 'group-alpha',
				groupName: 'Alpha'
			},
			{
				id: 'p-cancelled',
				rank: 'CPL',
				firstName: 'Drew',
				lastName: 'Cancelled',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: 'group-alpha',
				groupName: 'Alpha'
			},
			{
				id: 'p-active',
				rank: 'PFC',
				firstName: 'Riley',
				lastName: 'Active',
				mos: '25U',
				clinicRole: 'Signal',
				groupId: 'group-alpha',
				groupName: 'Alpha'
			}
		];
		const onboardings: PersonnelOnboarding[] = [
			{
				id: 'completed-onboarding',
				personnelId: 'p-completed',
				startedAt: '2026-01-01T00:00:00Z',
				completedAt: '2026-02-01T00:00:00Z',
				cancelledAt: null,
				status: 'completed',
				steps: [],
				templateId: null
			},
			{
				id: 'cancelled-onboarding',
				personnelId: 'p-cancelled',
				startedAt: '2026-01-03T00:00:00Z',
				completedAt: null,
				cancelledAt: '2026-02-03T00:00:00Z',
				status: 'cancelled',
				steps: [],
				templateId: null
			},
			{
				id: 'active-onboarding',
				personnelId: 'p-active',
				startedAt: '2026-01-05T00:00:00Z',
				completedAt: null,
				cancelledAt: null,
				status: 'in_progress',
				steps: [],
				templateId: null
			}
		];

		renderHistory(onboardings, personnel);

		expect(screen.getByText('SGT Complete, Casey')).toBeTruthy();
		expect(screen.getByText('CPL Cancelled, Drew')).toBeTruthy();
		expect(screen.queryByText('PFC Active, Riley')).toBeNull();
	});
	it('labels each closed packet with the template loaded alongside History', () => {
		renderHistory(
			[
				{
					id: 'templated-onboarding',
					personnelId: 'p-templated',
					startedAt: '2026-01-01T00:00:00Z',
					completedAt: '2026-02-01T00:00:00Z',
					cancelledAt: null,
					status: 'completed',
					steps: [],
					templateId: 'template-new'
				}
			],
			[
				{
					id: 'p-templated',
					rank: 'SGT',
					firstName: 'Tess',
					lastName: 'Template',
					mos: '68W',
					clinicRole: 'Medic',
					groupId: 'group-alpha',
					groupName: 'Alpha'
				} as Personnel
			],
			[{ id: 'template-new', name: 'New Arrival Packet' } as OnboardingTemplate]
		);

		expect(screen.getByText(/New Arrival Packet/)).toBeTruthy();
	});
});
