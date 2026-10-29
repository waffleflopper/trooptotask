// @vitest-environment happy-dom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import GroupHeader from './GroupHeader.svelte';

afterEach(cleanup);

function renderHeader(
	overrides: Partial<{
		groupName: string;
		isCollapsed: boolean;
		isPinned: boolean;
		onToggle: () => void;
		onPinToggle: () => void;
	}> = {}
) {
	return render(GroupHeader, {
		props: {
			groupName: 'Alpha',
			isCollapsed: false,
			isPinned: false,
			...overrides
		}
	});
}

describe('GroupHeader', () => {
	it('renders the group name', () => {
		renderHeader({ groupName: 'Bravo' });
		expect(screen.getByText('Bravo')).toBeTruthy();
	});

	it('shows collapse arrow indicator', () => {
		renderHeader({ isCollapsed: false });
		expect(screen.getByText('▼')).toBeTruthy();
	});

	it('shows expand arrow when collapsed', () => {
		renderHeader({ isCollapsed: true });
		expect(screen.getByText('▶')).toBeTruthy();
	});

	it('toggles the group from the name and pins from the pin control without crossing over', async () => {
		const onToggle = vi.fn();
		const onPinToggle = vi.fn();
		renderHeader({ groupName: 'Bravo', onToggle, onPinToggle });

		await fireEvent.click(screen.getByRole('button', { name: /Bravo/ }));
		expect(onToggle).toHaveBeenCalledTimes(1);
		expect(onPinToggle).not.toHaveBeenCalled();

		await fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
		expect(onPinToggle).toHaveBeenCalledTimes(1);
		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it('exposes the pinned state on the pin control', () => {
		renderHeader({ isPinned: true, onPinToggle: vi.fn() });
		const pin = screen.getByRole('button', { name: 'Pinned' });
		expect(pin.getAttribute('aria-pressed')).toBe('true');
		expect(pin.getAttribute('title')).toBe('Unpin group');
	});

	it('has no pin control when the viewer cannot pin', () => {
		renderHeader({ groupName: 'Bravo' });
		expect(screen.getAllByRole('button')).toEqual([screen.getByRole('button', { name: /Bravo/ })]);
	});
});
