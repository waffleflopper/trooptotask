<script lang="ts">
	import { resolve } from '$app/paths';
	import { setupTimelineEntries } from '../../setupTimeline';
	import EventTimeline from '../people/EventTimeline.svelte';
	import SetupEmailCommands from '../people/SetupEmailCommands.svelte';
	import InboxDetailHeader from './InboxDetailHeader.svelte';
	import type { InboxDetailProps } from './inboxDetailProps';
	import { formatWhen } from './inboxFormat';

	let { detail, onChanged }: InboxDetailProps<'setupEmailFailed'> = $props();

	const now = new Date();
	const bounced = $derived(detail.reason === 'bounced');
	const entries = $derived(setupTimelineEntries(detail.timeline, now, detail.email));
	const resolution = $derived(
		detail.completedAt
			? 'They finished setting up their account.'
			: detail.status === 'rescinded'
				? 'Access was rescinded.'
				: 'A newer setup link was sent.'
	);
</script>

<article class="grid max-w-[620px] gap-6">
	<InboxDetailHeader
		tone="danger"
		eyebrow={bounced ? 'Setup email · Bounced' : 'Setup email · Expired unused'}
		badges={detail.isOpen ? [] : [{ label: 'Resolved', variant: 'success' }]}
		title={bounced ? `${detail.name} never got a setup link` : `${detail.name} has not used their setup link`}
		meta={`${detail.email} · ${bounced ? 'bounced' : 'expired'} ${formatWhen(detail.failedAt, now)}`}
	/>

	<EventTimeline {entries} label="Setup email history" empty="Nothing has been recorded for this setup link." />

	{#if detail.isOpen}
		<div class="grid gap-2.5">
			<SetupEmailCommands
				name={detail.name}
				linkId={detail.id}
				canAskInviter={detail.canAskInviter}
				primary={bounced ? 'ask' : 'resend'}
				onSettled={() => onChanged()}
			/>
			<p class="text-[13px] leading-[19px] text-muted-foreground">
				{#if bounced}
					The address is probably mistyped, so resending usually bounces again.
					{#if detail.canAskInviter}
						Asking the inviter sends them an in-app notification to fix the invitation.
					{:else}
						No member who invited this address can be asked.
					{/if}
				{:else}
					The link ran out before they used it. Resending replaces it with a new link that is good for 14 days.
				{/if}
			</p>
			<a
				class="w-fit text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
				href={resolve(`/admin/people/not-set-up/${detail.requestId}` as '/admin/people')}
			>
				Open {detail.name}'s page
			</a>
		</div>
	{:else}
		<p class="text-sm text-muted-foreground">{resolution}</p>
	{/if}
</article>
