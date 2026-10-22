// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import WorkspaceToolbarIcon from './workspace-toolbar-icon.svelte';
import type { WorkspaceToolbarIcon as IconName } from './toolbar-types';

afterEach(() => {
	cleanup();
});

describe('WorkspaceToolbarIcon', () => {
	it.each([
		'archive',
		'arrow-left',
		'book-open',
		'calendar-days',
		'chart',
		'clipboard-check',
		'clipboard-list',
		'download',
		'file-plus',
		'plus',
		'printer',
		'settings',
		'upload',
		'user-plus'
	] satisfies IconName[])('hides the decorative %s icon from assistive technology', (icon) => {
		const { container } = render(WorkspaceToolbarIcon, { props: { icon } });

		const svg = container.querySelector('svg');
		expect(svg?.getAttribute('aria-hidden')).toBe('true');
	});
});
