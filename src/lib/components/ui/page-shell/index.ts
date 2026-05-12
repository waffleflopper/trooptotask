import PageShell from './page-shell.svelte';
import PageHeader from './page-header.svelte';
import RouteTabs from './route-tabs.svelte';
import FactGrid from './fact-grid.svelte';
import FactRow from './fact-row.svelte';
import FactMetric from './fact-metric.svelte';
import SummaryRail from './summary-rail.svelte';
import SummaryRailSection from './summary-rail-section.svelte';
import StickyActionBar from './sticky-action-bar.svelte';

export {
	PageShell,
	PageHeader,
	RouteTabs,
	FactGrid,
	FactRow,
	FactMetric,
	SummaryRail,
	SummaryRailSection,
	StickyActionBar
};

export {
	PageShell as Root,
	PageHeader as Header,
	RouteTabs as Tabs,
	FactMetric as Metric,
	SummaryRailSection as RailSection
};

export type { PageShellDensity, PageShellWidth } from './page-shell.svelte';
export type { RouteTabItem } from './route-tabs.svelte';
export type { FactGridLayout } from './fact-grid.svelte';
