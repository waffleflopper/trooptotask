const dialogOpen = () => document.querySelector('[role="alertdialog"], [role="dialog"]') !== null;

/**
 * Focuses `find()` once no modal dialog is mounted. A closing dialog returns focus to its opener, so this runs after
 * that and `find` sees the page as the mutation left it. `find` runs only after the dialog is gone.
 */
export function focusAfterDialogCloses(find: () => HTMLElement | null): void {
	const focus = () => find()?.focus();
	if (!dialogOpen()) {
		queueMicrotask(focus);
		return;
	}
	const observer = new MutationObserver(() => {
		if (dialogOpen()) return;
		observer.disconnect();
		focus();
	});
	observer.observe(document.body, { childList: true, subtree: true });
}
