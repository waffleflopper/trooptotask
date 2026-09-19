import { fail } from '$lib/server/core/errors';
import type { WritePorts } from '$lib/server/core/ports';
import { sanitizeString } from '$lib/server/validation';
import { loadOrganizationRankCatalog } from './rankCatalog';

type RankCatalogPorts = Pick<WritePorts, 'auth' | 'store' | 'rawStore' | 'audit'>;

export const UNKNOWN_PERSONNEL_RANK_MESSAGE =
	'Unknown rank "{rank}". Update the Organization rank catalog in Organization Settings -> Ranks, then try again.';

export interface PersonnelRankResolver {
	normalize(input: string): string | null;
	errorMessage(input: string): string;
}

export async function normalizeActivePersonnelRank(ports: RankCatalogPorts, input: string): Promise<string> {
	const rank = sanitizeString(input, 80);
	const resolver = await createActivePersonnelRankResolver(ports);
	const match = resolver.normalize(rank);

	if (!match) {
		fail(400, resolver.errorMessage(rank));
	}

	return match;
}

export async function createActivePersonnelRankResolver(ports: RankCatalogPorts): Promise<PersonnelRankResolver> {
	const catalog = await loadOrganizationRankCatalog(ports);
	const activeEntries = catalog.filter((entry) => entry.state === 'active');

	return {
		normalize(input) {
			return resolveRankCode(sanitizeString(input, 80), activeEntries);
		},
		errorMessage(input) {
			const rank = sanitizeString(input, 80);
			const retiredMatch = resolveRankCode(
				rank,
				catalog.filter((entry) => entry.state === 'retired')
			);
			return retiredMatch ? retiredPersonnelRankMessage(retiredMatch) : unknownPersonnelRankMessage(rank);
		}
	};
}

export async function createPersonnelCatalogRankResolver(ports: RankCatalogPorts): Promise<PersonnelRankResolver> {
	const catalog = await loadOrganizationRankCatalog(ports);

	return {
		normalize(input) {
			return resolveRankCode(sanitizeString(input, 80), catalog);
		},
		errorMessage(input) {
			return unknownPersonnelRankMessage(sanitizeString(input, 80));
		}
	};
}

export function unknownPersonnelRankMessage(rank: string): string {
	return UNKNOWN_PERSONNEL_RANK_MESSAGE.replace('{rank}', rank);
}

function retiredPersonnelRankMessage(rank: string): string {
	return `Rank "${rank}" is retired. Reactivate it in the Organization rank catalog before using it for Personnel create, edit, or import.`;
}

function resolveRankCode(input: string, entries: Array<{ code: string }>): string | null {
	const exactMatch = entries.find((entry) => entry.code === input);
	if (exactMatch) return exactMatch.code;

	const normalizedInput = input.toUpperCase();
	const normalizedMatches = entries.filter((entry) => entry.code.toUpperCase() === normalizedInput);

	return normalizedMatches.length === 1 ? normalizedMatches[0].code : null;
}
