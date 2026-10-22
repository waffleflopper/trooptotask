<script lang="ts">
	import XIcon from '@lucide/svelte/icons/x';
	import { FEATURE_SWITCHES, type FeatureKey } from '$lib/access/featureSwitches';
	import { Button } from '$lib/components/ui/button';
	import type { SetupHint } from '../sections/dashboardSections';
	import { readDismissedSetupHints, writeDismissedSetupHints } from '../setupHintDismissals';

	interface Props {
		hints: readonly SetupHint[];
		orgId: string;
		userId: string;
	}

	let { hints, orgId, userId }: Props = $props();

	let dismissedNow = $state.raw<{ key: string; features: readonly FeatureKey[] } | null>(null);
	const key = $derived(`${orgId}:${userId}`);
	const dismissed = $derived(
		dismissedNow?.key === key ? dismissedNow.features : readDismissedSetupHints(orgId, userId)
	);
	const visible = $derived(hints.filter((hint) => !dismissed.includes(hint.feature)));

	function dismiss(feature: FeatureKey) {
		const features = [...dismissed, feature];
		dismissedNow = { key, features };
		writeDismissedSetupHints(orgId, userId, features);
	}

	const LINK = 'text-sm leading-5 font-medium underline decoration-1 underline-offset-2';
</script>

{#each visible as hint (hint.feature)}
	<div
		class="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-[4px] border border-dashed border-border px-4 py-3"
		data-setup-hint={hint.feature}
	>
		<span class="shrink-0 font-mono text-[11px] tracking-[0.08em] text-muted-foreground uppercase">Admins only</span>
		<p class="min-w-[min(100%,16rem)] flex-1 text-sm leading-5 text-secondary-foreground">{hint.message}</p>
		<a href={hint.fix.href} class="{LINK} text-foreground">{hint.fix.label}</a>
		<a href={hint.turnOff.href} class="{LINK} text-muted-foreground">{hint.turnOff.label}</a>
		<Button
			variant="ghost"
			size="icon-xs"
			class="text-muted-foreground"
			aria-label="Dismiss the {FEATURE_SWITCHES[hint.feature].label} hint"
			onclick={() => dismiss(hint.feature)}
		>
			<XIcon aria-hidden="true" />
		</Button>
	</div>
{/each}
