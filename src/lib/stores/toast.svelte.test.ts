import { beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'svelte-sonner';
import { toastStore } from './toast.svelte';

vi.mock('svelte-sonner', () => ({
	toast: {
		success: vi.fn(() => 'success-id'),
		error: vi.fn(() => 'error-id'),
		warning: vi.fn(() => 'warning-id'),
		info: vi.fn(() => 'info-id'),
		dismiss: vi.fn((id?: string | number) => id)
	}
}));

describe('toastStore', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('maps success, warning, info, and error calls to sonner with existing durations', () => {
		expect(toastStore.success('Saved')).toBe('success-id');
		expect(toast.success).toHaveBeenCalledWith('Saved', { duration: 4000, action: undefined });

		expect(toastStore.warning('Check this')).toBe('warning-id');
		expect(toast.warning).toHaveBeenCalledWith('Check this', { duration: 4000, action: undefined });

		expect(toastStore.info('Heads up')).toBe('info-id');
		expect(toast.info).toHaveBeenCalledWith('Heads up', { duration: 4000, action: undefined });

		expect(toastStore.error('Failed')).toBe('error-id');
		expect(toast.error).toHaveBeenCalledWith('Failed', { duration: 6000, action: undefined });
	});

	it('preserves custom duration, action, and manual dismissal behavior', () => {
		const action = { label: 'Undo', onClick: vi.fn() };

		expect(toastStore.success('Archived', 9000, action)).toBe('success-id');
		expect(toast.success).toHaveBeenCalledWith('Archived', { duration: 9000, action });

		expect(toastStore.dismiss('success-id')).toBe('success-id');
		expect(toast.dismiss).toHaveBeenCalledWith('success-id');
	});
});
