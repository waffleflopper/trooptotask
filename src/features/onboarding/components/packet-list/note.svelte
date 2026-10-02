<script lang="ts">
	let {
		text,
		time
	}: {
		text: string;
		time: string;
	} = $props();
</script>

<div
	data-slot="onboarding-packet-note"
	class="flex items-start justify-between gap-2 border-b border-border py-2 last:border-b-0 max-sm:flex-col max-sm:gap-1"
>
	<span class="flex-1 text-sm leading-snug text-foreground">{text}</span>
	<span class="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">{time}</span>
</div>
