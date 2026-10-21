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
	<p class="text-sm text-muted-foreground">Rank catalog settings are not available.</p>
{/if}
