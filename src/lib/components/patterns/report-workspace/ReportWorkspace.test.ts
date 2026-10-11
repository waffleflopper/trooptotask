// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ReportWorkspaceTest from './ReportWorkspaceTest.svelte';
import * as ReportWorkspace from './index.js';

afterEach(() => cleanup());

describe('ReportWorkspace', () => {
	it('renders export actions with disabled and error reasons', () => {
		render(ReportWorkspaceTest);

		expect(screen.getByRole('link', { name: 'Export workbook' })).toHaveAttribute('href', '/export.xlsx');

		const disabledExport = screen.getByRole('button', { name: 'Export PDF: Select a date range first' });
		expect(disabledExport).toBeDisabled();
		expect(disabledExport).toHaveAttribute('title', 'Select a date range first');

		expect(screen.getByRole('button', { name: 'Export XLSX' })).toHaveTextContent('Preparing XLSX');
		const erroredExport = screen.getByRole('button', { name: 'Export packet: Export service is unavailable' });
		expect(erroredExport).toBeDisabled();
		expect(erroredExport).toHaveAttribute('title', 'Export service is unavailable');
	});

	it('renders filter, table, loading, no-data, and error states', () => {
		render(ReportWorkspaceTest);

		expect(screen.getByRole('region', { name: 'Report configuration' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: 'Date range controls' })).toBeInTheDocument();

		const table = screen.getByRole('table', { name: 'Readiness rows table' });
		expect(within(table).getByText('Avery Brooks')).toBeInTheDocument();
		expect(screen.getByLabelText('Report summary')).toHaveTextContent('Maya Chen · Action');
		expect(screen.getByText('1 person needs action.')).toBeInTheDocument();

		expect(screen.getByText('Loading report rows')).toBeInTheDocument();
		expect(screen.getByText('No report data')).toBeInTheDocument();
		expect(screen.getByRole('alert')).toHaveTextContent('Report failed');
		expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
	});

	it('marks a loading state busy with a named spinner and clears it when the wait ends', async () => {
		const view = render(ReportWorkspace.State, { state: 'loading', title: 'Loading report rows' });

		const busy = screen.getAllByRole('status').filter((node) => node.getAttribute('aria-busy') === 'true');
		expect(busy).toHaveLength(1);
		expect(busy[0]).toHaveTextContent('Loading report rows');
		expect(within(busy[0]).getByRole('status', { name: 'Loading' })).toBeInTheDocument();

		await view.rerender({ state: 'no-data', title: 'No report data' });
		expect(screen.getByRole('heading', { level: 4, name: 'No report data' })).toBeInTheDocument();
		expect(document.querySelector('[aria-busy="true"]')).toBeNull();

		await view.rerender({ state: 'no-data', title: 'No report data', level: 2 });
		expect(screen.getByRole('heading', { level: 2, name: 'No report data' })).toBeInTheDocument();
	});
});
