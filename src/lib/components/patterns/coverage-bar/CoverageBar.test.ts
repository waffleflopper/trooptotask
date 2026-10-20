// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { CoverageBar } from './index.js';

afterEach(() => {
	cleanup();
});

describe('patterns/coverage-bar', () => {
	function mount() {
		render(CoverageBar, {
			props: {
				label: 'Counseling coverage',
				coveredText: 'counseling on record',
				gapText: 'no counseling',
				segments: [
					{ key: '2026-08', label: 'Aug', covered: true },
					{ key: '2026-09', label: 'Sep', covered: false },
					{ key: '2026-10', label: 'Oct', covered: true }
				],
				children: createRawSnippet(() => ({ render: () => '<span>2 of the last 3 months.</span>' }))
			}
		});
	}

	it('names every month in the list with whether it is covered or a gap', () => {
		mount();

		const list = screen.getByRole('list', { name: 'Counseling coverage' });

		expect(within(list).getAllByRole('listitem')).toHaveLength(3);
		expect(within(list).getByRole('img', { name: 'Aug: counseling on record' })).toBeTruthy();
		expect(within(list).getByRole('img', { name: 'Sep: no counseling' })).toBeTruthy();
		expect(within(list).getByRole('img', { name: 'Oct: counseling on record' })).toBeTruthy();
	});

	it('shows the caption under the bar', () => {
		mount();

		expect(screen.getByText('2 of the last 3 months.')).toBeTruthy();
	});
});
