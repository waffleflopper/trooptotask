// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

function expectPendingDraft(message: string) {
	const textbox = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
	expect(textbox.value).toBe(message);
	expect(textbox.disabled).toBe(true);
	expect((screen.getByLabelText('Category') as HTMLButtonElement).disabled).toBe(true);
	const pending = screen.getByRole('button', { name: /Submitting/ }) as HTMLButtonElement;
	expect(pending.getAttribute('aria-disabled')).toBe('true');
	expect(pending.disabled).toBe(false);
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
	it('keeps focus on Submit while sending and sends a second press nowhere', async () => {
		const acknowledgment = deferred<void>();
		const send = vi.fn(async () => {
			await acknowledgment.promise;
			return Response.json({ success: true });
		});
		vi.stubGlobal('fetch', send);
		render(FeedbackModal, { onClose: vi.fn() });
		await fireEvent.input(screen.getByRole('textbox', { name: 'Message' }), { target: { value: 'Needs a label.' } });
		const submitButton = screen.getByRole('button', { name: 'Submit' });
		submitButton.focus();

		await fireEvent.click(submitButton);
		await fireEvent.click(submitButton);

		expect(send).toHaveBeenCalledOnce();
		expect(document.activeElement).toBe(submitButton);
		acknowledgment.resolve();
	});

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
			expect(within(screen.getByRole('dialog')).getByRole('alert').textContent?.trim()).toBe(
				failure === 'transport' ? 'Connection interrupted' : 'Feedback service unavailable'
			);
			expect(toastStore.error).not.toHaveBeenCalled();
			const textbox = screen.getByRole('textbox', { name: 'Message' }) as HTMLTextAreaElement;
			expect(textbox.value).toBe('  Keep my failed draft.  ');
			expect(textbox.disabled).toBe(false);
			expect(document.activeElement).toBe(textbox);
			expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false);
			expect(onClose).not.toHaveBeenCalled();
			expect(toastStore.success).not.toHaveBeenCalled();
			expect(saved).toEqual([]);
			expect(attempts).toBe(1);

			await fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
			expect(screen.queryByRole('alert')).toBeNull();
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

describe('FeedbackModal reporting an error', () => {
	const REFERENCE = 'a0000000-0000-4000-8000-000000190001';

	function sentBody(send: ReturnType<typeof vi.fn>) {
		return JSON.parse(String((send.mock.calls[0] as unknown as [string, RequestInit])[1].body));
	}

	it('opens a bug report with the reference shown read-only and sends it with the message', async () => {
		const send = vi.fn(async (..._args: unknown[]) => Response.json({ success: true, linked: true }));
		vi.stubGlobal('fetch', send);
		const onClose = vi.fn();
		render(FeedbackModal, { onClose, orgId: 'org-1', errorReference: REFERENCE });

		const reference = screen.getByLabelText('Error reference') as HTMLInputElement;
		expect(reference.value).toBe(REFERENCE);
		expect(reference.readOnly).toBe(true);
		expect(screen.getByLabelText('Category').textContent).toContain('Bug Report');
		expect((screen.getByLabelText('Category') as HTMLButtonElement).disabled).toBe(true);

		await fireEvent.input(screen.getByRole('textbox', { name: 'What were you doing?' }), {
			target: { value: 'Saving the roster' }
		});
		await fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

		await waitFor(() => expect(onClose).toHaveBeenCalled());
		expect(sentBody(send)).toMatchObject({ category: 'bug', message: 'Saving the roster', errorReference: REFERENCE });
	});

	it('waits for a report still being sent, holding the same space, then attaches its reference', async () => {
		const stored = deferred<string | null>();
		const send = vi.fn(async (..._args: unknown[]) => Response.json({ success: true, linked: true }));
		vi.stubGlobal('fetch', send);
		render(FeedbackModal, { onClose: vi.fn(), errorReference: stored.promise });

		const reference = screen.getByLabelText('Error reference') as HTMLInputElement;
		expect(reference.value).toBe('Attaching error details...');
		await fireEvent.input(screen.getByRole('textbox', { name: 'What were you doing?' }), {
			target: { value: 'Opening the calendar' }
		});
		expect((screen.getByRole('button', { name: 'Submit' }) as HTMLButtonElement).disabled).toBe(true);

		await act(() => stored.resolve(REFERENCE));

		await waitFor(() => expect(reference.value).toBe(REFERENCE));
		await fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(sentBody(send)).toMatchObject({ errorReference: REFERENCE });
	});

	it('sends a plain bug report when the pending report ends without a reference', async () => {
		const stored = deferred<string | null>();
		const send = vi.fn(async (..._args: unknown[]) => Response.json({ success: true, linked: false }));
		vi.stubGlobal('fetch', send);
		render(FeedbackModal, { onClose: vi.fn(), errorReference: stored.promise });
		await fireEvent.input(screen.getByRole('textbox', { name: 'What were you doing?' }), {
			target: { value: 'Opening the calendar' }
		});

		await act(() => stored.resolve(null));

		await waitFor(() =>
			expect((screen.getByLabelText('Error reference') as HTMLInputElement).value).toBe(
				'No error details could be attached'
			)
		);
		await fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
		await waitFor(() => expect(send).toHaveBeenCalledOnce());
		expect(sentBody(send).errorReference).toBeUndefined();
		expect(sentBody(send).category).toBe('bug');
	});

	it('stays an ordinary feedback form without an error reference', () => {
		render(FeedbackModal, { onClose: vi.fn() });

		expect(screen.queryByLabelText('Error reference')).toBeNull();
		expect(screen.getByRole('textbox', { name: 'Message' })).toBeTruthy();
		expect((screen.getByLabelText('Category') as HTMLButtonElement).disabled).toBe(false);
	});
});
