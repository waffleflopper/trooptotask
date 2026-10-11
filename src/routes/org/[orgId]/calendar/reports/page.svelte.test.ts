// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import Page from './+page.svelte';

afterEach(cleanup);

describe('Calendar Reports page', () => {
	it('names the document like the other report pages and adds no landmark of its own', async () => {
		render(Page, {
			props: {
				data: {
					shell: { org: { id: 'org-1', urlSegment: 'org-1' } },
					allPersonnel: [],
					statusTypes: [],
					groups: []
				}
			} as never
		});

		await waitFor(() => expect(document.title).toBe('Calendar Reports - Troop to Task'));
		expect(screen.queryAllByRole('main')).toHaveLength(0);
	});
});
