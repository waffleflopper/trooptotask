export async function settles(promise: Promise<unknown>): Promise<boolean> {
	const unsettled = Symbol('unsettled');
	const outcome = await Promise.race([
		promise.then(
			() => true,
			() => true
		),
		new Promise((resolve) => setTimeout(() => resolve(unsettled), 0))
	]);
	return outcome !== unsettled;
}
