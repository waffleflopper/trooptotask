<script lang="ts">
	import { TrainingPageContext } from '$features/training/contexts/TrainingPageContext.svelte';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import TrainingPageView from '$features/training/components/TrainingPageView.svelte';
	import TrainingModals from '$features/training/components/TrainingModals.svelte';

	let { data } = $props();

	const org = getOrgContext();
	const modals = new ModalRegistry();
	const ctx = new TrainingPageContext(data, modals, org);
</script>

<svelte:head>
	<title>Training & Certifications - Troop to Task</title>
</svelte:head>

<TrainingPageView {ctx} {modals} />
<TrainingModals {ctx} {modals} />
