<script lang="ts">
	import { setContext } from 'svelte';
	import ToolbarActions from './ToolbarActions.svelte';
	import { toolbarCoordinatorKey, type ToolbarCoordinator } from './toolbarCoordinator';
	import type { ToolbarAction, ToolbarActionMeasurement } from './toolbar.types';

	interface Props {
		availableActionWidth?: number | null;
		actions: ToolbarAction[];
		actionMeasurements?: Record<string, ToolbarActionMeasurement>;
	}

	let { availableActionWidth = null, actions, actionMeasurements = {} }: Props = $props();
	let openPanelId = $state<string | null>(null);

	const coordinator: ToolbarCoordinator = {
		get openPanelId() {
			return openPanelId;
		},
		compactPhase: 'full',
		get availableActionWidth() {
			return availableActionWidth;
		},
		requestPanel(panelId: string) {
			openPanelId = panelId;
		},
		closePanel(panelId: string) {
			if (openPanelId === panelId) {
				openPanelId = null;
			}
		},
		closeAllPanels() {
			openPanelId = null;
		}
	};

	setContext(toolbarCoordinatorKey, coordinator);
</script>

<ToolbarActions {actions} ariaLabel="Measured actions" overflowAriaLabel="More measured actions" {actionMeasurements} />
