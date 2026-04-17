// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import IctReportKpiStrip from './IctReportKpiStrip.svelte';
import type { IctReportDashboard } from '$features/critical-tasks/utils/ictReports';

const dashboard: IctReportDashboard = {
	kpis: {
		overallReadiness: {
			percent: 75,
			deltaPercent: 25,
			readyCount: 3,
			applicableCount: 4
		},
		soldiersBelow70: {
			count: 1,
			totalAssigned: 3,
			thresholdPercent: 70
		},
		tasksExpiringSoon: {
			count: 2,
			affectedSoldiers: 2,
			windowDays: 30
		},
		tasksBelowThreshold: {
			count: 1,
			thresholdPercent: 70
		}
	},
	tasksBelowThreshold: {
		thresholdPercent: 70,
		rows: []
	}
};

describe('IctReportKpiStrip', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the four action KPI cards with accessible labels and operational subtitles', () => {
		render(IctReportKpiStrip, { props: { dashboard } });

		const strip = screen.getByRole('region', { name: 'Action KPIs' });
		const overall = within(strip).getByRole('article', { name: 'Overall Readiness' });
		const soldiers = within(strip).getByRole('article', { name: 'Soldiers Below 70%' });
		const expiring = within(strip).getByRole('article', { name: 'Tasks Expiring ≤30d' });
		const threshold = within(strip).getByRole('article', { name: 'Tasks Below Threshold' });

		expect(within(overall).getByText('75%')).toBeTruthy();
		expect(within(overall).getByText('+25 pts vs 30d')).toBeTruthy();
		expect(within(soldiers).getByText('1')).toBeTruthy();
		expect(within(soldiers).getByText('3 assigned')).toBeTruthy();
		expect(within(expiring).getByText('2')).toBeTruthy();
		expect(within(expiring).getByText('2 Soldiers affected')).toBeTruthy();
		expect(within(threshold).getByText('1')).toBeTruthy();
		expect(within(threshold).getByText('Below 70% unit completion')).toBeTruthy();
	});
});
