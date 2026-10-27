/** A reactive `$app/state` page for step tests: `applyAction` writes `form` here like SvelteKit does. */
export const page = $state<{ data: Record<string, unknown>; form: unknown; params: Record<string, string> }>({
	data: {},
	form: null,
	params: { orgId: 'alpha' }
});
