<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { tick } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import { Spinner } from '$lib/components/ui/spinner';
	import { Textarea } from '$lib/components/ui/textarea';
	import type { OnboardingTemplate } from '../../contracts';
	import type { OnboardingTemplateWorkspace } from '../../stores/onboardingTemplate.svelte';

	let {
		workspace,
		template,
		stepCount,
		onsave,
		ondelete,
		onduplicate
	}: {
		workspace: OnboardingTemplateWorkspace;
		/** Null while a new template is being written. */
		template: OnboardingTemplate | null;
		stepCount: number;
		onsave: () => void | Promise<void>;
		ondelete: () => void;
		onduplicate: () => void;
	} = $props();

	const model = $derived(workspace.model);
	const editing = $derived(model.creatingTemplate || model.editingTemplate);
	const duplicating = $derived(!!template && model.duplicatingTemplateId === template.id);

	let nameInput = $state<HTMLElement | null>(null);
	let renameButton = $state<HTMLElement | null>(null);

	$effect(() => {
		nameInput?.focus();
	});

	async function cancel() {
		const wasCreating = model.creatingTemplate;
		workspace.cancelTemplateEdit();
		if (wasCreating) return;
		await tick();
		renameButton?.focus();
	}

	async function save() {
		const wasCreating = model.creatingTemplate;
		await onsave();
		if (wasCreating || workspace.model.editingTemplate) return;
		await tick();
		renameButton?.focus();
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			void cancel();
		} else if (event.key === 'Enter' && event.target instanceof HTMLInputElement && model.canSaveTemplate) {
			event.preventDefault();
			void save();
		}
	}
</script>

{#if editing}
	<form class="grid gap-3" aria-label={model.creatingTemplate ? 'New template' : 'Rename template'}>
		<p class="m-0 font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
			{model.creatingTemplate ? 'New template' : `Template · ${stepCount} ${stepCount === 1 ? 'step' : 'steps'}`}
		</p>
		<Field.Root>
			<Field.Label for="template-name">Name</Field.Label>
			<Input
				bind:ref={nameInput}
				id="template-name"
				type="text"
				bind:value={workspace.templateDraft.name}
				placeholder="e.g. Standard Arrival"
				onkeydown={handleKeydown}
			/>
		</Field.Root>
		<Field.Root>
			<Field.Label for="template-description">Description</Field.Label>
			<Textarea
				id="template-description"
				rows={2}
				bind:value={workspace.templateDraft.description}
				placeholder="Optional template description"
				onkeydown={handleKeydown}
			/>
		</Field.Root>
		<div class="flex justify-end gap-2">
			<Button variant="outline" size="sm" type="button" onclick={cancel}>Cancel</Button>
			<Button size="sm" type="button" onclick={save} disabled={!model.canSaveTemplate}>
				{#if model.savingTemplate}<Spinner class="size-3" />{/if}
				{model.creatingTemplate ? 'Create template' : 'Save template'}
			</Button>
		</div>
	</form>
{:else if template}
	<div class="flex items-start justify-between gap-3 max-sm:flex-col">
		<div class="grid min-w-0 gap-1">
			<p class="m-0 font-mono text-xs font-semibold tracking-wider text-muted-foreground uppercase">
				Template · {stepCount}
				{stepCount === 1 ? 'step' : 'steps'}
			</p>
			<div class="flex min-w-0 items-center gap-1">
				<h2 class="m-0 truncate text-xl font-semibold text-foreground">{template.name}</h2>
				{#if model.canMutate}
					<Button
						bind:ref={renameButton}
						variant="ghost"
						size="icon-sm"
						type="button"
						title="Rename template"
						aria-label="Rename {template.name}"
						disabled={model.templateActionDisabled}
						onclick={() => workspace.startEditTemplate()}
					>
						<Pencil aria-hidden="true" />
					</Button>
				{/if}
			</div>
			{#if template.description}
				<p class="m-0 text-sm text-muted-foreground">{template.description}</p>
			{:else if model.canMutate}
				<div>
					<Button
						variant="link"
						size="none"
						type="button"
						class="text-sm"
						disabled={model.templateActionDisabled}
						onclick={() => workspace.startEditTemplate()}
					>
						Add a description
					</Button>
				</div>
			{:else}
				<p class="m-0 text-sm text-muted-foreground">No description has been added for this onboarding template.</p>
			{/if}
		</div>
		{#if model.canMutate}
			<div class="flex shrink-0 gap-2">
				<Button variant="outline" size="sm" type="button" disabled={model.templateActionDisabled} onclick={onduplicate}>
					{#if duplicating}
						<Spinner class="size-3" />
					{:else}
						<Copy aria-hidden="true" />
					{/if}
					Duplicate
				</Button>
				<Button
					variant="destructive"
					size="sm"
					type="button"
					disabled={model.templateActionDisabled}
					onclick={ondelete}
				>
					<Trash2 aria-hidden="true" />
					Delete
				</Button>
			</div>
		{/if}
	</div>
{/if}
