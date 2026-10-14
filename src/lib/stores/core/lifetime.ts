// The keyed Organization shell owns one lifetime per user, Organization and session. Work started in a
// lifetime the user has left never settles, so no destroyed caller applies or reports its result.
let lifetime = 0;

export function endOrganizationLifetime(): void {
	lifetime++;
}

export function organizationLifetime(): number {
	return lifetime;
}

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
