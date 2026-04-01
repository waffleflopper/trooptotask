import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queueUserPreferencesPatch } from './userPreferences.client';
import { getDefaultUserOrgPreferences } from './userPreferences';

const { invalidateMock } = vi.hoisted(() => ({
	invalidateMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	invalidate: invalidateMock
}));

describe('queueUserPreferencesPatch', () => {
	beforeEach(() => {
		invalidateMock.mockReset();
		globalThis.fetch = vi.fn();
	});

	it('invalidates org shell data after a successful patch', async () => {
		const preferences = getDefaultUserOrgPreferences();
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(preferences)
		} as unknown as Response);
		invalidateMock.mockResolvedValue(undefined);

		await expect(
			queueUserPreferencesPatch('org-123', { calendar: { showStatusText: true } })
		).resolves.toEqual(
			preferences
		);

		expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-123/api/user-preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ calendar: { showStatusText: true } })
		});
		expect(invalidateMock).toHaveBeenCalledWith('app:org-core');
	});

	it('does not invalidate org shell data when the patch fails', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: false,
			json: vi.fn().mockResolvedValue({ message: 'Nope' })
		} as unknown as Response);

		await expect(queueUserPreferencesPatch('org-123', { training: { selectedGroupId: 'g-1' } })).rejects.toThrow(
			'Nope'
		);

		expect(invalidateMock).not.toHaveBeenCalled();
	});
});
