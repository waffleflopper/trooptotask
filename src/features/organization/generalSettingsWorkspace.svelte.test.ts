import { describe, expect, it, vi } from 'vitest';
import { GeneralSettingsWorkspace } from './generalSettingsWorkspace.svelte';

// A controlled microtask establishes disposal between confirmation and post-tick submission.
describe('General settings reset submission lifetime', () => {
	it('does not submit a reset after its workspace is disposed before the form tick completes', async () => {
		const workspace = new GeneralSettingsWorkspace(() => null);
		const requestSubmit = vi.fn();
		workspace.requestSlugClear();
		const pending = workspace.confirmSlugAction({ requestSubmit } as unknown as HTMLFormElement);
		workspace.dispose();
		await pending;
		expect(requestSubmit).not.toHaveBeenCalled();
	});
});
