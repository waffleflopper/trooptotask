<script lang="ts">
	import type { AuditTimelineEvent } from './types.js';

	type Props = {
		events: AuditTimelineEvent[];
		timezoneLabel?: string;
	};

	let { events, timezoneLabel }: Props = $props();
</script>

<div class="grid gap-4" aria-label="Audit trail">
	{#each events as event (event.id)}
		<div class="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
			<span class="mt-1 size-2 rounded-full bg-foreground" aria-hidden="true"></span>
			<div class="grid gap-1">
				<span class="text-xs text-muted-foreground">{event.timestamp}</span>
				<strong class="text-sm">{event.title}</strong>
				<span class="text-sm text-muted-foreground">{event.actor}</span>
				{#if event.description}
					<span class="text-xs text-muted-foreground">{event.description}</span>
				{/if}
			</div>
		</div>
	{/each}
	{#if timezoneLabel}
		<p class="text-xs text-muted-foreground">{timezoneLabel}</p>
	{/if}
</div>
