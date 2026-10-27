<script
	lang="ts"
	generics="C extends import('./types').ImportColumns, Refs extends import('./types').ImportReferences<C>, Change"
>
	import { onDestroy, untrack } from 'svelte';
	import { beforeNavigate, goto, pushState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as PageShell from '$lib/components/patterns/page-shell';
	import { ConfirmDialog } from '$lib/components/ui/confirm-dialog';
	import { toastStore } from '$lib/stores/toast.svelte';
	import type { ImportLane } from './types';
	import { ImportSession } from './importSession.svelte';
	import { STEPS, stepIndex, type FlowSession, type FlowStep } from './flowTypes';
	import ImportStepper from './import-stepper.svelte';
	import ImportFlowSkeleton from './import-flow-skeleton.svelte';
	import FileStep from './steps/file-step.svelte';
	import ColumnsStep from './steps/columns-step.svelte';
	import ReviewStep from './steps/review-step.svelte';
	import DoneStep from './steps/done-step.svelte';

	let {
		lane,
		title,
		eyebrow,
		embedded = false
	}: {
		/** Null while the lane's reference data loads; the flow keeps its footprint. */
		lane: ImportLane<C, Refs, Change> | null;
		title: string;
		eyebrow?: string;
		/** Inside another page: a section heading in place of the page shell and its page title. */
		embedded?: boolean;
	} = $props();

	const typed = new ImportSession<C, Refs, Change>(() => {
		if (!lane) throw new Error('The import lane is not loaded.');
		return lane;
	});
	const session = typed as unknown as FlowSession;

	const shownStep = $derived<FlowStep>(session.phase.step === 'committing' ? 'review' : session.phase.step);
	const historyStep = $derived<FlowStep>(page.state.importStep ?? 'file');

	$effect(() => {
		const step = shownStep;
		untrack(() => {
			const current = historyStep;
			if (step === current) return;
			const distance = stepIndex(step) - stepIndex(current);
			if (distance > 0) pushState('', { importStep: step === 'file' ? undefined : step });
			else history.go(distance);
		});
	});

	$effect(() => {
		const step = historyStep;
		untrack(() => {
			if (step === shownStep || step === 'done') return;
			if (session.phase.step === 'committing') pushState('', { importStep: 'review' });
			else session.goTo(step);
		});
	});

	let leaving = false;
	let leaveTarget = $state.raw<{ url: URL; delta?: number } | null>(null);

	beforeNavigate((navigation) => {
		if (leaving || !session.dirty) return;
		navigation.cancel();
		if (navigation.willUnload || !navigation.to) return;
		if (session.phase.step === 'committing') {
			toastStore.info('Your import is still saving. You can leave when it finishes.');
			return;
		}
		leaveTarget = { url: navigation.to.url, delta: navigation.type === 'popstate' ? navigation.delta : undefined };
	});

	async function leave(target: { url: URL; delta?: number }) {
		leaving = true;
		leaveTarget = null;
		if (target.delta) history.go(target.delta);
		else await goto(resolve((target.url.pathname + target.url.search) as '/'));
	}

	function back() {
		const previous = STEPS[stepIndex(shownStep) - 1]?.step;
		if (!previous || previous === 'done') return;
		if (historyStep === shownStep) history.back();
		else session.goTo(previous);
	}

	onDestroy(() => session.startOver());
</script>

{#if embedded}
	<section class="grid min-w-0 gap-6" aria-labelledby="import-flow-heading">
		<PageShell.SectionHeader id="import-flow-heading" {title} {eyebrow} size="compact" ruled>
			{#snippet action()}
				<ImportStepper current={shownStep} />
			{/snippet}
		</PageShell.SectionHeader>
		{@render flow()}
	</section>
{:else}
	<PageShell.Root width="wide" class="pb-28 lg:pb-6">
		<PageShell.Header {title} {eyebrow} variant="display">
			{#snippet aside()}
				<ImportStepper current={shownStep} />
			{/snippet}
		</PageShell.Header>
		{@render flow()}
	</PageShell.Root>
{/if}

{#snippet flow()}
	{#if !lane}
		<ImportFlowSkeleton />
	{:else if session.phase.step === 'file'}
		<FileStep {session} />
	{:else if session.phase.step === 'columns'}
		<ColumnsStep {session} onBack={back} />
	{:else if session.phase.step === 'review' || session.phase.step === 'committing'}
		<ReviewStep {session} onBack={back} />
	{:else}
		<DoneStep {session} receipt={session.phase.receipt} />
	{/if}
{/snippet}

{#if leaveTarget}
	{@const target = leaveTarget}
	<ConfirmDialog
		title="Leave this import?"
		message="Nothing from this file has been saved. Leaving discards the file and your fixes."
		confirmLabel="Leave import"
		cancelLabel="Keep importing"
		onConfirm={() => void leave(target)}
		onCancel={() => (leaveTarget = null)}
	/>
{/if}
