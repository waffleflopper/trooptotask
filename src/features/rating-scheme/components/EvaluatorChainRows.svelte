<script lang="ts">
	import type { PersonnelLookup } from '$features/personnel/contracts';
	import type { EvaluatorChain } from '../rating-scheme.types';
	import { workflowRoles } from '../utils/evaluationWorkflow';
	import { spokenPersonLabel } from '../utils/personLabel';

	interface Props {
		chain: EvaluatorChain;
		personnel: readonly PersonnelLookup[];
		label: string;
	}

	let { chain, personnel, label }: Props = $props();

	const roles = $derived(workflowRoles(chain));
	const rows = $derived([
		['Rater', chain.raterPersonId, chain.raterName, true],
		['Intermediate', chain.intermediateRaterPersonId, chain.intermediateRaterName, roles.intermediateRater],
		['Senior rater', chain.seniorRaterPersonId, chain.seniorRaterName, true],
		['Reviewer', chain.reviewerPersonId, chain.reviewerName, roles.reviewer]
	] as const);

	/** A Person since removed from Personnel still signed or holds the role, so the row says so instead of hiding it. */
	function named(personId: string | null, name: string | null): { text: string; muted: boolean } {
		if (personId) {
			const person = personnel.find((candidate) => candidate.id === personId);
			return person
				? { text: spokenPersonLabel(person), muted: false }
				: { text: 'No longer in Personnel', muted: true };
		}
		return name?.trim() ? { text: name.trim(), muted: false } : { text: 'Not set', muted: true };
	}
</script>

<dl class="grid gap-2" aria-label={label}>
	{#each rows as [role, personId, name, present] (role)}
		{#if present}
			{@const shown = named(personId, name)}
			<div class="flex items-baseline gap-3 text-sm">
				<dt class="w-[110px] shrink-0 text-muted-foreground">{role}</dt>
				<dd class={shown.muted ? 'text-muted-foreground' : 'font-medium'}>{shown.text}</dd>
			</div>
		{/if}
	{/each}
</dl>
