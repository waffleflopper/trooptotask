<script lang="ts">
	import { page } from '$app/state';
	import Da6Page from '$features/calendar/components/da6/Da6Page.svelte';
	import Da6SetupPage from '$features/calendar/components/da6/Da6SetupPage.svelte';
	import type { Da6Setup, Da6View } from '$features/calendar';
	import { observeDeferred } from '$lib/utils/streamedRouteData';
	import WorkspaceAccessRestricted from '../../../WorkspaceAccessRestricted.svelte';
	import WorkspaceLoadError from '../../../WorkspaceLoadError.svelte';

	let { data } = $props();
	const source = $derived<Promise<unknown>>(data.setup ? data.setup.data : data.da6.data);
	let settled = $state.raw<{
		source: unknown;
		view?: Da6View;
		setup?: Da6Setup;
		restricted?: true;
		error?: Error;
	} | null>(null);
	const current = $derived(settled?.source === source ? settled : null);
	const name = $derived(current?.view?.roster.name ?? current?.setup?.roster.name);

	$effect(() => {
		const requested = source;
		let cancelled = false;
		void observeDeferred(requested as Promise<Da6View | Da6Setup | { access: 'restricted' }>, {
			fallbackMessage: 'Failed to load the DA 6',
			onResolve: (value) => {
				settled =
					'access' in value
						? { source: requested, restricted: true }
						: 'form' in value
							? { source: requested, setup: value }
							: { source: requested, view: value };
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
	<title>{name ? `DA 6 · ${name}` : 'DA 6'} - Troop to Task</title>
</svelte:head>

{#if current?.error}
	<WorkspaceLoadError subject="DA 6" />
{:else if current?.restricted}
	<WorkspaceAccessRestricted subject="the DA 6" />
{:else if data.setup}
	<Da6SetupPage
		orgName={data.shell.org.name}
		orgUrlSegment={data.shell.org.urlSegment}
		setup={current?.setup ?? null}
	/>
{:else}
	<Da6Page
		orgName={data.shell.org.name}
		orgUrlSegment={data.shell.org.urlSegment}
		typeId={page.params.typeId ?? ''}
		month={data.month}
		view={current?.view ?? null}
	/>
{/if}
