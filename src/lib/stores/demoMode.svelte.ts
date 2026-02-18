// Demo mode store - tracks whether we're in read-only demo mode
// and provides a method to show the sandbox modal

class DemoModeStore {
	#isReadOnly = $state(false);
	#isSandbox = $state(false);
	#showSandboxModal = $state(false);

	get isReadOnly() {
		return this.#isReadOnly;
	}

	get isSandbox() {
		return this.#isSandbox;
	}

	get showSandboxModal() {
		return this.#showSandboxModal;
	}

	load(isDemoReadOnly: boolean, isDemoSandbox: boolean = false) {
		this.#isReadOnly = isDemoReadOnly;
		this.#isSandbox = isDemoSandbox;
	}

	// Call this when user tries to edit in read-only mode
	requestEdit() {
		if (this.#isReadOnly) {
			this.#showSandboxModal = true;
			return true; // Blocked the action
		}
		return false; // Allow the action
	}

	closeSandboxModal() {
		this.#showSandboxModal = false;
	}
}

export const demoModeStore = new DemoModeStore();
