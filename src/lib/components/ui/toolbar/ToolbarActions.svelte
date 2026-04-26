<script lang="ts">
	import { onMount, tick } from 'svelte';
	import ToolbarOverflowMenu from '$lib/components/ui/ToolbarOverflowMenu.svelte';
	import ToolbarAction from './ToolbarAction.svelte';
	import { getToolbarCoordinator } from './toolbarCoordinator';
	import { computeToolbarActionLayout } from './toolbarLayout';
	import type { OverflowItem } from '$lib/components/ui/OverflowMenu.types';
	import type {
		MeasuredToolbarAction,
		ToolbarAction as ToolbarActionConfig,
		ToolbarActionState,
		ToolbarActionMeasurement
	} from './toolbar.types';

	type VisibleToolbarActionState = ToolbarActionState & { mode: 'full' | 'compact' };

	interface Props {
		actions: ToolbarActionConfig[];
		ariaLabel: string;
		overflowAriaLabel: string;
		overflowLabel?: string;
		overflowIconOnly?: boolean;
		containerWidth?: number;
		actionMeasurements?: Record<string, ToolbarActionMeasurement>;
	}

	let {
		actions,
		ariaLabel,
		overflowAriaLabel,
		overflowLabel = 'More',
		overflowIconOnly = true,
		containerWidth,
		actionMeasurements = {}
	}: Props = $props();

	let hostEl: HTMLElement | undefined = $state();
	let measureEl: HTMLElement | undefined = $state();
	let measuredContainerWidth = $state<number | null>(null);
	let measuredOverflowWidth = $state(40);
	let measuredActions = $state<Record<string, ToolbarActionMeasurement>>({});
	const coordinator = getToolbarCoordinator();

	const resolvedActions = $derived<MeasuredToolbarAction[]>(
		actions.map((action) => {
			const measurement = actionMeasurements[action.id] ?? measuredActions[action.id] ?? getFallbackMeasurement(action);
			return {
				...action,
				fullWidth: measurement.fullWidth,
				compactWidth: measurement.compactWidth
			};
		})
	);

	const layout = $derived(
		computeToolbarActionLayout({
			containerWidth:
				containerWidth ?? coordinator?.availableActionWidth ?? measuredContainerWidth ?? Number.MAX_SAFE_INTEGER,
			actions: resolvedActions,
			overflowWidth: measuredOverflowWidth,
			gapWidth: 8
		})
	);
	const visibleStates = $derived(layout.states.filter(isVisibleState));
	const overflowItems = $derived(
		layout.overflowActions.flatMap<OverflowItem>((action) => {
			if (action.menuItems?.length) {
				return action.menuItems.map((item, index) => ({
					...item,
					group: item.group ?? (index === 0 ? action.label : undefined),
					disabled: action.disabled || item.disabled,
					disabledReason: action.disabledReason ?? item.disabledReason
				}));
			}

			return [
				{
					label: action.label,
					href: action.href,
					onclick: action.onclick,
					toggle: action.toggle,
					active: action.active,
					disabled: action.disabled,
					disabledReason: action.disabledReason
				}
			];
		})
	);

	function getFallbackMeasurement(action: ToolbarActionConfig): ToolbarActionMeasurement {
		return {
			fullWidth: Math.max(76, action.label.length * 8 + (action.icon ? 48 : 32)),
			compactWidth: action.icon ? 40 : Math.max(76, action.label.length * 8 + 32)
		};
	}

	function isVisibleState(state: ToolbarActionState): state is VisibleToolbarActionState {
		return state.mode !== 'overflow';
	}

	function measureLayout() {
		if (containerWidth !== undefined) {
			return;
		} else if (hostEl) {
			const width = hostEl.getBoundingClientRect().width || hostEl.clientWidth;
			measuredContainerWidth = width > 0 ? width : null;
		}

		if (!measureEl) return;

		const nextMeasurements: Record<string, ToolbarActionMeasurement> = {};
		for (const element of measureEl.querySelectorAll<HTMLElement>('[data-measure-action]')) {
			const id = element.dataset.measureAction;
			if (!id) continue;
			const full = element.querySelector<HTMLElement>('[data-measure-full]');
			const compact = element.querySelector<HTMLElement>('[data-measure-compact]');
			nextMeasurements[id] = {
				fullWidth:
					full?.getBoundingClientRect().width ||
					full?.clientWidth ||
					getFallbackMeasurement({ id, label: id }).fullWidth,
				compactWidth:
					compact?.getBoundingClientRect().width ||
					compact?.clientWidth ||
					getFallbackMeasurement({ id, label: id, icon: 'download' }).compactWidth
			};
		}
		measuredActions = nextMeasurements;

		const overflowTrigger = measureEl.querySelector<HTMLElement>('[data-measure-overflow]');
		measuredOverflowWidth = overflowTrigger?.getBoundingClientRect().width || overflowTrigger?.clientWidth || 40;
	}

	$effect(() => {
		for (const warning of layout.warnings) {
			console.warn(`[ToolbarActions] ${warning}`);
		}
	});

	$effect(() => {
		actions.length;
		containerWidth;

		if (typeof window === 'undefined') return;
		const frame = window.requestAnimationFrame(() => measureLayout());
		return () => window.cancelAnimationFrame(frame);
	});

	onMount(() => {
		if (typeof window === 'undefined') return;

		const resizeObserver =
			typeof ResizeObserver === 'undefined'
				? null
				: new ResizeObserver(() => {
						measureLayout();
					});

		for (const element of [hostEl, measureEl]) {
			if (element) resizeObserver?.observe(element);
		}

		function handleResize() {
			measureLayout();
		}

		window.addEventListener('resize', handleResize);
		tick().then(measureLayout);

		return () => {
			resizeObserver?.disconnect();
			window.removeEventListener('resize', handleResize);
		};
	});
</script>

<div class="toolbar-actions" role="group" aria-label={ariaLabel} bind:this={hostEl}>
	{#each visibleStates as state (state.action.id)}
		<ToolbarAction action={state.action} mode={state.mode} />
	{/each}

	{#if overflowItems.length > 0}
		<ToolbarOverflowMenu
			ariaLabel={overflowAriaLabel}
			label={overflowLabel}
			iconOnly={overflowIconOnly}
			items={overflowItems}
		/>
	{/if}

	<div class="toolbar-actions__measure" aria-hidden="true" bind:this={measureEl}>
		{#each actions as action (action.id)}
			<div data-measure-action={action.id}>
				<span data-measure-full class="toolbar-actions__measure-action">
					<ToolbarAction {action} mode="full" descriptionIdSuffix="-measure-full" />
				</span>
				<span data-measure-compact class="toolbar-actions__measure-action">
					<ToolbarAction {action} mode={action.icon ? 'compact' : 'full'} descriptionIdSuffix="-measure-compact" />
				</span>
			</div>
		{/each}
		<div data-measure-overflow>
			<ToolbarOverflowMenu ariaLabel={overflowAriaLabel} label={overflowLabel} iconOnly={overflowIconOnly} items={[]} />
		</div>
	</div>
</div>

<style>
	.toolbar-actions {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		flex-wrap: nowrap;
		gap: var(--sp-2);
		min-width: 0;
	}

	.toolbar-actions__measure {
		position: fixed;
		top: -1000px;
		left: -1000px;
		display: flex;
		align-items: center;
		gap: var(--sp-2);
		visibility: hidden;
		pointer-events: none;
		white-space: nowrap;
	}

	.toolbar-actions__measure-action {
		display: inline-flex;
	}
</style>
