// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import OperationalMatrixTest from './OperationalMatrixTest.svelte';

afterEach(() => cleanup());

describe('OperationalMatrix', () => {
	it('renders row headers, column headers, and dense cells', () => {
		render(OperationalMatrixTest);

		const matrix = screen.getByRole('table', { name: 'Training and DA6 operational matrix' });
		expect(within(matrix).getByRole('columnheader', { name: 'Soldier' })).toBeInTheDocument();
		expect(
			within(matrix).getByRole('columnheader', { name: 'Land Navigation: Required annual task' })
		).toBeInTheDocument();
		expect(within(matrix).getByRole('rowheader', { name: 'Brooks, Avery' })).toBeInTheDocument();
		expect(within(matrix).getByText('Complete')).toBeInTheDocument();
	});

	it('labels cells with row, column, state, value, and detail text', () => {
		render(OperationalMatrixTest);

		expect(
			screen.getByRole('button', {
				name: 'Open Brooks, Avery Land Navigation. Brooks, Avery Land Navigation: Complete, 2026-04-12. Current through 2027.'
			})
		).toBeInTheDocument();

		expect(
			screen.getByRole('button', {
				name: 'Open Chen, Maya Combat Lifesaver. Chen, Maya Combat Lifesaver: Incomplete, Missing. No record found.'
			})
		).toBeInTheDocument();
	});

	it('supports compact icon-only cells while preserving accessible labels', () => {
		render(OperationalMatrixTest);

		expect(screen.getByLabelText('Operational matrix test')).toHaveAttribute('data-density', 'compact');
		const compactCell = document.querySelector('[data-slot="operational-matrix-cell"][data-visual-mode="icon"]');
		expect(compactCell).toBeTruthy();
		expect(
			screen.getByRole('button', {
				name: 'Open Brooks, Avery Land Navigation. Brooks, Avery Land Navigation: Complete, 2026-04-12. Current through 2027.'
			})
		).toBeInTheDocument();
	});

	it('renders sticky viewport structure and semantic state classes without using DataTable', () => {
		render(OperationalMatrixTest);

		const viewport = screen.getByRole('region', { name: 'Training and DA6 matrix viewport' });
		expect(viewport).toHaveAttribute('data-slot', 'operational-matrix-viewport');
		expect(viewport.className).toContain('operational-matrix-viewport');
		expect(screen.queryByTestId('data-table')).not.toBeInTheDocument();
		expect(document.querySelector('[data-slot="operational-matrix-cell"][data-state="expired"]')).toBeTruthy();
	});

	it('renders legend items with non-color text and icon marks', () => {
		render(OperationalMatrixTest);

		const legend = screen.getByLabelText('Operational matrix legend');
		expect(within(legend).getByText('Complete')).toBeInTheDocument();
		expect(within(legend).getByText('Warning')).toBeInTheDocument();
		expect(within(legend).getByText('Assigned')).toBeInTheDocument();
		expect(within(legend).getByText('X')).toBeInTheDocument();
	});

	it('renders empty, loading, disabled, and read-only states', () => {
		render(OperationalMatrixTest);

		expect(screen.getByRole('status', { name: 'Loading matrix preview' })).toBeInTheDocument();
		expect(screen.getByText('No matrix rows')).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Read only' })).toBeDisabled();
		expect(screen.getByLabelText('Read-only operational matrix')).toHaveAttribute('data-readonly', 'true');
		expect(screen.getByLabelText('Ortiz, Sam Readiness note: Info, Needs review')).toBeInTheDocument();
	});

	it('fires cell actions and supports keyboard focus on static cells', async () => {
		render(OperationalMatrixTest);

		await fireEvent.click(
			screen.getByRole('button', {
				name: 'Open Brooks, Avery Land Navigation. Brooks, Avery Land Navigation: Complete, 2026-04-12. Current through 2027.'
			})
		);
		expect(screen.getByTestId('matrix-action-result')).toHaveTextContent('avery:land-nav');

		const staticCell = screen.getByLabelText('Ortiz, Sam Readiness note: Info, Needs review');
		expect(staticCell).not.toHaveAttribute('tabindex');
	});
});
