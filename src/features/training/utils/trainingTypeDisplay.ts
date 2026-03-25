import type { TrainingType } from '$features/training/training.types';

export type ExpirationMode = 'fixed' | 'never' | 'date-only';

export function getExpirationMode(type: TrainingType): ExpirationMode {
	if (type.expirationDateOnly) return 'date-only';
	if (type.expirationMonths !== null) return 'fixed';
	return 'never';
}

export function formatApplicability(type: TrainingType): string {
	if (type.isOptional) return 'Optional (tracked only)';

	const parts: string[] = [];

	if (type.appliesToRoles.length > 0) parts.push(type.appliesToRoles.join(', '));
	if (type.appliesToMos.length > 0) parts.push(`MOS: ${type.appliesToMos.join(', ')}`);
	if (type.appliesToRanks.length > 0) parts.push(`Ranks: ${type.appliesToRanks.join(', ')}`);

	const exclusionCount = type.excludedRoles.length + type.excludedMos.length + type.excludedRanks.length;

	if (parts.length === 0) {
		const base = 'Everyone';
		if (exclusionCount === 0) return base;
		return `${base} (${exclusionCount} exclusion${exclusionCount > 1 ? 's' : ''})`;
	}

	return parts.join(', ');
}

export function getTypeSummaryLine(type: TrainingType): string {
	const mode = getExpirationMode(type);
	let expiration: string;
	switch (mode) {
		case 'fixed':
			expiration = `${type.expirationMonths}mo`;
			break;
		case 'never':
			expiration = 'Never expires';
			break;
		case 'date-only':
			expiration = 'Date varies';
			break;
	}
	return `${expiration} | ${formatApplicability(type)}`;
}

export function toExpirationFields(
	mode: ExpirationMode,
	months: number | null
): Pick<TrainingType, 'expirationMonths' | 'expirationDateOnly'> {
	switch (mode) {
		case 'fixed':
			return { expirationMonths: months, expirationDateOnly: false };
		case 'never':
			return { expirationMonths: null, expirationDateOnly: false };
		case 'date-only':
			return { expirationMonths: null, expirationDateOnly: true };
	}
}
