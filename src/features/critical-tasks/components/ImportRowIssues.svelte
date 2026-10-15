<script lang="ts">
	interface Props {
		heading?: string;
		guidance?: string;
		issues: Array<{ rowNumber: number; details: string[]; message: string }>;
	}

	let { heading, guidance, issues }: Props = $props();
</script>

{#if issues.length > 0}
	<section class="flex flex-col gap-2">
		{#if heading}
			<h3 class="text-sm font-semibold">{heading}</h3>
		{/if}
		{#if guidance}
			<p class="text-sm text-muted-foreground">{guidance}</p>
		{/if}
		<ul class="flex flex-col gap-2 pl-4">
			{#each issues as issue, index (`${issue.rowNumber}-${index}`)}
				<li class="flex flex-col gap-0.5">
					<strong>Row {issue.rowNumber}</strong>
					{#each issue.details as detail, detailIndex (detailIndex)}
						<span>{detail}</span>
					{/each}
					<span>{issue.message}</span>
				</li>
			{/each}
		</ul>
	</section>
{/if}
