/** The one-day label limit, counted in code points like PostgreSQL char_length. */
export const ONE_DAY_LABEL_LENGTH = 3;

function leading(value: string, count: number): string {
	return [...value].slice(0, count).join('');
}

/** The label a status shows on a one-day bar when none is stored: the name's first three letters or digits. */
export function suggestOneDayLabel(name: string): string {
	const alphanumeric = name.replace(/[^\p{L}\p{N}]/gu, '');
	return leading(leading(alphanumeric, ONE_DAY_LABEL_LENGTH).toUpperCase(), ONE_DAY_LABEL_LENGTH);
}

export function oneDayLabel(status: { readonly name: string; readonly shortLabel: string | null }): string {
	return status.shortLabel ?? suggestOneDayLabel(status.name);
}

/** A typed label as stored: trimmed and uppercased, or null when blank. */
export function normalizeShortLabel(value: string): string | null {
	const trimmed = value.trim();
	return trimmed === '' ? null : trimmed.toUpperCase();
}

export function fitsOneDayLabel(value: string): boolean {
	return [...value].length <= ONE_DAY_LABEL_LENGTH;
}
