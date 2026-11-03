<script lang="ts">
	import type { AssignmentType } from '$features/calendar/contracts';
	import { ON_SHARE_BAND, type AssignmentLoadReport } from '../../utils/assignmentLoad';

	interface Props {
		report: AssignmentLoadReport;
	}

	let { report }: Props = $props();

	const typeById = $derived(new Map<string, AssignmentType>(report.dutyTypes.map((type) => [type.id, type])));
	const percent = (count: number, of: number) => `${of > 0 ? (count / of) * 100 : 0}%`;
</script>

<div class="min-w-0">
	<ul class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Bar key">
		<li class="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
			<span class="size-2.5 rounded-[1px] bg-foreground/35" aria-hidden="true"></span>Under
		</li>
		<li class="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
			<span class="size-2.5 rounded-[1px] bg-foreground/10" aria-hidden="true"></span>On share
		</li>
		<li class="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
			<span class="size-2.5 rounded-[1px] bg-warning" aria-hidden="true"></span>Over
		</li>
		<li class="font-mono text-[11px] text-muted-foreground">
			People by their count of the duty against their fair share, {ON_SHARE_BAND} duty either way is on share
		</li>
	</ul>
	<ul aria-label="Spread of each duty">
		{#each report.duties as duty (duty.assignmentTypeId)}
			{@const type = typeById.get(duty.assignmentTypeId)}
			<li
				class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-border py-3 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5rem]"
			>
				<div class="min-w-0">
					<p class="flex items-center gap-2 font-serif text-[15px] font-medium">
						<span
							class="size-2.5 shrink-0 rounded-[1px]"
							style:background-color={type?.color ?? '#999'}
							aria-hidden="true"
						></span>
						<span class="truncate">{type?.name ?? 'Unknown'}</span>
					</p>
					<p class="font-mono text-[11px] text-muted-foreground">
						{duty.eligible} eligible · {duty.duties}
						{duty.duties === 1 ? 'duty' : 'duties'}
					</p>
				</div>
				<p class="text-right font-mono text-xs md:order-last">
					<span class={[duty.never > 0 && 'text-warning-foreground']}>{duty.never} never</span>
				</p>
				<div
					class="col-span-2 flex h-3 overflow-hidden bg-foreground/10 md:col-span-1"
					role="img"
					aria-label="{type?.name ??
						'Unknown'}: {duty.under} under, {duty.onShare} on share, {duty.over} over their fair share"
				>
					<span class="h-full bg-foreground/35" style:width={percent(duty.under, duty.eligible)}></span>
					<span class="h-full" style:width={percent(duty.onShare, duty.eligible)}></span>
					<span class="h-full bg-warning" style:width={percent(duty.over, duty.eligible)}></span>
				</div>
			</li>
		{/each}
	</ul>
</div>
