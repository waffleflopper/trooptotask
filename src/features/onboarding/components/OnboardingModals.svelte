<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { MODAL_IDS } from '../contexts/OnboardingPageContext.svelte';
	import StartOnboardingModal from './StartOnboardingModal.svelte';
	import * as AppDialog from '$lib/components/ui/app-dialog';
	import ConfirmDialog from '$lib/components/ui/ConfirmDialog.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';
	import { Spinner } from '$lib/components/ui/spinner';

	interface Props {
		ctx: OnboardingPageContext;
	}

	let { ctx }: Props = $props();

	const switchTemplateLabel = $derived(
		ctx.templates.find((template) => template.id === ctx.switchTemplateSelected)?.name ?? 'Select a template'
	);
	const assignTemplateLabel = $derived(
		ctx.templates.find((template) => template.id === ctx.assignTemplateSelected)?.name ?? 'Select a template'
	);
</script>

{#if ctx.modals.isOpen(MODAL_IDS.startOnboarding)}
	<StartOnboardingModal
		personnel={ctx.personnel}
		existingOnboardingPersonnelIds={ctx.existingOnboardingPersonnelIds}
		groups={ctx.groups}
		templates={ctx.templates}
		hasTemplateSteps={ctx.hasTemplateSteps}
		onSubmit={(personnelId, _startedAt, templateId) => ctx.handleStartOnboarding(personnelId, templateId)}
		onAddPerson={ctx.handleAddPerson.bind(ctx)}
		onClose={ctx.modals.closerFor(MODAL_IDS.startOnboarding)}
	/>
{/if}

{#if ctx.cancellingId}
	<ConfirmDialog
		title="Cancel Onboarding"
		message="Are you sure you want to cancel this onboarding? This action cannot be undone."
		confirmLabel="Cancel Onboarding"
		variant="danger"
		onConfirm={() => ctx.handleCancelOnboarding(ctx.cancellingId!)}
		onCancel={() => (ctx.cancellingId = null)}
	/>
{/if}

{#if ctx.completingId}
	<ConfirmDialog
		title="Complete Onboarding"
		message={ctx.completingIncompleteCount > 0
			? `Are you sure? There ${ctx.completingIncompleteCount === 1 ? 'is 1 step' : `are ${ctx.completingIncompleteCount} steps`} still incomplete.`
			: 'Mark this onboarding as complete?'}
		confirmLabel="Mark Complete"
		variant={ctx.completingIncompleteCount > 0 ? 'warning' : undefined}
		onConfirm={() => ctx.confirmCompleteOnboarding()}
		onCancel={() => ctx.cancelComplete()}
	/>
{/if}

{#if ctx.switchingTemplateId}
	<AppDialog.Root open onClose={() => ctx.closeSwitchTemplate()}>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title id="switch-template-title">Switch Template</AppDialog.Title>
				<AppDialog.Description>
					Switch this onboarding to a different template. Removed steps stay on the record as inactive, new steps are
					added, and matching steps are refreshed.
				</AppDialog.Description>
			</AppDialog.Header>

			<AppDialog.Body>
				<div class="flex flex-col gap-3">
					<div class="grid gap-2 rounded-lg border bg-card p-3">
						<Label for="switch-template-select">New Template</Label>
						<Select.Root type="single" bind:value={ctx.switchTemplateSelected}>
							<Select.Trigger id="switch-template-select" class="w-full">{switchTemplateLabel}</Select.Trigger>
							<Select.Content>
								{#each ctx.templates as t (t.id)}
									<Select.Item value={t.id} label={t.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					{#if ctx.switchTemplateError}
						<p class="m-0 text-sm text-destructive">{ctx.switchTemplateError}</p>
					{/if}
				</div>
			</AppDialog.Body>

			<AppDialog.Footer>
				<Button variant="outline" type="button" onclick={() => ctx.closeSwitchTemplate()}>Cancel</Button>
				<Button
					type="button"
					onclick={() => ctx.handleSwitchTemplate()}
					disabled={!ctx.switchTemplateSelected || ctx.switchingTemplate}
				>
					{#if ctx.switchingTemplate}<Spinner />{/if}
					Switch Template
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}

{#if ctx.assigningTemplateId}
	<AppDialog.Root open onClose={() => ctx.closeAssignTemplate()}>
		<AppDialog.Content>
			<AppDialog.Header>
				<AppDialog.Title id="assign-template-title">Assign Template</AppDialog.Title>
				<AppDialog.Description>
					This onboarding started before templates were introduced. Assign a template so future syncs can match steps by
					name and type.
				</AppDialog.Description>
			</AppDialog.Header>

			<AppDialog.Body>
				<div class="flex flex-col gap-3">
					<div class="grid gap-2 rounded-lg border bg-card p-3">
						<Label for="assign-template-select">Template</Label>
						<Select.Root type="single" bind:value={ctx.assignTemplateSelected}>
							<Select.Trigger id="assign-template-select" class="w-full">{assignTemplateLabel}</Select.Trigger>
							<Select.Content>
								{#each ctx.templates as t (t.id)}
									<Select.Item value={t.id} label={t.name} />
								{/each}
							</Select.Content>
						</Select.Root>
					</div>

					{#if ctx.assignTemplateError}
						<p class="m-0 text-sm text-destructive">{ctx.assignTemplateError}</p>
					{/if}
				</div>
			</AppDialog.Body>

			<AppDialog.Footer>
				<Button variant="outline" type="button" onclick={() => ctx.closeAssignTemplate()}>Cancel</Button>
				<Button
					type="button"
					onclick={() => ctx.handleAssignTemplate()}
					disabled={!ctx.assignTemplateSelected || ctx.assigningTemplate}
				>
					{#if ctx.assigningTemplate}<Spinner />{/if}
					Assign Template
				</Button>
			</AppDialog.Footer>
		</AppDialog.Content>
	</AppDialog.Root>
{/if}
