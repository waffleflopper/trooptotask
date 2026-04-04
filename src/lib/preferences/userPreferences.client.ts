import type { UserOrgPreferences, UserOrgPreferencesPatch } from './userPreferences';

const PREFERENCE_PATCH_DEBOUNCE_MS = 350;

interface PatchWaiter {
	resolve: (preferences: UserOrgPreferences) => void;
	reject: (error: Error) => void;
}

interface PendingPatchState {
	patch: UserOrgPreferencesPatch;
	waiters: PatchWaiter[];
	timer: ReturnType<typeof setTimeout> | null;
}

const pendingByOrg = new Map<string, PendingPatchState>();
const requestQueueByOrg = new Map<string, Promise<void>>();

async function sendPatch(orgId: string, patch: UserOrgPreferencesPatch): Promise<UserOrgPreferences> {
	const res = await fetch(`/org/${orgId}/api/user-preferences`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(patch)
	});

	if (!res.ok) {
		let message = 'Failed to save your preferences';
		try {
			const body = (await res.json()) as { message?: string };
			message = body.message ?? message;
		} catch {
			// Leave the fallback message in place.
		}
		throw new Error(message);
	}

	const preferences = (await res.json()) as UserOrgPreferences;
	return preferences;
}

function mergePatch(base: UserOrgPreferencesPatch, incoming: UserOrgPreferencesPatch): UserOrgPreferencesPatch {
	return {
		calendar:
			base.calendar || incoming.calendar
				? {
						...(base.calendar ?? {}),
						...(incoming.calendar ?? {})
					}
				: undefined,
		training:
			base.training || incoming.training
				? {
						...(base.training ?? {}),
						...(incoming.training ?? {})
					}
				: undefined
	};
}

function scheduleFlush(orgId: string): void {
	const pending = pendingByOrg.get(orgId);
	if (!pending) return;

	if (pending.timer) {
		clearTimeout(pending.timer);
	}

	pending.timer = setTimeout(() => {
		void flushPending(orgId);
	}, PREFERENCE_PATCH_DEBOUNCE_MS);
}

function flushPending(orgId: string): Promise<void> {
	const pending = pendingByOrg.get(orgId);
	if (!pending) return Promise.resolve();

	pendingByOrg.delete(orgId);

	const request = async () => {
		try {
			const preferences = await sendPatch(orgId, pending.patch);
			for (const waiter of pending.waiters) {
				waiter.resolve(preferences);
			}
		} catch (error) {
			const err = error instanceof Error ? error : new Error('Failed to save your preferences');
			for (const waiter of pending.waiters) {
				waiter.reject(err);
			}
		}
	};

	const queuedRequest = (requestQueueByOrg.get(orgId) ?? Promise.resolve()).catch(() => undefined).then(request);
	requestQueueByOrg.set(
		orgId,
		queuedRequest.then(
			() => undefined,
			() => undefined
		)
	);

	return queuedRequest;
}

export function queueUserPreferencesPatch(orgId: string, patch: UserOrgPreferencesPatch): Promise<UserOrgPreferences> {
	return new Promise<UserOrgPreferences>((resolve, reject) => {
		const pending = pendingByOrg.get(orgId) ?? {
			patch: {},
			waiters: [],
			timer: null
		};

		pending.patch = mergePatch(pending.patch, patch);
		pending.waiters.push({ resolve, reject });
		pendingByOrg.set(orgId, pending);
		scheduleFlush(orgId);
	});
}

export function __resetUserPreferencesPatchStateForTests(): void {
	for (const pending of pendingByOrg.values()) {
		if (pending.timer) {
			clearTimeout(pending.timer);
		}
	}
	pendingByOrg.clear();
	requestQueueByOrg.clear();
}
