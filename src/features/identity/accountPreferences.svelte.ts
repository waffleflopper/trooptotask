import {
	getDefaultUserOrgPreferences,
	mergeUserOrgPreferences,
	UserOrgPreferencesSchema,
	type UserOrgPreferences,
	type UserOrgPreferencesPatch
} from './accountPreferences';

const PREFERENCE_PATCH_DEBOUNCE_MS = 350;
const SAVE_ERROR = 'Failed to save your preferences';

function mergePatch(base: UserOrgPreferencesPatch, incoming: UserOrgPreferencesPatch): UserOrgPreferencesPatch {
	return {
		calendar:
			base.calendar || incoming.calendar ? { ...(base.calendar ?? {}), ...(incoming.calendar ?? {}) } : undefined,
		training:
			base.training || incoming.training ? { ...(base.training ?? {}), ...(incoming.training ?? {}) } : undefined
	};
}

function confirmsPatch(saved: UserOrgPreferences, patch: UserOrgPreferencesPatch): boolean {
	return Object.entries(patch).every(([section, fields]) =>
		Object.entries(fields ?? {}).every(
			([key, value]) => (saved[section as keyof UserOrgPreferences] as Record<string, unknown>)[key] === value
		)
	);
}

function remainingDirtyFields(dirty: UserOrgPreferencesPatch, sent: UserOrgPreferencesPatch): UserOrgPreferencesPatch {
	const remaining = mergePatch({}, dirty);
	for (const section of ['calendar', 'training'] as const) {
		const fields = remaining[section] as Record<string, unknown> | undefined;
		for (const [key, value] of Object.entries(sent[section] ?? {})) {
			if (fields && fields[key] === value) delete fields[key];
		}
		if (fields && Object.keys(fields).length === 0) delete remaining[section];
	}
	return remaining;
}

/** One account/Organization lifetime. Its layout owner replaces it when that scope changes. */
export class AccountPreferencesState {
	#value = $state<UserOrgPreferences>(getDefaultUserOrgPreferences());
	#dirty: UserOrgPreferencesPatch = {};
	#timer: ReturnType<typeof setTimeout> | null = null;
	#ready = false;
	#saving = false;
	#active = true;
	readonly #scope: { userId: string; orgId: string };
	readonly #onError: (message: string) => void;
	readonly #fetcher: typeof fetch;

	constructor(
		input: { userId: string; orgId: string; preferences: UserOrgPreferences },
		onError: (message: string) => void,
		fetcher: typeof fetch = (...args) => globalThis.fetch(...args)
	) {
		this.#scope = { userId: input.userId, orgId: input.orgId };
		this.#value = mergeUserOrgPreferences(input.preferences, undefined);
		this.#onError = onError;
		this.#fetcher = fetcher;
	}

	get value(): UserOrgPreferences {
		return this.#value;
	}

	patch(patch: UserOrgPreferencesPatch): void {
		if (!this.#active) return;
		this.#dirty = mergePatch(this.#dirty, patch);
		this.#value = mergeUserOrgPreferences(this.#value, patch);
		this.#ready = false;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = setTimeout(() => {
			this.#timer = null;
			this.#ready = true;
			void this.#flush();
		}, PREFERENCE_PATCH_DEBOUNCE_MS);
	}

	dispose(): void {
		this.#active = false;
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
		this.#ready = false;
		this.#dirty = {};
	}

	async #flush(): Promise<void> {
		if (!this.#active || this.#saving || !this.#ready) return;
		this.#ready = false;
		const sent = this.#dirty;
		if (!Object.values(sent).some((fields) => fields && Object.keys(fields).length > 0)) return;
		this.#saving = true;
		try {
			const response = await this.#fetcher(`/org/${this.#scope.orgId}/api/user-preferences`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(sent)
			});
			if (!this.#active) return;
			if (!response.ok) {
				let message = SAVE_ERROR;
				try {
					const body: unknown = await response.json();
					if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string')
						message = body.message;
				} catch {
					// The transport may have no JSON error body.
				}
				throw new Error(message);
			}
			const saved = UserOrgPreferencesSchema.safeParse(await response.json());
			if (!this.#active) return;
			if (!saved.success || !confirmsPatch(saved.data, sent)) throw new Error('Unable to confirm your preference save');
			// Acknowledgments sit underneath all newer or previously failed caller intent.
			this.#dirty = remainingDirtyFields(this.#dirty, sent);
			this.#value = mergeUserOrgPreferences(saved.data, this.#dirty);
		} catch (error) {
			if (this.#active) this.#onError(error instanceof Error ? error.message : SAVE_ERROR);
		} finally {
			this.#saving = false;
			// Only another explicit edit can arm this next save; failures do not retry themselves.
			if (this.#active && this.#ready) void this.#flush();
		}
	}
}
