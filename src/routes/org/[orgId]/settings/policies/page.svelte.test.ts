// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { tick, type ComponentProps } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Page from './+page.svelte';

const feedback = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: feedback }));

function data(orgId: string, months = 36, days = 180, goal = 90) {
	return {
		orgId,
		orgUrlSegment: `slug-${orgId}`,
		policiesSettings: {
			sections: {
				policies: {
					archiveRetention: { savedMonths: months, constraints: { min: 1, max: 120, unit: 'months' } },
					lossWarning: { savedDays: days, constraints: { min: 1, max: 365, unit: 'days' } },
					trainingReadinessGoal: { savedPercent: goal, constraints: { min: 1, max: 100, unit: 'percent' } },
					canUpdateRetention: true
				}
			}
		}
	} as unknown as ComponentProps<typeof Page>['data'];
}

function deferredResponse() {
	let resolve!: (response: Response) => void;
	const promise = new Promise<Response>((done) => (resolve = done));
	const request = vi.fn((_url: string, _init: RequestInit) => promise);
	vi.stubGlobal('fetch', request);
	return { resolve, request };
}

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});

describe('Organization policy saves', () => {
	it('keeps a newer A save pending when the disposed A request completes', async () => {
		let firstDone!: (response: Response) => void;
		let secondDone!: (response: Response) => void;
		const first = new Promise<Response>((resolve) => (firstDone = resolve));
		const second = new Promise<Response>((resolve) => (secondDone = resolve));
		const request = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
		vi.stubGlobal('fetch', request);
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
		await fireEvent.input(screen.getByLabelText('Retention period (months)'), { target: { value: '48' } });
		await fireEvent.click(within(screen.getByRole('region', { name: 'Archive Retention' })).getByRole('button'));
		await view.rerender({ data: data('b') });
		await view.rerender({ data: data('a', 48) });
		await fireEvent.input(screen.getByLabelText('Retention period (months)'), { target: { value: '49' } });
		await fireEvent.click(within(screen.getByRole('region', { name: 'Archive Retention' })).getByRole('button'));
		firstDone(new Response(null, { status: 200 }));
		await first;
		await tick();
		expect(screen.getByRole('button', { name: /Saving/ })).toBeTruthy();
		expect(feedback.success).not.toHaveBeenCalled();
		secondDone(new Response(null, { status: 200 }));
		await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
		expect(screen.queryByText('Unsaved changes')).toBeNull();
	});

	it.each([
		['Retention period (months)', 'Archive Retention', 48.6, '49'],
		['Warning lead time (days)', 'Loss Warning Window', 30.4, '30']
	] as const)('acknowledges the committed whole number for %s', async (label, region, submitted, committed) => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
		render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
		await fireEvent.input(screen.getByLabelText(label), { target: { value: String(submitted) } });
		await fireEvent.click(within(screen.getByRole('region', { name: region })).getByRole('button'));
		await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
		expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(committed);
		expect(screen.queryByText('Unsaved changes')).toBeNull();
	});
	it.each([
		['Retention period (months)', 'Archive Retention', 200],
		['Retention period (months)', 'Archive Retention', 503],
		['Warning lead time (days)', 'Loss Warning Window', 200],
		['Warning lead time (days)', 'Loss Warning Window', 503],
		['Training readiness goal (%)', 'Training Readiness', 200],
		['Training readiness goal (%)', 'Training Readiness', 503]
	] as const)('discards pending A %s feedback after switching A → B → A (%i)', async (label, region, status) => {
		const pending = deferredResponse();
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
		await fireEvent.input(screen.getByLabelText(label), { target: { value: '49' } });
		await fireEvent.click(within(screen.getByRole('region', { name: region })).getByRole('button'));
		expect(pending.request).toHaveBeenCalledWith('/org/slug-a/api/organization/settings', expect.any(Object));

		await view.rerender({ data: data('b') });
		const original = {
			'Retention period (months)': '36',
			'Warning lead time (days)': '180',
			'Training readiness goal (%)': '90'
		}[label];
		expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(original);
		expect(screen.queryByRole('button', { name: /Saving/ })).toBeNull();
		expect(screen.queryByText('Unsaved changes')).toBeNull();

		// Returning to A creates a new workspace even when defaults are equal.
		await view.rerender({
			data: data(
				'a',
				label === 'Retention period (months)' && status === 200 ? 49 : 36,
				label === 'Warning lead time (days)' && status === 200 ? 49 : 180,
				label === 'Training readiness goal (%)' && status === 200 ? 49 : 90
			)
		});
		pending.resolve(new Response(null, { status }));
		await pending.request.mock.results[0].value;
		await tick();
		expect(screen.queryByRole('button', { name: /Saving/ })).toBeNull();
		expect(feedback.success).not.toHaveBeenCalled();
		expect(feedback.error).not.toHaveBeenCalled();
		expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe(status === 200 ? '49' : original);
	});

	it('resets unsaved warning drafts on a switch with equal defaults', async () => {
		const view = render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
		await fireEvent.input(screen.getByLabelText('Warning lead time (days)'), { target: { value: '30' } });
		await view.rerender({ data: data('b') });
		expect((screen.getByLabelText('Warning lead time (days)') as HTMLInputElement).value).toBe('180');
		expect(screen.queryByText('Unsaved changes')).toBeNull();
	});

	it.each([
		['Retention period (months)', 'Archive Retention', 'archiveRetentionMonths', 48, 49],
		['Warning lead time (days)', 'Loss Warning Window', 'lossWarningWindowDays', 30, 31],
		['Training readiness goal (%)', 'Training Readiness', 'trainingReadinessGoalPercent', 85, 86]
	] as const)('keeps edits made during a %s save unsaved', async (label, region, field, submitted, edited) => {
		const pending = deferredResponse();
		render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
		const input = screen.getByLabelText(label);
		await fireEvent.input(input, { target: { value: String(submitted) } });
		await fireEvent.click(within(screen.getByRole('region', { name: region })).getByRole('button'));
		expect(JSON.parse(pending.request.mock.calls[0][1].body as string)).toEqual({ [field]: submitted });
		await fireEvent.input(input, { target: { value: String(edited) } });
		pending.resolve(new Response(null, { status: 200 }));
		await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
		const section = within(screen.getByRole('region', { name: region }));
		expect((input as HTMLInputElement).value).toBe(String(edited));
		expect(section.getByText('Unsaved changes')).toBeTruthy();
		expect(section.getByRole('button', { name: `Save ${region}` }).getAttribute('aria-disabled')).toBeNull();
	});

	it.each([
		['Retention period (months)', 'Archive Retention'],
		['Warning lead time (days)', 'Loss Warning Window'],
		['Training readiness goal (%)', 'Training Readiness']
	] as const)('keeps focus on Save %s while it saves and after it saves', async (label, region) => {
		const pending = deferredResponse();
		render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
		await fireEvent.input(screen.getByLabelText(label), { target: { value: '49' } });
		const save = within(screen.getByRole('region', { name: region })).getByRole('button') as HTMLButtonElement;
		save.focus();

		await fireEvent.click(save);
		await fireEvent.click(save);

		expect(pending.request).toHaveBeenCalledOnce();
		expect(save.disabled).toBe(false);
		expect(save.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(save);

		pending.resolve(new Response(null, { status: 200 }));
		await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
		expect(save.disabled).toBe(false);
		expect(save.getAttribute('aria-disabled')).toBe('true');
		expect(document.activeElement).toBe(save);
	});

	it('rejects an invalid readiness goal with a linked field error before saving', async () => {
		const request = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', request);
		render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
		const input = screen.getByLabelText('Training readiness goal (%)');
		const section = within(screen.getByRole('region', { name: 'Training Readiness' }));
		for (const value of ['', '0', '101', '90.5']) {
			await fireEvent.input(input, { target: { value } });
			expect(input.getAttribute('aria-invalid')).toBe('true');
			const describedBy = input.getAttribute('aria-describedby')!.split(' ');
			expect(describedBy.map((id) => document.getElementById(id)?.textContent?.trim())).toContain(
				section.getByRole('alert').textContent?.trim()
			);
			const save = section.getByRole('button', { name: 'Save Training Readiness' });
			expect(save.getAttribute('aria-disabled')).toBe('true');
			await fireEvent.click(save);
		}
		expect(request).not.toHaveBeenCalled();

		await fireEvent.input(input, { target: { value: '85' } });
		expect(input.getAttribute('aria-invalid')).toBeNull();
		expect(section.queryByRole('alert')).toBeNull();
		await fireEvent.click(section.getByRole('button', { name: 'Save Training Readiness' }));
		await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
		expect(JSON.parse(request.mock.calls[0][1].body as string)).toEqual({ trainingReadinessGoalPercent: 85 });
		expect(section.getByText('Saved')).toBeTruthy();
	});

	it('retains a failed draft for an explicit successful retry', async () => {
		const request = vi
			.fn()
			.mockResolvedValueOnce(new Response(null, { status: 503 }))
			.mockResolvedValueOnce(new Response(null, { status: 200 }));
		vi.stubGlobal('fetch', request);
		render(Page, { data: data('a'), form: null, params: { orgId: 'slug-a' } });
		await fireEvent.input(screen.getByLabelText('Retention period (months)'), { target: { value: '48' } });
		const section = within(screen.getByRole('region', { name: 'Archive Retention' }));
		await fireEvent.click(section.getByRole('button', { name: 'Save Archive Retention' }));
		await waitFor(() =>
			expect(section.getByRole('alert').textContent?.trim()).toBe('Failed to save retention policy. Try again.')
		);
		expect(feedback.error).not.toHaveBeenCalled();
		expect((screen.getByLabelText('Retention period (months)') as HTMLInputElement).value).toBe('48');
		expect(section.getByText('Unsaved changes')).toBeTruthy();
		await fireEvent.click(section.getByRole('button', { name: 'Save Archive Retention' }));
		expect(section.queryByRole('alert')).toBeNull();
		await waitFor(() => expect(feedback.success).toHaveBeenCalledOnce());
		expect(section.getByText('Saved')).toBeTruthy();
		expect(request).toHaveBeenCalledTimes(2);
	});
});
