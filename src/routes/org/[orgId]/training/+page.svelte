<script lang="ts">
	import { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import type { TrainingPageData } from '$features/training/contexts/TrainingPageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import TrainingPageView from '$features/training/components/TrainingPageView.svelte';
	import TrainingModals from '$features/training/components/TrainingModals.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	const shell = $derived(data.shell.kind === 'ready' ? data.shell : null);
	const ctx = $derived.by<TrainingPageContext | null>(() => {
		if (!shell) return null;
		const pageData: TrainingPageData = {
			orgId: shell.org.id,
			orgName: shell.org.name,
			userPreferences: shell.preferences
		};
		return new TrainingPageContext(pageData, modals, org);
	});
</script>

<svelte:head>
	<title>Training & Certifications - Troop to Task</title>
</svelte:head>

{#if ctx}
	<TrainingPageView {ctx} {modals} />
	<TrainingModals {ctx} {modals} />
{/if}
