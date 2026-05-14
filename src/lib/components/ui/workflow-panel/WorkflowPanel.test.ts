// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import WorkflowPanelTest from './WorkflowPanelTest.svelte';

afterEach(() => {
	cleanup();
});

describe('ui/workflow-panel', () => {
	it('renders the shared workflow panel structure with stable data slots', () => {
		const { container } = render(WorkflowPanelTest);

		expect(screen.getByRole('region', { name: 'Workflow panel test' })).toBeTruthy();
		expect(screen.getByRole('heading', { name: 'Training type setup' })).toBeTruthy();
		expect(screen.getByText('Shared two-panel workflow shell.')).toBeTruthy();
		expect(container.querySelector('[data-slot="workflow-panel-grid"]')).toBeTruthy();
		expect(container.querySelector('[data-slot="workflow-panel-item"][data-selected="true"]')).toBeTruthy();
	});
});
