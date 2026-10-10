// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import WorkspaceAccessRestricted from './WorkspaceAccessRestricted.svelte';

afterEach(() => {
	cleanup();
});

it('titles the document and names the restricted workspace', () => {
	render(WorkspaceAccessRestricted, { props: { subject: 'personnel' } });

	expect(document.title).toBe('Access Restricted - Troop to Task');
	expect(screen.getByRole('alert')).toHaveProperty(
		'textContent',
		expect.stringContaining("You don't have permission to view personnel.")
	);
	expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Access Restricted');
});
