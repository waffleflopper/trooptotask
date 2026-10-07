<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { getAccountPreferencesContext } from '$features/identity';
	import { TrainingPageContext } from '$features/training';
	import type { TrainingPageData } from '$features/training';
	import { submitDeletionRequest } from '$features/deletion-requests';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getAppShellContext } from '$features/app-shell';
	import { TrainingPageView } from '$features/training';
	import { TrainingModals } from '$features/training';

	let { data } = $props();
	const preferences = getAccountPreferencesContext();

	const org = getAppShellContext();
	const modals = new ModalRegistry();
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const ctx = untrack((): TrainingPageContext | null => {
		if (!shell) return null;
		const pageData: TrainingPageData = {
			orgId: shell.org.id,
			get orgName() {
				return data.shell.org.name;
			},
			userPreferences: preferences.value
		};
		return new TrainingPageContext(pageData, modals, org, submitDeletionRequest, (patch) => preferences.patch(patch));
	});
	onDestroy(() => ctx?.dispose());
</script>

<svelte:head>
	<title>Training & Certifications - Troop to Task</title>
</svelte:head>

{#if ctx}
	<TrainingPageView {ctx} {modals} />
	<TrainingModals {ctx} {modals} />
{/if}
