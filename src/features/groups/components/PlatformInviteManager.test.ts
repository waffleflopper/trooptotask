// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PlatformInviteManager from './PlatformInviteManager.svelte';

afterEach(async () => {
	cleanup();
	await new Promise((resolve) => setTimeout(resolve, 30));
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('PlatformInviteManager', () => {
	it('renders platform invites in the shared app dialog while loading existing invites', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: true,
				json: async () => []
			})
		);

		render(PlatformInviteManager, {
			props: {
				onClose: vi.fn()
			}
		});

		expect(screen.getByRole('dialog', { name: 'Invite Someone to Troop to Task' })).toBeTruthy();
		expect(screen.getByText('Create platform invite links and review existing invite status.')).toBeTruthy();

		await waitFor(() => {
			expect(screen.getByText('No invites created yet')).toBeTruthy();
		});
	});
});
