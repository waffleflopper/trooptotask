<script lang="ts">
	import { TrainingPageContext } from '$features/training';
	import type { TrainingPageData } from '$features/training';
	import { toast } from 'svelte-sonner';
	import { ModalRegistry } from '$lib/utils/modalRegistry.svelte';
	import { getOrgContext } from '$lib/stores/orgContext.svelte';
	import TrainingPageView from '$features/training/components/TrainingPageView.svelte';
	import TrainingModals from '$features/training/components/TrainingModals.svelte';

	let { data } = $props();

	const submitDeletionRequest: ConstructorParameters<typeof TrainingPageContext>[3] = async (
		orgId,
		resourceType,
		resourceId,
		resourceDescription,
		resourceUrl
	) => {
		try {
			const response = await fetch(`/org/${orgId}/api/deletion-requests`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ resourceType, resourceId, resourceDescription, resourceUrl })
			});
			if (response.status === 409) {
				toast.info('A deletion request for this item is already pending.', { duration: 4000 });
				return true;
			}
			if (!response.ok) {
				toast.error('Failed to submit deletion request.', { duration: 6000 });
				return false;
			}
			toast.info('Deletion request submitted for admin approval.', { duration: 4000 });
			return true;
		} catch {
			toast.error('Failed to submit deletion request.', { duration: 6000 });
			return false;
		}
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
		return new TrainingPageContext(pageData, modals, org, submitDeletionRequest);
	});
</script>

<svelte:head>
	<title>Training & Certifications - Troop to Task</title>
</svelte:head>

{#if ctx}
	<TrainingPageView {ctx} {modals} />
	<TrainingModals {ctx} {modals} />
{/if}
