/**
 * What's New store — controls visibility of the "What's New" changelog modal.
 * Open with `whatsNewStore.show()` (e.g., from the TopHeader menu).
 * Content is defined in `src/lib/data/changelog.ts`.
 */
let showWhatsNew = $state(false);

export const whatsNewStore = {
	get open() {
		return showWhatsNew;
	},
	show() {
		showWhatsNew = true;
	},
	close() {
		showWhatsNew = false;
	}
};
