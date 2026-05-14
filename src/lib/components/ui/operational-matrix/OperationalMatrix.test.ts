// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import OperationalMatrixTest from './OperationalMatrixTest.svelte';

afterEach(() => {
	cleanup();
});

describe('OperationalMatrix', () => {
	it('renders native table structure with grouped rows, stacked headers, and custom content', () => {
		render(OperationalMatrixTest);

		const table = screen.getByRole('table', { name: 'Operational matrix test table' });
		expect(table).toBeTruthy();
		expect(screen.getByRole('region', { name: 'Operational matrix test viewport' })).toBeTruthy();

		expect(screen.getByRole('columnheader', { name: 'Planning windows' }).getAttribute('colspan')).toBe('2');
		expect(screen.getByRole('columnheader', { name: 'Alpha window' })).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Alpha window' }).getAttribute('data-orientation')).toBe(
			'vertical'
		);
		expect(screen.getByRole('rowheader', { name: /Avery Brooks Section lead/i })).toBeTruthy();

		expect(screen.getByRole('row', { name: /Headquarters/i })).toBeTruthy();
		expect(screen.getByRole('row', { name: /Line companies/i })).toBeTruthy();

		const selectedCell = within(table).getByRole('button', { name: 'Avery Brooks Alpha window planning action' });
		expect(selectedCell.closest('td')?.getAttribute('data-row-id')).toBe('avery');
		expect(selectedCell.closest('td')?.getAttribute('data-column-id')).toBe('alpha');
		expect(selectedCell.closest('td')?.getAttribute('data-selected')).toBe('true');
	});

	it('forwards row and column identity in selection payloads', async () => {
		render(OperationalMatrixTest);

		await fireEvent.click(screen.getByRole('button', { name: 'Avery Brooks Bravo window planning action' }));

		expect(screen.getByTestId('selected-payload').textContent).toBe('avery:bravo:pointer:Section lead:Week 2');
		expect(
			screen
				.getByRole('button', { name: 'Avery Brooks Bravo window planning action' })
				.closest('td')
				?.getAttribute('data-selected')
		).toBe('true');
	});

	it('does not expose disabled or read-only cells as actions', () => {
		render(OperationalMatrixTest);

		expect(screen.queryByRole('button', { name: 'Maya Chen Alpha window planning action' })).toBeNull();
		expect(screen.queryByRole('button', { name: 'Jon Bell Alpha window planning action' })).toBeNull();

		const readOnlyCell = screen.getByText('Maya Chen').closest('tr')?.querySelector('[data-column-id="alpha"]');
		const disabledCell = screen.getByText('Jon Bell').closest('tr')?.querySelector('[data-column-id="alpha"]');

		expect(readOnlyCell?.getAttribute('data-readonly')).toBe('true');
		expect(disabledCell?.getAttribute('data-disabled')).toBe('true');
	});

	it('preserves accessible names when cells use compact visual content', () => {
		render(OperationalMatrixTest);

		const compactCell = screen.getByRole('button', { name: 'Avery Brooks Alpha window planning action' });
		expect(compactCell).toBeTruthy();
		expect(compactCell.textContent).toBe('Assigned');
	});
});
