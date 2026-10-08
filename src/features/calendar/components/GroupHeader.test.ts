// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import GroupHeader from './GroupHeader.svelte';

afterEach(cleanup);

function renderHeader(overrides: Partial<{ groupName: string; isCollapsed: boolean; isPinned: boolean }> = {}) {
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
});
