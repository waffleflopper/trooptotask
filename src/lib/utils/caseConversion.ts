/** Convert snake_case keys to camelCase */
export function toCamelCase<T>(obj: Record<string, unknown>): T {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
		result[camelKey] = value;
	}
	return result as T;
}

/** Convert camelCase keys to snake_case */
export function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
		result[snakeKey] = value;
	}
	return result;
}

/** Convert an array of snake_case objects to camelCase */
export function toCamelCaseArray<T>(arr: Record<string, unknown>[]): T[] {
	return arr.map((item) => toCamelCase<T>(item));
}
