// The keyed Organization shell owns one lifetime per user, Organization and session. Work started in a
// lifetime the user has left never settles, so no destroyed caller applies or reports its result.
let lifetime = $state(0);
const writeConfirmedListeners = new Set<() => void>();

export function endOrganizationLifetime(): void {
	lifetime++;
}

export function organizationLifetime(): number {
	return lifetime;
}

/** Reactive: an effect or template that reads the returned check re-runs when the lifetime ends. */
export function stillInOrganizationLifetime(): () => boolean {
	const started = lifetime;
	return () => started === lifetime;
}

export function withinOrganizationLifetime<R>(work: Promise<R>, isCurrent: () => boolean = () => true): Promise<R> {
	const sameLifetime = stillInOrganizationLifetime();
	const current = () => sameLifetime() && isCurrent();
	return new Promise((resolve, reject) => {
		work.then(
			(value) => current() && resolve(value),
			(error) => current() && reject(error)
		);
	});
}

/**
 * Like `withinOrganizationLifetime`, for a write. When the user has left the lifetime before the write settles,
 * the old caller still hears nothing, but a write the reply confirms tells the listeners, so the user's new
 * Organization can say the earlier change was saved. A failed or unconfirmed write stays silent.
 */
export function withinOrganizationWrite<R>(
	work: Promise<R>,
	{
		isCurrent = () => true,
		confirmed = () => true
	}: { isCurrent?: () => boolean; confirmed?: (value: R) => boolean } = {}
): Promise<R> {
	const sameLifetime = stillInOrganizationLifetime();
	work.then(
		(value) => {
			if (!sameLifetime() && confirmed(value)) for (const listener of writeConfirmedListeners) listener();
		},
		() => {}
	);
	return withinOrganizationLifetime(work, isCurrent);
}

/** Hears each write confirmed after the user left the lifetime that sent it. Returns the unsubscribe. */
export function onWriteConfirmedAfterLifetime(listener: () => void): () => void {
	writeConfirmedListeners.add(listener);
	return () => writeConfirmedListeners.delete(listener);
}
