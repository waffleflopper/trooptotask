import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetUserPreferencesPatchStateForTests, queueUserPreferencesPatch } from './userPreferences.client';
import { getDefaultUserOrgPreferences } from './userPreferences';

const { invalidateMock } = vi.hoisted(() => ({
	invalidateMock: vi.fn()
}));

vi.mock('$app/navigation', () => ({
	invalidate: invalidateMock
}));

describe('queueUserPreferencesPatch', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		__resetUserPreferencesPatchStateForTests();
		invalidateMock.mockReset();
		invalidateMock.mockResolvedValue(undefined);
		globalThis.fetch = vi.fn();
	});

	afterEach(() => {
		__resetUserPreferencesPatchStateForTests();
		vi.useRealTimers();
	});

	it('waits for the debounce window before sending a patch', async () => {
		const preferences = getDefaultUserOrgPreferences();
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(preferences)
		} as unknown as Response);

		const request = queueUserPreferencesPatch('org-123', { calendar: { showStatusText: true } });

		await vi.advanceTimersByTimeAsync(349);
		expect(globalThis.fetch).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);

		await expect(request).resolves.toEqual(preferences);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-123/api/user-preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ calendar: { showStatusText: true } })
		});
		expect(invalidateMock).toHaveBeenCalledTimes(1);
		expect(invalidateMock).toHaveBeenCalledWith('app:org-preferences');
	});

	it('coalesces rapid preference updates into one request and keeps the latest values', async () => {
		const preferences = getDefaultUserOrgPreferences();
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: true,
			json: vi.fn().mockResolvedValue(preferences)
		} as unknown as Response);

		const first = queueUserPreferencesPatch('org-123', { calendar: { highlightOnboarding: false } });
		const second = queueUserPreferencesPatch('org-123', { calendar: { highlightOnboarding: true } });
		const third = queueUserPreferencesPatch('org-123', {
			training: { selectedGroupId: 'g-1', matrixViewMode: 'alphabetical' }
		});

		await vi.advanceTimersByTimeAsync(350);

		await expect(Promise.all([first, second, third])).resolves.toEqual([preferences, preferences, preferences]);
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-123/api/user-preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				calendar: { highlightOnboarding: true },
				training: { selectedGroupId: 'g-1', matrixViewMode: 'alphabetical' }
			})
		});
		expect(invalidateMock).toHaveBeenCalledTimes(1);
		expect(invalidateMock).toHaveBeenCalledWith('app:org-preferences');
	});

	it('rejects all queued callers when the debounced patch fails', async () => {
		vi.mocked(globalThis.fetch).mockResolvedValue({
			ok: false,
			json: vi.fn().mockResolvedValue({ message: 'Nope' })
		} as unknown as Response);

		const first = queueUserPreferencesPatch('org-123', { training: { selectedGroupId: 'g-1' } });
		const second = queueUserPreferencesPatch('org-123', { training: { selectedViewId: 'view-1' } });
		const firstResult = first.then(
			() => null,
			(error) => error
		);
		const secondResult = second.then(
			() => null,
			(error) => error
		);

		await vi.advanceTimersByTimeAsync(350);

		await expect(firstResult).resolves.toMatchObject({ message: 'Nope' });
		await expect(secondResult).resolves.toMatchObject({ message: 'Nope' });
		expect(globalThis.fetch).toHaveBeenCalledTimes(1);
		expect(globalThis.fetch).toHaveBeenCalledWith('/org/org-123/api/user-preferences', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				training: {
					selectedGroupId: 'g-1',
					selectedViewId: 'view-1'
				}
			})
		});
		expect(invalidateMock).not.toHaveBeenCalled();
	});
});
