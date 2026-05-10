// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import TypeWorkspaceShowroomExample from './TypeWorkspaceShowroomExample.svelte';

describe('/ui-showroom', () => {
	afterEach(() => {
		cleanup();
	});

	it('proves the shared TypeWorkspace pattern in the showroom', () => {
		const { container } = render(TypeWorkspaceShowroomExample);

		expect(screen.getByRole('heading', { name: 'Type workspace' })).toBeTruthy();
		expect(screen.getAllByText('Weapons Qualification').length).toBeGreaterThan(1);
		expect(container.querySelector('[data-slot="type-management-workspace"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-list-item"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-form-section"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-disclosure"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-choice-group"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-footer-actions"]')).toBeTruthy();
	});
});
