// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
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

describe('patterns/readiness-items', () => {
	it('reveals the hidden current items on request and opens the chosen item', async () => {
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
		expect(screen.getByRole('button', { name: 'Open Item d' })).toBeTruthy();
		expect(screen.queryByRole('button', { name: 'Open Item e' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Open Item f' })).toBeNull();

		await fireEvent.click(screen.getByRole('button', { name: 'Show 2 more current' }));
		expect(screen.getByRole('button', { name: 'Open Item e' })).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Open Item f' })).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: 'Open Item sharp' }));
		expect(opened).toEqual(['sharp']);
	});

	it('counts nothing ready and offers no reveal when nothing applies', () => {
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
		expect(screen.queryByText(/more current/)).toBeNull();
	});
});
