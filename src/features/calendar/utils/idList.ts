export function sameIdList(a: readonly string[], b: readonly string[]): boolean {
	return a.length === b.length && a.every((id, index) => id === b[index]);
}
