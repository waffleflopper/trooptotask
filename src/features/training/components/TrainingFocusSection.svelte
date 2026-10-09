<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import * as ReportWorkspace from '$lib/components/patterns/report-workspace';
	import type { BriefingFocus } from '../utils/trainingBriefing.types';

	interface Props {
		focus: BriefingFocus;
		detailId: string;
		openKey: string | null;
		onOpen: (key: string) => void;
	}

	let { focus, detailId, openKey, onOpen }: Props = $props();
	const uid = $props.id();
</script>

<ReportWorkspace.Section variant="briefing" eyebrow="Focus" title="Where training time buys the most">
	{#if focus.areas.length > 0}
		<ol class="border-t border-border">
			{#each focus.areas as area, index (area.key)}
				<li class="flex gap-4 border-b border-border py-[18px] break-inside-avoid">
					<span
						class="w-7 shrink-0 font-heading text-[32px] leading-[30px] font-extrabold text-warning"
						aria-hidden="true">{index + 1}</span
					>
					<div class="flex min-w-0 flex-1 flex-col items-start gap-2">
						<h3 id={`${uid}-${index}`} class="font-heading text-xl leading-6 font-semibold [overflow-wrap:anywhere]">
							{area.title}
						</h3>
						<p class="font-serif text-[15px] leading-[22px]">{area.body}</p>
						<p
							class="flex min-h-8 items-center rounded-[4px] border border-border bg-muted px-3 py-1.5 font-mono text-[12px] tracking-[0.04em] text-muted-foreground"
						>
							{area.whatIf.chip}
						</p>
						<div class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
							<Button
								variant="link"
								href={`#${detailId}`}
								data-sveltekit-preload-data="off"
								class="h-auto p-0 font-serif text-sm font-medium text-foreground underline"
								aria-describedby={`${uid}-${index}`}
								aria-current={openKey === area.key ? 'true' : undefined}
								onclick={(event: MouseEvent) => {
									event.preventDefault();
									onOpen(area.key);
								}}
							>
								{area.linkLabel}
							</Button>
							{#if area.kind === 'wave'}
								<span class="font-mono text-[11px] text-muted-foreground">{area.firstLapseLabel}</span>
							{/if}
						</div>
					</div>
				</li>
			{/each}
		</ol>
	{:else}
		<p class="font-serif text-[15px] leading-[22px]">{focus.emptyMessage}</p>
	{/if}
</ReportWorkspace.Section>
