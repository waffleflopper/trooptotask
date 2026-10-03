<script lang="ts">
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
</script>

<section class="p-6 max-sm:p-2">
	<Alert.Root variant="destructive">
		<Alert.Title>Unable to load Dashboard</Alert.Title>
		<Alert.Description>Dashboard data could not be loaded. Please try again.</Alert.Description>
		<div class="mt-3">
			<Button variant="outline" onclick={() => window.location.reload()}>Retry Dashboard</Button>
		</div>
	</Alert.Root>
</section>
