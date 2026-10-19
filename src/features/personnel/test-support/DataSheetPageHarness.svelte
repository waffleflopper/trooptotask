<script lang="ts">
	import type { ComponentProps } from 'svelte';
	import PersonnelDataSheetPageView from '../components/PersonnelDataSheetPageView.svelte';
	import { provideDataSheetEditSession } from '../workspace/dataSheetEditSession.svelte';

	let props: ComponentProps<typeof PersonnelDataSheetPageView> = $props();
	provideDataSheetEditSession();
</script>

<PersonnelDataSheetPageView {...props} />
