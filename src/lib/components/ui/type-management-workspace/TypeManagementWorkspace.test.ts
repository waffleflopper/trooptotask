// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TypeManagementWorkspaceTest from './TypeManagementWorkspaceTest.svelte';

describe('ui/type-management-workspace', () => {
	it('renders shared workspace slots for type-management pages', () => {
		const { container } = render(TypeManagementWorkspaceTest);

		expect(screen.getByRole('button', { name: /Annual Qualification/ })).toBeTruthy();
		expect(screen.getByText('Shared section chrome, route-owned controls.')).toBeTruthy();
		expect(screen.getByText('Shared choice chrome, route-owned option controls.')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-layout"]')).toBeTruthy();
		expect(
			container.querySelector('[data-slot="type-management-workspace-list-item"][data-selected="true"]')
		).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-form-section"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-choice"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-fact"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-mobile-back"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-disclosure"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="type-management-workspace-choice-group"]')).toBeTruthy();
	});
});
