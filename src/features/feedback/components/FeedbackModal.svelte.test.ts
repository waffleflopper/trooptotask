// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toastStore } from '$lib/stores/toast.svelte';
import FeedbackModal from './FeedbackModal.svelte';

function deferred<T>() {
	let resolve!: (value: T) => void;
	let reject!: (reason: unknown) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

async function submit(message: string) {
	await fireEvent.input(screen.getByRole('textbox', { name: 'Message' }), { target: { value: message } });
	await fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
}

// happy-dom does not apply a disabled fieldset to its controls' :disabled state.
const inDisabledGroup = (control: HTMLElement) => control.closest('fieldset')?.disabled === true;

function expectPendingDraft(message: string) {
	const textbox = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
	expect(textbox.value).toBe(message);
	expect(inDisabledGroup(textbox)).toBe(true);
	expect(inDisabledGroup(screen.getByLabelText('Category'))).toBe(true);
	expect((screen.getByRole('button', { name: /Submitting/ }) as HTMLButtonElement).disabled).toBe(true);
	expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
}

beforeEach(() => {
	vi.spyOn(toastStore, 'success').mockReturnValue('success-toast');
	vi.spyOn(toastStore, 'error').mockReturnValue('error-toast');
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('FeedbackModal submission lifetime', () => {
	it('waits for the current submission to be stored before reporting success and closing', async () => {
		const acknowledgment = deferred<void>();
		const saved: unknown[] = [];
		vi.stubGlobal(
			'fetch',
			vi.fn(async (_url: string, init: RequestInit) => {
				await acknowledgment.promise;
				saved.push(JSON.parse(init.body as string));
				return Response.json({ success: true, githubIssue: 42 });
			})
		);
		const onClose = vi.fn();
		render(FeedbackModal, { onClose, orgId: 'org-a', orgName: 'Alpha', pageUrl: '/org/alpha/home' });
		await submit('  Calendar needs a clearer label.  ');
		expectPendingDraft('  Calendar needs a clearer label.  ');
		expect(saved).toEqual([]);
		expect(toastStore.success).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();

		acknowledgment.resolve();
		await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
		expect(saved).toEqual([
			{
				category: 'general',
				message: 'Calendar needs a clearer label.',
				pageUrl: '/org/alpha/home',
				organizationId: 'org-a',
				organizationName: 'Alpha'
			}
		]);
		expect(toastStore.success).toHaveBeenCalledTimes(1);
		expect(toastStore.error).not.toHaveBeenCalled();
	});

	it.each(['HTTP', 'transport'])(
		'retains the draft after an active %s failure and saves only on explicit retry',
		async (failure) => {
			const saved: unknown[] = [];
			let attempts = 0;
			vi.stubGlobal(
				'fetch',
				vi.fn(async (_url: string, init: RequestInit) => {
					attempts += 1;
					if (attempts === 1) {
						if (failure === 'transport') throw new Error('Connection interrupted');
						return Response.json({ message: 'Feedback service unavailable' }, { status: 503 });
					}
					saved.push(JSON.parse(init.body as string));
					return Response.json({ success: true });
				})
			);
			const onClose = vi.fn();
			render(FeedbackModal, { onClose, orgId: 'org-a' });
			await submit('  Keep my failed draft.  ');
			await waitFor(() =>
				expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(false)
			);
			expect(toastStore.error).toHaveBeenCalledWith(
				failure === 'transport' ? 'Connection interrupted' : 'Feedback service unavailable'
			);
			expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe(
				'  Keep my failed draft.  '
			);
			expect(inDisabledGroup(screen.getByRole('textbox', { name: 'Message' }))).toBe(false);
			expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false);
			expect(onClose).not.toHaveBeenCalled();
			expect(toastStore.success).not.toHaveBeenCalled();
			expect(saved).toEqual([]);
			expect(attempts).toBe(1);

			await fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
			await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
			expect(saved).toEqual([{ category: 'general', message: 'Keep my failed draft.', organizationId: 'org-a' }]);
			expect(toastStore.success).toHaveBeenCalledTimes(1);
		}
	);

	it.each(['success', 'HTTP error', 'transport rejection'])(
		'ignores late %s after unmount without affecting a replacement modal',
		async (result) => {
			const oldResponse = deferred<Response>();
			const currentResponse = deferred<Response>();
			vi.stubGlobal(
				'fetch',
				vi.fn().mockReturnValueOnce(oldResponse.promise).mockReturnValueOnce(currentResponse.promise)
			);
			const oldClose = vi.fn();
			const oldView = render(FeedbackModal, { onClose: oldClose, orgId: 'org-a' });
			await submit('Alpha draft');
			oldView.unmount();
			const currentClose = vi.fn();
			render(FeedbackModal, { onClose: currentClose, orgId: 'org-b' });
			await submit('Bravo draft');

			await act(async () => {
				if (result === 'transport rejection') oldResponse.reject(new Error('Old account connection failed'));
				else
					oldResponse.resolve(
						result === 'success'
							? Response.json({ success: true })
							: Response.json({ message: 'Old account failure' }, { status: 503 })
					);
				await oldResponse.promise.catch(() => undefined);
			});
			expect(toastStore.success).not.toHaveBeenCalled();
			expect(toastStore.error).not.toHaveBeenCalled();
			expect(oldClose).not.toHaveBeenCalled();
			expect(currentClose).not.toHaveBeenCalled();
			expectPendingDraft('Bravo draft');

			currentResponse.resolve(Response.json({ success: true }));
			await waitFor(() => expect(currentClose).toHaveBeenCalledTimes(1));
			expect(toastStore.success).toHaveBeenCalledTimes(1);
			expect(toastStore.error).not.toHaveBeenCalled();
		}
	);

	it.each(['parsed error', 'invalid JSON'])('ignores an in-flight %s continuation after unmount', async (result) => {
		const errorBody = deferred<{ message: string }>();
		const parsingStarted = deferred<void>();
		vi.stubGlobal(
			'fetch',
			vi.fn().mockResolvedValue({
				ok: false,
				json: () => {
					parsingStarted.resolve();
					return errorBody.promise;
				}
			})
		);
		const onClose = vi.fn();
		const view = render(FeedbackModal, { onClose, orgId: 'org-a' });
		await submit('Alpha draft');
		await parsingStarted.promise;
		view.unmount();
		render(FeedbackModal, { onClose: vi.fn(), orgId: 'org-b' });
		await fireEvent.input(screen.getByRole('textbox', { name: 'Message' }), {
			target: { value: 'Untouched Bravo draft' }
		});

		await act(async () => {
			if (result === 'parsed error') errorBody.resolve({ message: 'Old parsed failure' });
			else errorBody.reject(new SyntaxError('Old response was malformed'));
			await errorBody.promise.catch(() => undefined);
		});
		expect(toastStore.success).not.toHaveBeenCalled();
		expect(toastStore.error).not.toHaveBeenCalled();
		expect(onClose).not.toHaveBeenCalled();
		expect((screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement).value).toBe(
			'Untouched Bravo draft'
		);
		expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(false);
	});
});
