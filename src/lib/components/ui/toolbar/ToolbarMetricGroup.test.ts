// @vitest-environment happy-dom
import { cleanup, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ToolbarMetricGroup from './ToolbarMetricGroup.svelte';

describe('ToolbarMetricGroup', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders passive metric summaries as grouped toolbar content', () => {
		render(ToolbarMetricGroup, {
			props: {
				ariaLabel: 'Evaluation status summary',
				items: [
					{ id: 'overdue', label: 'Overdue', value: 2, color: '#b42318' },
					{ id: 'due-60', label: '60d', value: 1, color: '#b54708' },
					{ id: 'due-30', label: '30d', value: 3, color: '#6941c6' }
				]
			}
		});

		const summary = screen.getByRole('group', { name: 'Evaluation status summary' });

		expect(within(summary).getByText('2')).toBeTruthy();
		expect(within(summary).getByText('Overdue')).toBeTruthy();
		expect(within(summary).getByText('60d')).toBeTruthy();
		expect(within(summary).getByText('30d')).toBeTruthy();
		expect(screen.queryByRole('button', { name: /overdue/i })).toBeNull();
		expect(screen.queryByRole('link', { name: /overdue/i })).toBeNull();
	});
});
