// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ReadinessBandTest from './ReadinessBandTest.svelte';
import { Cell, Legend, readinessBandTierForPercent } from './index.js';

afterEach(() => {
	cleanup();
});

describe('ui/readiness-band', () => {
	it('renders readiness cells and the shared legend with stable tier hooks', () => {
		const { container } = render(ReadinessBandTest);

		const cells = screen.getByLabelText('Readiness band cells');
		expect(within(cells).getByLabelText('Danger readiness').textContent).toBe('48%');
		expect(within(cells).getByLabelText('Not applicable readiness').textContent).toBe('-');
		expect(container.querySelector('[data-slot="readiness-band-cell"][data-tier="good"]')).toBeTruthy();

		const legend = screen.getByLabelText('Readiness matrix tiers');
		expect(within(legend).getByText('<60%')).toBeTruthy();
		expect(within(legend).getByText('60-69%')).toBeTruthy();
		expect(within(legend).getByText('70-79%')).toBeTruthy();
		expect(within(legend).getByText('80-89%')).toBeTruthy();
		expect(within(legend).getByText('90%+')).toBeTruthy();
		expect(within(legend).getByText('Not applicable')).toBeTruthy();
		expect(container.querySelector('[data-slot="readiness-band-swatch"][data-tier="not-applicable"]')).toBeTruthy();
	});

	it('keeps the critical-training report tier thresholds centralized', () => {
		expect(readinessBandTierForPercent(null)).toBe('not-applicable');
		expect(readinessBandTierForPercent(59)).toBe('danger');
		expect(readinessBandTierForPercent(60)).toBe('warn');
		expect(readinessBandTierForPercent(70)).toBe('caution');
		expect(readinessBandTierForPercent(80)).toBe('okay');
		expect(readinessBandTierForPercent(90)).toBe('good');
	});

	it('announces an upcoming drop on a cell and keys it in a semantic legend', () => {
		render(Cell, { props: { tier: 'caution', percent: 74, palette: 'semantic', drop: 12, 'aria-label': 'Alpha CPR' } });
		render(Legend, {
			props: {
				palette: 'semantic',
				items: [{ tier: 'good', label: '85+' }],
				ariaLabel: 'Briefing bands',
				dropLabel: '▼ 10+'
			}
		});

		expect(screen.getByLabelText('Alpha CPR').textContent).toBe('74%▼ 12, drops 12 points');
		expect(
			within(screen.getByLabelText('Briefing bands'))
				.getAllByRole('listitem')
				.map((item) => item.textContent?.trim())
		).toEqual(['85+', '▼ 10+']);
	});
});
