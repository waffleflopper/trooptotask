import type { DataStore } from '$lib/server/core/ports';

interface PersonnelSlugInput {
	lastName: string;
	firstName: string;
}

interface UniquePersonnelSlugInput extends PersonnelSlugInput {
	store: DataStore;
	orgId: string;
	excludePersonnelId?: string;
}

function toSlugPart(value: string): string {
	return value
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function buildPersonnelSlugBase(input: PersonnelSlugInput): string {
	const last = toSlugPart(input.lastName);
	const first = toSlugPart(input.firstName);
	return [last, first].filter(Boolean).join('-') || 'personnel';
}

export function buildAvailablePersonnelSlug(base: string, used: Set<string>): string {
	if (!used.has(base)) return base;

	let suffix = 2;
	while (used.has(`${base}-${suffix}`)) {
		suffix += 1;
	}
	return `${base}-${suffix}`;
}

export async function buildUniquePersonnelSlug(input: UniquePersonnelSlugInput): Promise<string> {
	const base = buildPersonnelSlugBase(input);
	const rows = await input.store.findMany<{ id: string; slug: string | null }>('personnel', input.orgId, undefined, {
		select: 'id, slug',
		ilikeFilters: { slug: `${base}%` }
	});
	const used = new Set(
		rows
			.filter((row) => !input.excludePersonnelId || row.id !== input.excludePersonnelId)
			.map((row) => row.slug)
			.filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
	);

	return buildAvailablePersonnelSlug(base, used);
}
