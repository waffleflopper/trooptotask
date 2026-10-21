<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		loadAvailabilityModal,
		saveAvailabilityChange,
		type AvailabilityChange,
		type AvailabilityEditorRequest,
		type AvailabilityOutcome
	} from '$features/calendar';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { actionablePersonnel, type QuickAddDialogProps } from '../../sections/dashboardSections';
	import QuickAddPersonPicker from './QuickAddPersonPicker.svelte';

	let { model, access, onClose }: QuickAddDialogProps = $props();

	const availabilityModal = loadAvailabilityModal();
	const orgId = $derived(model.data.orgId);
	let request = $state<AvailabilityEditorRequest | null>(null);
	let saving = $state(false);
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const people = $derived(
		actionablePersonnel(model.inputs.personnel, access, POLICY_ACTION_CATALOG.calendar.manageAvailability)
	);

	async function save(change: AvailabilityChange): Promise<AvailabilityOutcome> {
		if (saving) return 'busy';
		saving = true;
		try {
			return await saveAvailabilityChange(change, { orgId, isCurrent: () => active });
		} finally {
			if (active) saving = false;
		}
	}
</script>

{#if request}
	{#await availabilityModal then { default: AvailabilityModal }}
		<AvailabilityModal
			{request}
			statusTypes={[...model.inputs.statusTypes]}
			existingEntries={[...model.inputs.availability]}
			{saving}
			onSave={save}
			{onClose}
		/>
	{/await}
{:else}
	<QuickAddPersonPicker
		title="Add status"
		description="Choose who the status is for. It starts today."
		{people}
		failureMessage="Could not open the status editor. Try again."
		onContinue={async (person) => {
			await availabilityModal;
			request = { kind: 'create', person, startDate: model.today, endDate: model.today };
		}}
		{onClose}
	/>
{/if}
