/**
 * Help store — tracks the currently open help topic.
 *
 * `activeTopic` is a string key (e.g., `'calendar'`, `'training'`) that maps to a
 * section in the help panel. Set via `helpStore.open(topic)` — typically called from
 * `HelpButton.svelte` in the route toolbar. Cleared on close.
 */
class HelpStore {
	activeTopic = $state<string | null>(null);

	open(topic: string) {
		this.activeTopic = topic;
	}

	close() {
		this.activeTopic = null;
	}
}

export const helpStore = new HelpStore();
