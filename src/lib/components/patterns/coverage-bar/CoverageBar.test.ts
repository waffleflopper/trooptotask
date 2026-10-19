// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { CoverageBar } from './index.js';

afterEach(() => {
	cleanup();
});

describe('patterns/coverage-bar', () => {
	it('tells assistive technology which months are covered and which are gaps, and shows the caption', () => {
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

		const items = within(screen.getByRole('list', { name: 'Counseling coverage' })).getAllByRole('listitem');

		expect(items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
			'Aug Aug: counseling on record',
			'Sep Sep: no counseling',
			'Oct Oct: counseling on record'
		]);
		expect(screen.getByText('2 of the last 3 months.')).toBeTruthy();
	});
});
