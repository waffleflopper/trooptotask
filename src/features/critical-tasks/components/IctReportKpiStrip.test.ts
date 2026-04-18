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
			windowDays: 60
		},
		tasksBelowThreshold: {
			count: 1,
			thresholdPercent: 70
		}
	},
	tasksBelowThreshold: {
		thresholdPercent: 70,
		rows: []
	},
	atRiskSoldiers: {
		rows: []
	},
	readinessTrend: {
		comparisonMos: [],
		months: []
	},
	expirationCliff: {
		mosSeries: [],
		months: [],
		projectedReadinessAtMonth6: {
			month: '2026-09',
			label: 'Sep 2026',
			readinessPercent: 75,
			readyCount: 3,
			applicableCount: 4
		}
	},
	readinessMatrix: {
		hasCategorizedTasks: false,
		categories: [],
		rows: []
	},
	readinessDistribution: {
		bins: [],
		defaultMos: null,
		series: []
	}
};

describe('IctReportKpiStrip', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders the four KPI cards with accessible labels and mockup-style subtitles', () => {
		render(IctReportKpiStrip, { props: { dashboard } });

		const strip = screen.getByRole('region', { name: 'Critical task report metrics' });
		const overall = within(strip).getByRole('article', { name: 'Overall Readiness' });
		const soldiers = within(strip).getByRole('article', { name: 'Soldiers Below 70%' });
		const expiring = within(strip).getByRole('article', { name: 'Tasks Expiring ≤60d' });
		const threshold = within(strip).getByRole('article', { name: 'Tasks Below Threshold' });

		expect(overall.querySelector('.kpi-value')?.textContent).toBe('75%');
		expect(within(overall).getByText('▲ 25% vs 30 days ago')).toBeTruthy();
		expect(within(soldiers).getByText('1')).toBeTruthy();
		expect(within(soldiers).getByText('of 3 assigned · 33%')).toBeTruthy();
		expect(within(expiring).getByText('2')).toBeTruthy();
		expect(within(expiring).getByText('across 2 soldiers')).toBeTruthy();
		expect(within(threshold).getByText('1')).toBeTruthy();
		expect(within(threshold).getByText('<70% unit completion')).toBeTruthy();
		expect(screen.queryByText('Action KPIs')).toBeNull();
	});
});
