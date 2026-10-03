<script lang="ts">
	import { TrainingPageContext } from '$features/training';
	import type { TrainingPageData } from '$features/training';
	import { submitDeletionRequest } from '$features/deletion-requests';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import { TrainingPageView } from '$features/training';
	import { TrainingModals } from '$features/training';

	let { data } = $props();
	const savePreferences: ConstructorParameters<typeof TrainingPageContext>[4] = async (orgId, patch) => {
		const { queueUserPreferencesPatch } = await import('$features/identity');
		return queueUserPreferencesPatch(orgId, patch);
	};

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
		return new TrainingPageContext(pageData, modals, org, submitDeletionRequest, savePreferences);
	});
</script>

<svelte:head>
	<title>Training & Certifications - Troop to Task</title>
</svelte:head>

{#if ctx}
	<TrainingPageView {ctx} {modals} />
	<TrainingModals {ctx} {modals} />
{/if}
