<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		getProjectionCards,
		type ProjectionCardChoice,
		type ProjectionTarget
	} from '$features/calendar/projection/projectionCards';
	import MarkerListPopover from './MarkerListPopover.svelte';

	type Props = {
		/** Names the control, including how many it stands for. */
		label: string;
		class?: string;
		title?: string;
		children: Snippet;
	} & (
		| { target: ProjectionTarget; href: string; heading?: never; choices?: never }
		| { heading: string; choices: readonly ProjectionCardChoice[]; target?: never; href?: never }
	);

	let props: Props = $props();

	const cards = getProjectionCards();

	function openOne(event: MouseEvent, target: ProjectionTarget) {
		// A modified click keeps the link's own behaviour, such as a new tab.
		if (!cards || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
		event.preventDefault();
		cards.open({ kind: 'one', target }, event.currentTarget as HTMLElement);
	}
</script>

{#if props.target}
	{@const target = props.target}
	<a
		href={props.href}
		class={props.class}
		aria-label={props.label}
		title={props.title}
		aria-haspopup={cards ? 'dialog' : undefined}
		onclick={(event) => openOne(event, target)}>{@render props.children()}</a
	>
{:else if cards}
	{@const request = { kind: 'list' as const, heading: props.heading, choices: props.choices }}
	<button
		type="button"
		class={props.class}
		aria-label={props.label}
		title={props.title}
		aria-haspopup="dialog"
		onclick={(event) => cards.open(request, event.currentTarget)}>{@render props.children()}</button
	>
{:else}
	<MarkerListPopover label={props.label} heading={props.heading} items={props.choices} class={props.class}>
		{@render props.children()}
	</MarkerListPopover>
{/if}
