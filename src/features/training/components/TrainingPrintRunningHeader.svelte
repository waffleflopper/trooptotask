<script lang="ts">
	interface Props {
		organizationName: string;
		context: string;
		colspan: number;
	}

	let { organizationName, context, colspan }: Props = $props();
</script>

<tr>
	<td {colspan} class="p-0 pb-3">
		<div class="flex items-baseline justify-between gap-6 border-b border-foreground pb-1.5">
			<p class="flex min-w-0 items-baseline gap-3">
				<span class="font-heading text-[15px] leading-[18px] font-bold">{organizationName}</span>
				<span class="shrink-0 font-mono text-[9px] leading-3 uppercase tracking-[0.06em] text-muted-foreground"
					>Training readiness brief</span
				>
			</p>
			<p class="text-right font-mono text-[9px] leading-3 uppercase tracking-[0.04em] text-muted-foreground">
				{context}
			</p>
		</div>
	</td>
</tr>
