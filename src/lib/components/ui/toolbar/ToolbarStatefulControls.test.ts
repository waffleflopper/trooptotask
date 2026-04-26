// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import ToolbarStatefulControlsTest from './ToolbarStatefulControlsTest.svelte';

describe('stateful toolbar controls', () => {
	afterEach(() => {
		cleanup();
	});

	it('renders a labelled group boundary and counts active filters', async () => {
		render(ToolbarStatefulControlsTest);

		expect(screen.getByRole('group', { name: 'Filters' })).toBeTruthy();
		expect(screen.queryByText('2 active')).toBeNull();

		await fireEvent.change(screen.getByLabelText('Group filter'), { target: { value: 'bravo' } });
		await fireEvent.change(screen.getByLabelText('Critical Tasks matrix scope'), { target: { value: 'gaps' } });

		expect(screen.getByTestId('state').textContent).toBe('bravo|gaps|by-group|2');
	});

	it('opens a compact group panel with an active-count trigger and preserves control state', async () => {
		render(ToolbarStatefulControlsTest, { props: { mode: 'compact' } });

		const trigger = screen.getByRole('button', { name: 'Filters' });
		expect(trigger.getAttribute('aria-expanded')).toBe('false');
		expect(trigger.getAttribute('data-active-count')).toBe('0');
		expect(screen.queryByLabelText('Group filter')).toBeNull();

		await fireEvent.click(trigger);
		await fireEvent.change(await screen.findByLabelText('Group filter'), { target: { value: 'alpha' } });
		await fireEvent.change(screen.getByLabelText('Critical Tasks matrix scope'), { target: { value: 'gaps' } });
		await fireEvent.click(screen.getByRole('button', { name: 'A-Z' }));

		expect(screen.getByTestId('state').textContent).toBe('alpha|gaps|alphabetical|2');
		expect(trigger.getAttribute('data-active-count')).toBe('2');
		expect(screen.getByText('2 active')).toBeTruthy();

		await fireEvent.keyDown(screen.getByTestId('filters-group-panel'), { key: 'Escape' });
		await waitFor(() => {
			expect(screen.queryByTestId('filters-group-panel')).toBeNull();
		});
		expect(trigger.getAttribute('aria-expanded')).toBe('false');

		await fireEvent.click(trigger);
		expect(((await screen.findByLabelText('Group filter')) as HTMLSelectElement).value).toBe('alpha');
		expect((screen.getByLabelText('Critical Tasks matrix scope') as HTMLSelectElement).value).toBe('gaps');
		expect(screen.getByRole('button', { name: 'A-Z' }).getAttribute('aria-pressed')).toBe('true');
	});

	it('keeps never-compact groups rendered as full controls', () => {
		render(ToolbarStatefulControlsTest, {
			props: { mode: 'compact', compactStrategy: 'never' }
		});

		expect(screen.queryByRole('button', { name: 'Filters' })).toBeNull();
		expect(screen.getByLabelText('Group filter')).toBeTruthy();
	});
});
