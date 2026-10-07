import type { PersonnelRecordPersistence } from './contracts';

interface PersonnelSlugInput {
	lastName: string;
	firstName: string;
}

interface UniquePersonnelSlugInput extends PersonnelSlugInput {
	organizationPersonnel: Pick<PersonnelRecordPersistence, 'listSlugCandidates'>;
	excludePersonnelId?: string;
	rejectedSlugs?: ReadonlySet<string>;
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
	const rows = await input.organizationPersonnel.listSlugCandidates(base);
	const used = new Set(
		rows
			.filter((row) => !input.excludePersonnelId || row.id !== input.excludePersonnelId)
			.map((row) => row.slug)
			.filter((slug): slug is string => typeof slug === 'string' && slug.length > 0)
	);
	// A unique-constraint rejection reserves a candidate even when request-user
	// reads cannot see the Person that owns it in another Group.
	for (const slug of input.rejectedSlugs ?? []) used.add(slug);

	return buildAvailablePersonnelSlug(base, used);
}

export function isPersonnelSlugUniqueConstraintError(error: unknown): boolean {
	const maybeError = error as { code?: unknown; message?: unknown; details?: unknown; constraint?: unknown };
	const haystack = [maybeError.code, maybeError.message, maybeError.details, maybeError.constraint]
		.filter((value): value is string => typeof value === 'string')
		.join(' ')
		.toLowerCase();

	return (
		haystack.includes('personnel_org_slug_key') || (haystack.includes('duplicate key') && haystack.includes('slug'))
	);
}

/** A named constraint can be confirmed even when the provider conceals its key values. */
export function isRedactedPersonnelSlugConstraintError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const conflict = error as { code?: unknown; message?: unknown; details?: unknown };
	return (
		conflict.code === '23505' &&
		typeof conflict.message === 'string' &&
		conflict.message.includes('"personnel_org_slug_key"') &&
		(conflict.details === undefined || conflict.details === null || conflict.details === '')
	);
}

/** Retry only the submitted candidate rejected by this Organization's slug index. */
export function conflictingPersonnelSlug(
	error: unknown,
	orgId: string,
	candidates: ReadonlySet<string>
): string | null {
	if (typeof error !== 'object' || error === null) return null;
	const conflict = error as { code?: unknown; message?: unknown; details?: unknown };
	if (
		conflict.code !== '23505' ||
		typeof conflict.message !== 'string' ||
		!conflict.message.includes('"personnel_org_slug_key"') ||
		typeof conflict.details !== 'string'
	) {
		return null;
	}
	const key = /^Key \(organization_id, slug\)=\(([^,()]+), ([a-z0-9-]+)\) already exists\.$/.exec(conflict.details);
	if (!key || key[1] !== orgId || !candidates.has(key[2])) return null;
	return key[2];
}
