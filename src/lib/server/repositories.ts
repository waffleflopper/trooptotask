/**
 * Factory-defined repositories for simple org-scoped tables.
 * Each repo centralizes read queries with consistent transforms, sorting, and org scoping.
 * See #216 / #222.
 */
import type { Group } from '$lib/stores/groups.svelte';
import { transformGroups } from '$lib/server/transforms';
import { createRepository } from '$lib/server/repositoryFactory';

export const groupRepo = createRepository<Group>({
	table: 'groups',
	transform: transformGroups,
	orderBy: [{ column: 'sort_order', ascending: true }]
});
