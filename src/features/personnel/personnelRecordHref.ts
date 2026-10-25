import { resolve } from '$app/paths';
import type { Personnel } from './personnel.types';

const RECORD_ROUTES = {
	overview: '/org/[orgId]/personnel/[personnelSlug]',
	readiness: '/org/[orgId]/personnel/[personnelSlug]/readiness',
	log: '/org/[orgId]/personnel/[personnelSlug]/log',
	'data-sheet': '/org/[orgId]/personnel/[personnelSlug]/data-sheet'
} as const;

export function personnelRecordHref(
	orgUrlSegment: string,
	person: Pick<Personnel, 'id' | 'slug'>,
	tab: keyof typeof RECORD_ROUTES = 'overview'
): string {
	return resolve(RECORD_ROUTES[tab], { orgId: orgUrlSegment, personnelSlug: person.slug ?? person.id });
}
