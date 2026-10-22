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
	import * as Alert from '$lib/components/ui/alert';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import { Button } from '$lib/components/ui/button';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { rejectedRequestMessage } from '$lib/stores/core';
	import type { QuickAddDialogProps } from '../../sections/dashboardSections';
	import { startOnboardingChoices } from '../../sections/startOnboardingChoices';

	let { model, access, updates, onClose }: QuickAddDialogProps = $props();

	type StartOptionsRead =
		| { status: 'loading' }
		| {
				status: 'ready';
				options: OnboardingStartOptions;
				StartOnboardingModal: Awaited<ReturnType<typeof loadStartOnboardingModal>>['default'];
		  }
		| { status: 'failed'; message: string };

	const orgId = $derived(model.data.orgId);
	let read = $state<StartOptionsRead>({ status: 'loading' });
	let active = true;
	onDestroy(() => {
		active = false;
	});

	const choices = $derived(startOnboardingChoices(model.inputs, access));

	async function loadOptions() {
		read = { status: 'loading' };
		try {
			const [options, { default: StartOnboardingModal }] = await Promise.all([
				loadOnboardingStartOptions(orgId),
				loadStartOnboardingModal()
			]);
			if (active) read = { status: 'ready', options, StartOnboardingModal };
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
		if (active && savedIn === model.data.orgId) updates.refreshSummary();
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
	<read.StartOnboardingModal
		personnel={choices.people}
		canAddPerson={choices.canAddPerson}
		existingOnboardingPersonnelIds={choices.startedPersonnelIds}
		groups={choices.groups}
		allowUnassigned={choices.allowUnassigned}
		rankCatalog={options.rankCatalog}
		rankCatalogUnavailable={options.rankCatalogUnavailable}
		templates={options.templates}
		hasTemplateSteps={options.hasTemplateSteps}
		onSubmit={start}
		onAddPerson={addPerson}
		{onClose}
	/>
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
