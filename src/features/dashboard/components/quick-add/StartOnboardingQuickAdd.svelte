<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		loadOnboardingStartOptions,
		loadStartOnboardingModal,
		startOnboardingPacket,
		type OnboardingStartOptions
	} from '$features/onboarding';
	import { createPersonnel } from '$features/personnel';
	import type { Personnel } from '$features/personnel/contracts';
	import { POLICY_ACTION_CATALOG } from '$lib/access/policyEvaluator';
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import { actionablePersonnel, type QuickAddDialogProps } from '../../sections/dashboardSections';

	let { model, access, updates, onClose }: QuickAddDialogProps = $props();

	type StartOptionsRead =
		| { status: 'loading' }
		| { status: 'ready'; options: OnboardingStartOptions }
		| { status: 'failed'; message: string };

	const createRecords = POLICY_ACTION_CATALOG.personnel.createRecords;
	const startOnboardingModal = loadStartOnboardingModal();
	const orgId = $derived(model.data.orgId);
	let read = $state<StartOptionsRead>({ status: 'loading' });
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const people = $derived(
		actionablePersonnel(model.inputs.personnel, access, POLICY_ACTION_CATALOG.onboarding.manageWorkflows)
	);
	const startedPersonnelIds = $derived(model.data.dashboard.data.activeOnboardings.map((packet) => packet.personnelId));
	const creationGroups = $derived(
		model.inputs.groups.filter((group) => access.can(createRecords, { kind: 'group', groupId: group.id }))
	);
	const allowUnassigned = $derived(access.can(createRecords, { kind: 'organization' }));

	async function loadOptions() {
		read = { status: 'loading' };
		try {
			const [options] = await Promise.all([loadOnboardingStartOptions(orgId), startOnboardingModal]);
			if (active) read = { status: 'ready', options };
		} catch (failure) {
			if (active)
				read = { status: 'failed', message: rejectedRequestMessage(failure, 'Could not load onboarding templates.') };
		}
	}
	void loadOptions();

	async function start(personnelId: string, startedAt: string, templateId: string | null): Promise<boolean> {
		const savedIn = orgId;
		const packet = await startOnboardingPacket(savedIn, { personnelId, startedAt, templateId });
		updates.putRecord(savedIn, { list: 'activeOnboardings', record: packet });
		return true;
	}

	async function addPerson(data: Omit<Personnel, 'id'>): Promise<string> {
		const person = await createPersonnel(data);
		if (!person) throw new Error('Personnel creation could not be confirmed. Reload the roster before trying again.');
		return person.id;
	}
</script>

{#if read.status === 'ready'}
	{@const options = read.options}
	{#await startOnboardingModal then { default: StartOnboardingModal }}
		<StartOnboardingModal
			personnel={people}
			canAddPerson={access.can(createRecords) && (allowUnassigned || creationGroups.length > 0)}
			existingOnboardingPersonnelIds={startedPersonnelIds}
			groups={creationGroups}
			{allowUnassigned}
			rankCatalog={options.rankCatalog}
			rankCatalogUnavailable={options.rankCatalogUnavailable}
			templates={options.templates}
			hasTemplateSteps={options.hasTemplateSteps}
			onSubmit={start}
			onAddPerson={addPerson}
			{onClose}
		/>
	{/await}
{:else}
	<AppDialog.Root {onClose}>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title>Start Onboarding</AppDialog.Title>
				<AppDialog.Description>
					{read.status === 'loading' ? 'Loading onboarding templates.' : 'Onboarding templates did not load.'}
				</AppDialog.Description>
			</AppDialog.Header>
			<AppDialog.Body>
				{#if read.status === 'failed'}
					<Alert.Root variant="destructive">
						<Alert.Title>Could not open Start Onboarding</Alert.Title>
						<Alert.Description>{read.message}</Alert.Description>
					</Alert.Root>
				{:else}
					<div class="grid gap-3" aria-hidden="true">
						<Skeleton class="h-24 w-full" />
						<Skeleton class="h-20 w-full" />
					</div>
				{/if}
			</AppDialog.Body>
			<AppDialog.Footer>
				<Button variant="outline" type="button" onclick={onClose}>Cancel</Button>
				{#if read.status === 'failed'}
					<Button type="button" onclick={loadOptions}>Try again</Button>
				{/if}
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
