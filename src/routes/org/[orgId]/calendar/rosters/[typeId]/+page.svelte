<script lang="ts">
	import { page } from '$app/state';
	import Da6Page from '$features/calendar/components/da6/Da6Page.svelte';
	import type { Da6View } from '$features/calendar/utils/da6View';
	import { observeDeferred } from '$lib/utils/streamedRouteData';
	import WorkspaceAccessRestricted from '../../../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../../../WorkspaceLoadError.svelte';

	let { data } = $props();
	const source = $derived(data.da6.data);
	let settled = $state.raw<{ source: unknown; view?: Da6View; restricted?: true; error?: Error } | null>(null);
	const current = $derived(settled?.source === source ? settled : null);

	$effect(() => {
		const requested = source;
		let cancelled = false;
		void observeDeferred(requested, {
			fallbackMessage: 'Failed to load the DA 6',
			onResolve: (value) => {
				settled = 'access' in value ? { source: requested, restricted: true } : { source: requested, view: value };
			},
			onReject: (error) => {
				settled = { source: requested, error };
			},
			isCancelled: () => cancelled
		});
		return () => {
			cancelled = true;
		};
	});
</script>

<svelte:head>
	<title>{current?.view ? `DA 6 · ${current.view.roster.name}` : 'DA 6'} - Troop to Task</title>
</svelte:head>

{#if current?.error}
	<WorkspaceLoadError subject="DA 6" />
{:else if current?.restricted}
	<WorkspaceAccessRestricted subject="the DA 6" />
{:else}
	<Da6Page
		orgName={data.shell.org.name}
		orgUrlSegment={data.shell.org.urlSegment}
		typeId={page.params.typeId ?? ''}
		month={data.month}
		view={current?.view ?? null}
	/>
{/if}
