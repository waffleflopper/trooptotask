// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { ReadinessItemTable, type ReadinessItemRow } from './index.js';

afterEach(() => {
	cleanup();
});

function row(id: string, status: ReadinessItemRow['status'], expiresOn: string | null): ReadinessItemRow {
	return { id, status, name: `Item ${id}`, detail: `${id} detail`, recordedOn: '2025-10-27', expiresOn };
}

const rows = [
	row('cpr', 'expired', '2026-09-24'),
	row('sharp', 'missing', null),
	row('m4', 'expiring', '2026-10-27'),
	...['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => row(id, 'current', `2027-0${index + 1}-01`))
];

function bodyRows() {
	const [, body] = screen.getAllByRole('rowgroup');
	return within(body)
		.getAllByRole('row')
		.map((element) => element.textContent?.replace(/\s+/g, ' ').trim());
}

describe('patterns/readiness-items', () => {
	it('lists problems first, groups current items soonest expiry first and reveals the rest on request', async () => {
		const opened: string[] = [];
		render(ReadinessItemTable, {
			props: {
				eyebrow: 'Training',
				note: 'Expiring still counts as ready',
				itemLabel: 'Training type',
				recordedLabel: 'Completed',
				rows,
				emptyMessage: 'Nothing required.',
				onOpen: (id: string) => opened.push(id)
			}
		});

		expect(screen.getByText('7 of 9 ready')).toBeTruthy();
		expect(bodyRows()).toEqual([
			'Expired Item cpr cpr detail 27 Oct 2025 24 Sep 2026',
			'Missing Item sharp sharp detail 27 Oct 2025 —',
			'Expiring Item m4 m4 detail 27 Oct 2025 27 Oct 2026',
			'Current · 6 soonest expiry first',
			'Current Item a a detail 27 Oct 2025 1 Jan 2027',
			'Current Item b b detail 27 Oct 2025 1 Feb 2027',
			'Current Item c c detail 27 Oct 2025 1 Mar 2027',
			'Current Item d d detail 27 Oct 2025 1 Apr 2027'
		]);

		await fireEvent.click(screen.getByRole('button', { name: 'Show 2 more current' }));
		expect(bodyRows()).toHaveLength(10);

		await fireEvent.click(screen.getByRole('button', { name: 'Open Item sharp' }));
		expect(opened).toEqual(['sharp']);
	});

	it('says what is required when nothing applies', () => {
		render(ReadinessItemTable, {
			props: {
				eyebrow: 'Training',
				note: 'Expiring still counts as ready',
				itemLabel: 'Training type',
				recordedLabel: 'Completed',
				rows: [],
				emptyMessage: 'No training is required for 68W.',
				onOpen: () => {}
			}
		});

		expect(screen.getByText('0 of 0 ready')).toBeTruthy();
		expect(screen.getByText('No training is required for 68W.')).toBeTruthy();
		expect(screen.queryByText(/more current/)).toBeNull();
	});
});
