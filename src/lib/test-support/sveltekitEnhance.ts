import type { ActionResult } from '@sveltejs/kit';

export interface FrameworkPage {
	/** Applies an action's data to the component's `form` prop, like `applyAction` does. */
	applyForm: (data: unknown) => Promise<void>;
	/** Renders the redirect target, like the `goto` that `applyAction` awaits. */
	navigate?: (location: string) => Promise<void>;
	form?: HTMLFormElement;
	location?: string;
	errorPage?: boolean;
}

/**
 * The `update` that SvelteKit 2 passes to a `use:enhance` callback, reduced to its observable effects:
 * a success resets the form, applies `form` and moves focus to the body; a failure applies `form`;
 * an error swaps the document for the error page; a redirect navigates and moves focus to the body.
 */
export function frameworkOutcome(result: ActionResult, page: FrameworkPage) {
	return {
		result,
		update: async ({ reset = true }: { reset?: boolean; invalidateAll?: boolean } = {}) => {
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
			if (result.type === 'success' && reset) page.form?.reset();
			await page.applyForm(result.data ?? null);
			if (result.type === 'success') focusBody();
		}
	};
}

function focusBody() {
	document.body.tabIndex = -1;
	document.body.focus();
}
