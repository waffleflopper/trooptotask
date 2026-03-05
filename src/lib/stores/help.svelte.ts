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
