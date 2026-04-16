export function parseIssueNumber(value: string | undefined, label = 'issue number'): number {
	const trimmed = value?.trim();
	if (!trimmed) {
		throw new Error(`Missing ${label}.`);
	}

	if (!/^\d+$/.test(trimmed)) {
		throw new Error(`Invalid ${label}: ${trimmed}`);
	}

	return Number.parseInt(trimmed, 10);
}

export function parseIssueSetSpec(spec: string): number[] {
	const trimmed = spec.trim();
	if (!trimmed) {
		throw new Error('Missing slice set. Example: /slice-set 568-581 or /slice-set 568-573,575-581');
	}

	const issues: number[] = [];
	for (const token of trimmed.split(',')) {
		const part = token.trim();
		if (!part) {
			continue;
		}

		if (/^\d+$/.test(part)) {
			issues.push(Number.parseInt(part, 10));
			continue;
		}

		const rangeMatch = part.match(/^(\d+)\s*-\s*(\d+)$/);
		if (!rangeMatch) {
			throw new Error(`Invalid slice token: ${part}`);
		}

		const start = Number.parseInt(rangeMatch[1], 10);
		const end = Number.parseInt(rangeMatch[2], 10);
		if (end < start) {
			throw new Error(`Slice range must increase: ${part}`);
		}

		for (let current = start; current <= end; current += 1) {
			issues.push(current);
		}
	}

	const unique = new Set<number>();
	for (const issue of issues) {
		unique.add(issue);
	}

	if (unique.size === 0) {
		throw new Error('No issue numbers found in slice set.');
	}

	return [...unique];
}
