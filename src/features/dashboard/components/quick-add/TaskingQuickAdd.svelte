<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { goto } from '$app/navigation';
	import { loadTaskingDialog, type Tasking, type TaskingChoices } from '$features/calendar';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import { buildRequestError, stillInOrganizationLifetime } from '$lib/stores/core';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { QuickAddDialogProps } from '../../sections/dashboardSections';

	let { model, access, updates, onClose }: QuickAddDialogProps = $props();

	type Dialog = Awaited<ReturnType<typeof loadTaskingDialog>>['default'];

	const orgId = untrack(() => model.data.orgId);
	const orgName = untrack(() => model.inputs.page.orgName);
	const organizationWide = untrack(() =>
		access.can(POLICY_ACTION_CATALOG.calendar.manageTaskings, { kind: 'organization' })
	);
	let sheet = $state.raw<{ Dialog: Dialog; choices: TaskingChoices } | null>(null);
	let active = true;
	onDestroy(() => {
		active = false;
	});

	async function readChoices(): Promise<TaskingChoices> {
		const response = await fetch(`/org/${orgId}/api/calendar-taskings/choices`, { cache: 'no-store' });
		if (!response.ok) throw await buildRequestError(response, 'GET', 'calendar-taskings/choices');
		const choices = (await response.json()) as TaskingChoices | null;
		if (!choices) throw new Error('You cannot create Taskings here.');
		return choices;
	}

	onMount(async () => {
		const current = stillInOrganizationLifetime();
		try {
			const [{ default: Dialog }, choices] = await Promise.all([loadTaskingDialog(), readChoices()]);
			if (active && current()) sheet = { Dialog, choices };
		} catch {
			if (!active || !current()) return;
			toastStore.error('Could not open Create tasking. Try again.');
			onClose();
		}
	});

	// The new Tasking joins Needs you or On duty when it needs attention or falls due this week.
	async function saved(tasking: Tasking) {
		onClose();
		toastStore.success(`${tasking.title} created`, 5000, {
			label: 'Open',
			onClick: () => void goto(`/org/${orgId}/calendar/taskings/${tasking.id}`)
		});
		await updates.refreshTaskings();
	}
</script>

{#if sheet}
	<sheet.Dialog {orgId} {orgName} choices={sheet.choices} {organizationWide} onSaved={saved} {onClose} />
{/if}
