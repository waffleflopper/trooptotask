// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ReadinessBandTest from './ReadinessBandTest.svelte';
import { readinessBandTierForPercent } from './index.js';

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
});
