<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { formatTimestamp } from '../contexts/OnboardingPageContext.svelte';
	import type { OnboardingStepProgress } from '../onboarding.types';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';

	interface Props {
		ctx: OnboardingPageContext;
		step: OnboardingStepProgress;
		canManage: boolean;
		/** Shows only the newest note, for places too small for the whole thread. */
		latestOnly?: boolean;
	}

	let { ctx, step, canManage, latestOnly = false }: Props = $props();

	const notes = $derived(latestOnly ? step.notes.slice(-1) : step.notes);

	let adding = $state(false);
	let text = $state('');
	let saving = $state(false);
	/** Identifies the draft a pending save belongs to, so a finished save closes only its own draft. */
	let draft = 0;

	function open() {
		draft++;
		adding = true;
		text = '';
		saving = false;
	}

	function cancel() {
		draft++;
		adding = false;
	}

	async function save() {
		const trimmed = text.trim();
		if (!trimmed) return;
		const current = draft;
		saving = true;
		const saved = await ctx.handleAddNote(step, trimmed);
		if (current !== draft) return;
		saving = false;
		if (saved) adding = false;
	}
</script>

{#if notes.length > 0}
	<ul class="grid gap-2" aria-label={`${step.stepName} notes`}>
		{#each notes as note, index (index)}
			<li class="grid gap-0.5">
				<p class="text-sm italic text-foreground">{note.text}</p>
				<p class="font-mono text-xs text-muted-foreground">{formatTimestamp(note.timestamp)}</p>
			</li>
		{/each}
	</ul>
{/if}
{#if canManage}
	{#if adding}
		<form
			class="grid gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				void save();
			}}
		>
			<Textarea bind:value={text} aria-label={`Note for ${step.stepName}`} rows={2} />
			<div class="flex justify-end gap-2">
				<Button type="button" variant="ghost" size="sm" onclick={cancel}>Cancel</Button>
				<Button type="submit" size="sm" disabled={saving || !text.trim()}>Save note</Button>
			</div>
		</form>
	{:else}
		<Button variant="link" size="none" class="justify-self-end p-0 text-sm" onclick={open}>Add note</Button>
	{/if}
{/if}
