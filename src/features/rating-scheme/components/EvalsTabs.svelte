<script lang="ts">
	import * as PageShell from '$lib/components/patterns/page-shell';

	interface Props {
		orgId: string;
		section: 'rating-scheme' | 'tracker';
		/** Open Evaluations past their thru date; the Eval Tracker tab flags them. */
		pastThru?: number;
	}

	let { orgId, section, pastThru = 0 }: Props = $props();

	const tabs = $derived<PageShell.RouteTabItem[]>([
		{
			label: 'Rating Scheme',
			href: `/org/${orgId}/evals/rating-scheme`,
			active: section === 'rating-scheme'
		},
		{
			label: 'Eval Tracker',
			href: `/org/${orgId}/evals`,
			active: section === 'tracker',
			badge: pastThru > 0 ? { value: pastThru, label: `${pastThru} past thru`, variant: 'destructive' } : undefined
		}
	]);
</script>

<PageShell.Tabs label="Evals views" items={tabs} />
