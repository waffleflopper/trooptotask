/**
 * Client calls shared by the Training type and status type catalogs. A caller that leaves its
 * Organization never sees a result, so neither call needs its own staleness check for that.
 */
import { z } from 'zod';
import { withinOrganizationLifetime } from './lifetime.svelte';
import { buildRequestError } from './ports';

const archiveResult = z.object({ archivedAt: z.string().nullable() });
const usageResult = z.record(z.string(), z.number());

/** Record counts keyed by type id; every type in the Organization appears. */
export type CatalogUsage = Readonly<Record<string, number>>;

/** Archives or restores one type and resolves to the archive time the server set, or null once restored. */
export async function putCatalogArchive(
	orgId: string,
	resource: 'training-types' | 'status-types',
	id: string,
	archived: boolean
): Promise<string | null> {
	const url = `/org/${orgId}/api/${resource}/archive`;
	const res = await withinOrganizationLifetime(
		fetch(url, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id, archived })
		})
	);
	if (!res.ok) throw await withinOrganizationLifetime(buildRequestError(res, 'PUT', url));
	return archiveResult.parse(await withinOrganizationLifetime(res.json())).archivedAt;
}

export async function getCatalogUsage(
	orgId: string,
	resource: 'training-types' | 'status-types'
): Promise<CatalogUsage> {
	const url = `/org/${orgId}/api/${resource}/usage`;
	const res = await withinOrganizationLifetime(fetch(url));
	if (!res.ok) throw await withinOrganizationLifetime(buildRequestError(res, 'GET', url));
	return usageResult.parse(await withinOrganizationLifetime(res.json()));
}
