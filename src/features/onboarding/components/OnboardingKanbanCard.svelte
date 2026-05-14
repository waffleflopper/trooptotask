<script lang="ts">
	import type { OnboardingPageContext } from '../contexts/OnboardingPageContext.svelte';
	import type { PersonnelOnboarding } from '../onboarding.types';
	import { formatDisplayDate } from '$lib/utils/dates';
	import { Avatar } from '$lib/components/ui/avatar';
	import { Progress } from '$lib/components/ui/progress';
	import * as KanbanBoard from '$lib/components/ui/kanban-board';

	interface Props {
		ctx: OnboardingPageContext;
		onboarding: PersonnelOnboarding;
		selected: boolean;
		onclick: () => void;
	}

	let { ctx, onboarding, selected, onclick }: Props = $props();

	const name = $derived(ctx.getPersonName(onboarding.personnelId));
	const initials = $derived.by(() => {
		const parts = name.split(/[\s,]+/).filter(Boolean);
		if (parts.length < 3)
			return parts
				.map((w) => w[0])
				.join('')
				.toUpperCase();
		const lastName = parts[1];
		const firstName = parts[2];
		return `${firstName[0]}${lastName[0]}`.toUpperCase();
	});
	const progress = $derived(ctx.getProgress(onboarding));
	const pct = $derived(progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0);
</script>

<KanbanBoard.Card {selected} {onclick}>
	<div class="flex items-start gap-3">
		<Avatar {initials} size="md" />
		<div class="min-w-0 flex-1">
			<p class="truncate text-sm font-medium">{name}</p>
			<p class="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
				{ctx.getTemplateName(onboarding.templateId)}
			</p>
		</div>
	</div>
	<div class="mt-3 flex items-center gap-2">
		<Progress value={pct} class="flex-1" />
		<span class="font-mono text-[10px] text-muted-foreground">{pct}%</span>
	</div>
	<p class="mt-1.5 font-mono text-[10px] text-muted-foreground">
		Started {formatDisplayDate(onboarding.startedAt)}
	</p>
</KanbanBoard.Card>
