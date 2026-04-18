<script lang="ts">
	import ReportChartSection from './ReportChartSection.svelte';

	interface Props {
		loading?: boolean;
	}

	let { loading = false }: Props = $props();
</script>

<ReportChartSection
	title="Readiness Trend"
	titleId="test-chart-title"
	description="Screen reader description for the chart."
	descriptionId="test-chart-description"
	kicker="% current"
	{loading}
>
	<p>The chart body renders here.</p>
</ReportChartSection>
