<script lang="ts">
	import { enhance } from '$app/forms';
	import { onDestroy } from 'svelte';
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { Spinner } from '$lib/components/ui/spinner';
	import { feedbackTitle } from '../../inboxTypes';
	import { formatAdminLabel } from '../adminTheme';
	import { createInboxActions } from './inboxActions.svelte';
	import InboxDetailHeader from './InboxDetailHeader.svelte';
	import type { InboxDetailProps } from './inboxDetailProps';
	import { formatWhen } from './inboxFormat';

	let { detail, onChanged }: InboxDetailProps<'feedback'> = $props();

	const actions = createInboxActions(() => onChanged());
	onDestroy(() => actions.dispose());

	const now = new Date();
	const isOpen = $derived(detail.status !== 'resolved');
	const title = $derived(feedbackTitle(detail.message));
	const meta = $derived(
		[
			detail.person,
			detail.organizationName,
			detail.pageSection && `on ${detail.pageSection}`,
			formatWhen(detail.receivedAt, now)
		]
			.filter(Boolean)
			.join(' · ')
	);
	const context = $derived([
		{ label: 'Page', value: detail.pageUrl ?? 'Not recorded' },
		...(detail.closedAt ? [{ label: 'Closed', value: formatWhen(detail.closedAt, now) }] : [])
	]);
</script>

<article class="grid max-w-[640px] gap-[22px]">
	<InboxDetailHeader
		tone="info"
		eyebrow={`Feedback · ${formatAdminLabel(detail.category)}`}
		badges={isOpen ? [] : [{ label: 'Closed', variant: 'success' }]}
		{title}
		{meta}
	/>

	{#if detail.message.trim() !== title}
		<p class="text-base leading-[25px] break-words whitespace-pre-wrap">{detail.message}</p>
	{/if}

	<dl
		class="flex flex-wrap gap-x-7 gap-y-1 border-y border-border py-2.5 font-mono text-[11px] leading-4 tracking-[0.04em]"
	>
		{#each context as fact (fact.label)}
			<div class="flex min-w-0 gap-1.5">
				<dt class="uppercase">{fact.label}</dt>
				<dd class="break-all text-muted-foreground">{fact.value}</dd>
			</div>
		{/each}
	</dl>

	{#if actions.error}
		<Alert.Root variant="destructive">
			<Alert.Description>{actions.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if isOpen}
		<form method="POST" action="?/close" use:enhance={actions.enhanceFor('close')}>
			<input type="hidden" name="id" value={detail.id} />
			<Button
				type="submit"
				variant="outline"
				aria-disabled={actions.pending === 'close' ? 'true' : undefined}
				aria-busy={actions.pending === 'close' || undefined}
			>
				{#if actions.pending === 'close'}<Spinner />{/if}
				Close without replying
			</Button>
		</form>
	{/if}
</article>
