import type { ActionResult } from '$app/forms';

export interface FrameworkPage {
	/** Applies an action's data to the component's `form` prop, like `applyAction` does. */
	applyForm: (data: unknown) => Promise<void>;
	/** Renders the redirect target, like the `goto` that `applyAction` awaits. */
	navigate?: (location: string) => Promise<void>;
	/** Reloads page data, like the `invalidateAll` a success awaits. A test can hold or reject it. */
	invalidate?: () => Promise<void>;
	/** The user left the action's page, so a success or failure no longer applies `form`. */
	away?: boolean;
	form?: HTMLFormElement;
	location?: string;
	/** The page the form is on; an action result from another page navigates there unless `navigate` is false. */
	path?: string;
	errorPage?: boolean;
}

/**
 * The `update` that SvelteKit 3 passes to a `use:enhance` callback, reduced to its observable effects:
 * a success resets the form, reloads page data, applies `form` and moves focus to the body; a failure applies
 * `form`; neither applies `form` once the user left the page; an error swaps the document for the error page;
 * a redirect navigates and moves focus to the body.
 */
export function frameworkOutcome(result: ActionResult, page: FrameworkPage) {
	return {
		result,
		update: async ({
			reset = true,
			invalidateAll = true,
			navigate = true
		}: { reset?: boolean; invalidateAll?: boolean; navigate?: boolean } = {}) => {
			if (result.type === 'redirect') {
				page.location = result.location;
				await page.navigate?.(result.location);
				focusBody();
				return;
			}
			if (result.type === 'error') {
				page.errorPage = true;
				const errorPage = document.createElement('h1');
				errorPage.textContent = String(result.status ?? 500);
				document.body.replaceChildren(errorPage);
				return;
			}
			if (navigate && page.path && result.location !== page.path) {
				page.location = result.location;
				await page.navigate?.(result.location);
				return;
			}
			if (result.type === 'success') {
				if (reset) page.form?.reset();
				if (invalidateAll) await page.invalidate?.();
			}
			if (page.away) return;
			await page.applyForm(result.data ?? null);
			if (result.type === 'success') focusBody();
		}
	};
}

function focusBody() {
	document.body.tabIndex = -1;
	document.body.focus();
}

type EnhanceCallback = (outcome: ReturnType<typeof frameworkOutcome>) => Promise<void>;

/** The requests that `simulateEnhance` let through, in order. A submission the handler cancelled is not here. */
export const enhanceRequests: EnhanceCallback[] = [];

/**
 * `use:enhance` for a mocked `$app/forms`: each submit event on the form runs the handler like SvelteKit does
 * and keeps the callback of every submission the handler did not cancel, so a test can hold and release it.
 */
export function simulateEnhance(
	form: HTMLFormElement,
	submit: (input: {
		action: URL;
		formData: FormData;
		formElement: HTMLFormElement;
		controller: AbortController;
		submitter: HTMLElement | null;
		cancel: () => void;
	}) => unknown
) {
	const onSubmit = (event: SubmitEvent) => {
		event.preventDefault();
		let cancelled = false;
		const callback = submit({
			action: new URL(form.action || 'http://localhost/'),
			formData: new FormData(form),
			formElement: form,
			controller: new AbortController(),
			submitter: event.submitter as HTMLElement | null,
			cancel: () => (cancelled = true)
		});
		if (!cancelled && typeof callback === 'function') enhanceRequests.push(callback as EnhanceCallback);
	};
	form.addEventListener('submit', onSubmit);
	return { destroy: () => form.removeEventListener('submit', onSubmit) };
}
