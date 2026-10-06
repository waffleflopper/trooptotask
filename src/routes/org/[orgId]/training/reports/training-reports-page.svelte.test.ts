// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRAINING_BRIEFING_INPUT, type TrainingBriefingReportData } from '$features/training/contracts';
import { buildTrainingBriefing } from '$features/training';
import Page from './+page.svelte';

vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	replaceState: vi.fn()
}));
vi.mock('$features/app-shell', () => ({ getAppShellContext: () => ({ orgId: 'org-1' }) }));

function report(organizationName: string, soldiers: number): TrainingBriefingReportData {
	return {
		input: DEFAULT_TRAINING_BRIEFING_INPUT,
		organizationName,
		briefing: buildTrainingBriefing({
			personnel: Array.from({ length: soldiers }, (_, index) => ({
				id: `p${index}`,
				rank: 'SGT',
				lastName: `p${index}`,
				firstName: 'Pat',
				mos: '68W',
				clinicRole: 'Medic',
				groupId: null,
				groupName: ''
			})),
			types: [],
			records: [],
			filters: {},
			horizonDays: 90,
			asOf: '2026-09-29',
			goalPercent: 90,
			rowsBy: 'group',
			scopeName: organizationName
		}),
		filterOptions: { views: [], groups: [], ranks: [], mos: [], roles: [], types: [] }
	};
}

afterEach(() => cleanup());

describe('Training reports route page', () => {
	it('renders the server briefing and starts over when the route delivers another Organization', async () => {
		const { rerender } = render(Page, { props: { data: { trainingReport: report('Alpha Company', 2) } as never } });

		expect(screen.getByText('Alpha Company · 2 soldiers · as of 29 Sep 2026')).toBeTruthy();

		await rerender({ data: { trainingReport: report('Bravo Company', 5) } as never });

		expect(screen.getByText('Bravo Company · 5 soldiers · as of 29 Sep 2026')).toBeTruthy();
		expect(screen.queryByText(/Alpha Company/)).toBeNull();
	});
});
