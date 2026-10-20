<script lang="ts">
	import { SettingsPageHeader } from '$features/organization';
	import type { PageProps } from './$types';
	import RanksSettingsPage from '../RanksSettingsPage.svelte';

	type RanksPageProps = PageProps & {
		data: PageProps['data'] & {
			ranksSettings?: import('../settingsSectionTypes').RanksSettingsData;
		};
		form: { [key: string]: unknown; rankError?: string } | null;
	};

	let { data, form }: RanksPageProps = $props();
</script>

<SettingsPageHeader
	page="ranks"
	subtitle="The rank list behind every picker and import. Retiring a rank hides it from new choices; every record that already uses it stays as written."
/>

{#if data.ranksSettings}
	<RanksSettingsPage ranksSettings={data.ranksSettings} {form} />
{:else}
	<div class="grid max-w-5xl gap-4">
		<section class="grid gap-2 rounded-lg border bg-card p-4 text-card-foreground" aria-labelledby="ranks-unavailable">
			<h2 id="ranks-unavailable" class="text-lg font-semibold">Rank Catalog</h2>
			<p class="text-sm text-muted-foreground">Rank catalog settings are not available.</p>
		</section>
	</div>
{/if}
