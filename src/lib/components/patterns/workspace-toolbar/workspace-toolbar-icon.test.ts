// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import WorkspaceToolbarIcon from './workspace-toolbar-icon.svelte';
import type { WorkspaceToolbarIcon as IconName } from './types';

afterEach(() => {
	cleanup();
});

describe('WorkspaceToolbarIcon', () => {
	it.each([
		['archive', 'lucide-archive'],
		['arrow-left', 'lucide-arrow-left'],
		['book-open', 'lucide-book-open'],
		['calendar-days', 'lucide-calendar-days'],
		['chart', 'lucide-chart-column'],
		['clipboard-check', 'lucide-clipboard-check'],
		['clipboard-list', 'lucide-clipboard-list'],
		['download', 'lucide-download'],
		['file-plus', 'lucide-file-plus-corner'],
		['plus', 'lucide-plus'],
		['printer', 'lucide-printer'],
		['settings', 'lucide-settings'],
		['upload', 'lucide-upload'],
		['user-plus', 'lucide-user-plus']
	] as [IconName, string][])('renders %s as a hidden %s icon', (icon, lucideClass) => {
		const { container } = render(WorkspaceToolbarIcon, { props: { icon } });

		const svg = container.querySelector('svg');
		expect(svg?.classList.contains(lucideClass)).toBe(true);
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});

	it('renders nothing without an icon', () => {
		const { container } = render(WorkspaceToolbarIcon, { props: {} });

		expect(container.querySelector('svg')).toBeNull();
	});
});
