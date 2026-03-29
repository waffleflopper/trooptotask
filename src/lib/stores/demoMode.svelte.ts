/**
 * Demo mode store — tracks read-only demo and sandbox states.
 *
 * Two modes:
 * - `isReadOnly`: the org is in demo/read-only mode. Calling `requestEdit()` shows the
 *   sandbox upgrade modal and returns `true` to signal the caller should abort the action.
 * - `isSandbox`: the org is a sandbox (all permissions granted but data resets). No
 *   modal is shown; `hasBanner` drives a banner telling the user it's a sandbox.
 *
 * `hasBanner` is true in either mode. Load via `demoModeStore.load(isDemoReadOnly, isDemoSandbox)`.
 */
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

	get hasBanner() {
		return this.#isReadOnly || this.#isSandbox;
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
