<script lang="ts">
	import type { Snippet } from 'svelte';
	import { invalidate } from '$app/navigation';
	import { page } from '$app/state';
	import { getAppShellContext } from '$features/app-shell';
	import { calendarStatusHydration } from '$features/calendar';
	import {
		groupCatalogHydration,
		groupsStore,
		loadPersonnelModals,
		personnelRosterHydration,
		personnelStore,
		personnelWorkspaceHydrator,
		PersonnelPageContext,
		pinnedGroupsHydration,
		pinnedGroupsStore,
		rosterStore
	} from '$features/personnel';
	import type {
		PersonnelWorkspaceData,
		PersonnelWorkspaceRestricted,
		PersonnelWorkspaceResult,
		PersonnelWorkspaceRouteData
	} from '$features/personnel/contracts';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { hydrateStreamedWorkspace } from '$lib/utils/streamedWorkspaceHydrator';
	import SetupEditorLoadError from './SetupEditorLoadError.svelte';

	let {
		subject,
		children,
		loading
	}: {
		subject: string;
		children: Snippet<[PersonnelPageContext]>;
		loading: Snippet;
	} = $props();

	type View =
		| { status: 'loading' }
		| { status: 'ready'; ctx: PersonnelPageContext }
		| { status: 'restricted' }
		| { status: 'failed' };

	const org = getAppShellContext();
	const modals = new ModalRegistry();
	const stores = {
		personnelStore: personnelRosterHydration,
		groupsStore: groupCatalogHydration,
		statusTypesStore: calendarStatusHydration,
		pinnedGroupsStore: pinnedGroupsHydration
	};
	const streamed = $derived(page.data.personnel as PersonnelWorkspaceRouteData['personnel'] | undefined);

	let view = $state.raw<View>({ status: 'loading' });
	let stale = $state(false);

	function context(data: PersonnelWorkspaceData) {
		return new PersonnelPageContext(
			{
				orgId: page.data.orgId,
				asOf: page.data.asOf,
				orgName: page.data.orgName,
				pinnedGroups: data.pinnedGroups,
				rankCatalog: data.rankCatalog,
				personnel: data.personnel,
				lossWarningWindowDays: data.lossWarningWindowDays,
				awardTrackingAcknowledgedPersonnelIds: data.awardTrackingAcknowledgedPersonnelIds,
				disabledFeatures: page.data.disabledFeatures
			},
			modals,
			org,
			rosterStore,
			pinnedGroupsStore,
			undefined,
			groupsStore
		);
	}

	// A refresh after an import or an added person keeps the step on screen until the new roster arrives.
	$effect(() => {
		const source = streamed;
		let cancelled = false;
		const stop = hydrateStreamedWorkspace<PersonnelWorkspaceResult | PersonnelWorkspaceRestricted>({
			streamedWorkspace: source,
			fallbackMessage: `Failed to load ${subject}`,
			hydrate: async (workspace) => {
				if ('access' in workspace) {
					personnelWorkspaceHydrator.restrict(stores);
					if (!cancelled) view = { status: 'restricted' };
					return;
				}
				await personnelWorkspaceHydrator.hydrate(workspace.hydration, stores);
				if (!cancelled) {
					view = { status: 'ready', ctx: context(workspace.data) };
					stale = false;
				}
			},
			onReject: () => {
				if (cancelled) return;
				if (view.status === 'ready') stale = true;
				else view = { status: 'failed' };
			}
		});
		return () => {
			cancelled = true;
			stop();
		};
	});

	// Groups and people added here change setup's counts, so the rail and Done page reread them once the write lands;
	// an added row shows before the server has it.
	const sizes = $derived(
		view.status === 'ready' && !personnelStore.busy && !groupsStore.busy
			? `${groupsStore.items.length}:${view.ctx.allActivePersonnel.length}`
			: null
	);
	let seen: string | null = null;
	$effect(() => {
		if (sizes === null) return;
		if (seen !== null && seen !== sizes) void invalidate('app:organization-setup');
		seen = sizes;
	});
</script>

{#if view.status === 'ready'}
	{#if stale}
		<SetupEditorLoadError subject={subject[0].toUpperCase() + subject.slice(1)} stale />
	{/if}
	{@render children(view.ctx)}
	{#await loadPersonnelModals() then { default: PersonnelModals }}
		<PersonnelModals ctx={view.ctx} {modals} />
	{/await}
{:else if view.status === 'failed'}
	<SetupEditorLoadError subject={subject[0].toUpperCase() + subject.slice(1)} />
{:else if view.status === 'restricted'}
	<p class="text-sm leading-5 text-muted-foreground">
		Your access does not include the roster, so this step is read only.
	</p>
{:else}
	{@render loading()}
{/if}
