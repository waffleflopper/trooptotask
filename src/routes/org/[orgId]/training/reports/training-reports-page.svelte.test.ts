// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	DEFAULT_TRAINING_BRIEFING_INPUT,
	type TrainingBriefingReportData,
	type TrainingBriefingReportInput,
	type TrainingType
} from '$features/training/contracts';
import { buildTrainingBriefing } from '$features/training';
import Page from './+page.svelte';

vi.mock('$app/navigation', async (importOriginal) => ({
	...(await importOriginal<typeof import('$app/navigation')>()),
	replaceState: vi.fn()
}));
vi.mock('$features/app-shell', () => ({ getAppShellContext: () => ({ orgId: 'org-1' }) }));

const CPR: TrainingType = {
	id: 'cpr',
	name: 'CPR',
	description: null,
	expirationMonths: 12,
	warningDaysYellow: 60,
	warningDaysOrange: 30,
	appliesToRoles: [],
	appliesToMos: [],
	appliesToRanks: [],
	excludedRoles: [],
	excludedMos: [],
	excludedRanks: [],
	color: '#22c55e',
	sortOrder: 0,
	expirationDateOnly: false,
	canBeExempted: false,
	exemptPersonnelIds: [],
	isOptional: false
};

function report(
	organizationName: string,
	soldiers: number,
	horizonDays: TrainingBriefingReportInput['horizonDays'] = 90
): TrainingBriefingReportData {
	return {
		input: { ...DEFAULT_TRAINING_BRIEFING_INPUT, horizonDays },
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
			types: [CPR],
			records: [],
			filters: {},
			horizonDays,
			asOf: '2026-09-29',
			goalPercent: 90,
			rowsBy: 'group',
			scopeName: organizationName
		}),
		filterOptions: { views: [], groups: [], ranks: [], mos: [], roles: [], types: [{ id: 'cpr', name: 'CPR' }] }
	};
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe('Training reports route page', () => {
	it('starts over when the route delivers another Organization after the viewer filtered', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => Response.json(report('Alpha Company', 2, 30)))
		);
		const { rerender } = render(Page, { props: { data: { trainingReport: report('Alpha Company', 2) } as never } });
		await fireEvent.click(screen.getByRole('button', { name: '30 days' }));
		expect(await screen.findByText('Forecast · next 30 days')).toBeTruthy();

		await rerender({ data: { trainingReport: report('Bravo Company', 5) } as never });

		expect(screen.getByText('Bravo Company · 5 soldiers · as of 29 Sep 2026')).toBeTruthy();
		expect(screen.queryByText(/Alpha Company/)).toBeNull();
	});
});
