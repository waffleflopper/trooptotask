// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import WorkspaceAccessRestricted from './WorkspaceAccessRestricted.svelte';

const { pageState } = vi.hoisted(() => ({
	pageState: { data: { shell: { org: { id: 'org-1', name: 'Alpha Company', urlSegment: '1-11-bde' } } } }
}));
vi.mock('$app/state', () => ({ page: pageState }));

afterEach(() => {
	cleanup();
});

it.each([
	{ lane: 'training', level: 'view', needs: 'Training View' },
	{ lane: 'criticalTasks', level: 'operate', needs: 'Critical tasks Update' },
	{ lane: 'ratingScheme', level: 'configure', needs: 'Evaluations Manage' }
] as const)('names the $needs access to ask the Organization for', ({ lane, level, needs }) => {
	render(WorkspaceAccessRestricted, { props: { lane, level } });

	const alert = screen.getByRole('alert');
	expect(alert.textContent).toContain(`You need ${needs} access`);
	expect(alert.textContent).toContain('An owner or admin of Alpha Company can grant it.');
	expect(document.title).toBe('Access Restricted - Troop to Task');
});

it('offers one way back to the Organization home by its URL segment', () => {
	render(WorkspaceAccessRestricted, { props: { lane: 'personnel', level: 'view' } });

	expect(screen.getAllByRole('link')).toHaveLength(1);
	expect(screen.getByRole('link', { name: 'Back to Alpha Company home' }).getAttribute('href')).toBe('/org/1-11-bde');
});
