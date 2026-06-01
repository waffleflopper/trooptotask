// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ReportWorkspaceTest from './ReportWorkspaceTest.svelte';

afterEach(() => cleanup());

describe('ReportWorkspace', () => {
	it('renders report header title, description, and meta', () => {
		render(ReportWorkspaceTest);

		expect(screen.getByRole('heading', { name: 'Readiness report' })).toBeInTheDocument();
		expect(screen.getByText('Current personnel readiness by group.')).toBeInTheDocument();
		expect(screen.getByText('Rows')).toBeInTheDocument();
		expect(screen.getByText('Today')).toBeInTheDocument();
	});

	it('renders toolbar filters, actions, and disabled export reasons', () => {
		render(ReportWorkspaceTest);

		expect(screen.getByRole('toolbar', { name: 'Readiness report controls' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: 'Report filters, 1 active' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Export CSV' })).toHaveAttribute('href', '/export.csv');

		const disabledExport = screen.getByRole('button', { name: 'Export PDF: Select a date range first' });
		expect(disabledExport).toBeDisabled();
		expect(disabledExport).toHaveAttribute('title', 'Select a date range first');

		expect(screen.getByRole('button', { name: 'Export XLSX' })).toHaveTextContent('Preparing XLSX');
		const erroredExport = screen.getByRole('button', { name: 'Export packet: Export service is unavailable' });
		expect(erroredExport).toBeDisabled();
		expect(erroredExport).toHaveAttribute('title', 'Export service is unavailable');
	});

	it('renders filter, chart, table, loading, no-data, and error states', () => {
		render(ReportWorkspaceTest);

		expect(screen.getByRole('region', { name: 'Report configuration' })).toBeInTheDocument();
		expect(screen.getByRole('group', { name: 'Date range controls' })).toBeInTheDocument();
		expect(screen.getByRole('img', { name: 'Readiness trend chart' })).toBeInTheDocument();

		const table = screen.getByRole('table', { name: 'Readiness rows table' });
		expect(within(table).getByText('Avery Brooks')).toBeInTheDocument();

		expect(screen.getByText('Loading report rows')).toBeInTheDocument();
		expect(screen.getByText('No report data')).toBeInTheDocument();
		expect(screen.getByRole('alert')).toHaveTextContent('Report failed');
		expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
	});
});
