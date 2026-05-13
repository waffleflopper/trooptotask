// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DemoSandboxModal from './DemoSandboxModal.svelte';

afterEach(async () => {
	cleanup();
	vi.restoreAllMocks();
	await new Promise((resolve) => setTimeout(resolve, 30));
});

describe('DemoSandboxModal', () => {
	it('renders the sandbox flow in the shared app dialog', () => {
		render(DemoSandboxModal, { onClose: vi.fn() });

		const dialog = screen.getByRole('dialog', { name: 'Try Editing' });
		expect(dialog).toBeTruthy();
		expect(screen.getByText('Create a private demo sandbox with sample data.')).toBeTruthy();
		expect(screen.getByText('Full editing access')).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Create My Sandbox' })).toBeTruthy();
	});

	it('submits the sandbox request and redirects to the created org', async () => {
		const onClose = vi.fn();
		const fetchMock = vi.fn(
			async () =>
				new Response(JSON.stringify({ orgId: 'sandbox-org' }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' }
				})
		);
		vi.stubGlobal('fetch', fetchMock);
		const originalLocation = window.location;
		Object.defineProperty(window, 'location', {
			configurable: true,
			value: { href: 'http://localhost/org/source-org' }
		});

		render(DemoSandboxModal, { onClose });

		await fireEvent.click(screen.getByRole('button', { name: 'Create My Sandbox' }));

		await waitFor(() => {
			expect(fetchMock).toHaveBeenCalledWith('/api/create-demo-sandbox', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});
			expect(onClose).toHaveBeenCalledTimes(1);
			expect(window.location.href).toBe('/org/sandbox-org');
		});

		Object.defineProperty(window, 'location', {
			configurable: true,
			value: originalLocation
		});
	});
});
