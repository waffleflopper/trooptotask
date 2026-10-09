// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import DateRangeFieldTest from './DateRangeFieldTest.svelte';

afterEach(cleanup);

describe('DateRangeField', () => {
	it('names each date control by its label and applies a preset to both ends', async () => {
		render(DateRangeFieldTest);

		expect(screen.getByRole('button', { name: 'Start' }).textContent).toContain('Jan 1, 2026');
		expect(screen.getByRole('button', { name: 'End' }).textContent).toContain('Dec 31, 2026');

		await fireEvent.click(screen.getByRole('button', { name: 'Q1' }));

		expect(screen.getByLabelText('Range').textContent).toBe('2025-01-01..2025-03-31');
		expect(screen.getByRole('button', { name: 'Start' }).textContent).toContain('Jan 1, 2025');
	});
});
