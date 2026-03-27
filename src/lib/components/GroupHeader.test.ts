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

	it('renders the group header as two sibling tracks for the sticky label and scroll area', () => {
		const { container } = renderHeader();
		const groupHeader = container.querySelector('.group-header') as HTMLElement | null;
		const groupInfo = container.querySelector('.group-info') as HTMLElement | null;
		const spacer = container.querySelector('.group-header-spacer') as HTMLElement | null;

		expect(groupHeader).toBeTruthy();
		expect(groupInfo).toBeTruthy();
		expect(spacer).toBeTruthy();

		if (!groupHeader || !groupInfo || !spacer) {
			throw new Error('Group header not rendered');
		}

		expect(groupHeader.children).toHaveLength(2);
		expect(groupHeader.children[0]).toBe(groupInfo);
		expect(groupHeader.children[1]).toBe(spacer);
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
