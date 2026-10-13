// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ReportWorkspaceTest from './ReportWorkspaceTest.svelte';
import * as ReportWorkspace from './index.js';

afterEach(() => cleanup());

describe('ReportWorkspace', () => {
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

	it('announces a loading state as a live status with a named spinner and removes it when the wait ends', async () => {
		const view = render(ReportWorkspace.State, { state: 'loading', title: 'Loading report rows' });

		const live = screen.getAllByRole('status').filter((node) => node.getAttribute('aria-live') === 'polite');
		expect(live).toHaveLength(1);
		expect(live[0]).toHaveTextContent('Loading report rows');
		expect(live[0].hasAttribute('aria-busy')).toBe(false);
		expect(within(live[0]).getByRole('status', { name: 'Loading' })).toBeInTheDocument();

		await view.rerender({ state: 'no-data', title: 'No report data' });
		expect(screen.getByRole('heading', { level: 4, name: 'No report data' })).toBeInTheDocument();
		expect(screen.queryByRole('status')).toBeNull();

		await view.rerender({ state: 'no-data', title: 'No report data', level: 2 });
		expect(screen.getByRole('heading', { level: 2, name: 'No report data' })).toBeInTheDocument();
	});
});
