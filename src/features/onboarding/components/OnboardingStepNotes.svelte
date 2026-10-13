<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import { formatTimestamp } from '../contexts/OnboardingPageContext.svelte';
	import type { OnboardingStepProgress } from '../onboarding.types';
	import { Button } from '$lib/components/ui/button';
	import { Textarea } from '$lib/components/ui/textarea';
	import { NoteDraft } from './noteDraft.svelte';

	interface Props {
		ctx: OnboardingPageContext;
		step: OnboardingStepProgress;
		canManage: boolean;
		/** Shows only the newest note, for places too small for the whole thread. */
		latestOnly?: boolean;
		/** Held by the caller when the draft must survive this component being replaced. */
		draft?: NoteDraft;
	}

	let { ctx, step, canManage, latestOnly = false, draft = new NoteDraft() }: Props = $props();

	const notes = $derived(latestOnly ? step.notes.slice(-1) : step.notes);
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
	{#if draft.stepId === step.id}
		<form
			class="grid gap-2"
			onsubmit={(event) => {
				event.preventDefault();
				void draft.save(step, ctx.handleAddNote.bind(ctx));
			}}
		>
			<Textarea bind:value={draft.text} aria-label={`Note for ${step.stepName}`} rows={2} />
			<div class="flex justify-end gap-2">
				<Button type="button" variant="ghost" size="sm" onclick={() => draft.cancel()}>Cancel</Button>
				<Button type="submit" size="sm" disabled={draft.saving || !draft.text.trim()}>Save note</Button>
			</div>
		</form>
	{:else}
		<Button variant="link" size="none" class="justify-self-end p-0 text-sm" onclick={() => draft.open(step.id)}>Add note</Button>
	{/if}
{/if}
