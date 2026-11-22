<script lang="ts">
	import { pending } from '../../../lib/pending';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Join</title></svelte:head>

<main class="auth">
	<h1>Join</h1>
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
	{#if !data.valid && !form?.message}
		<p class="error" role="alert">This invite link has expired or was already used.</p>
	{:else if data.valid}
		<form method="POST" use:pending>
			<label>Username <input name="username" autocomplete="username" required minlength="3" maxlength="20" value={form?.username ?? ''} /></label>
			<label>Display name <input name="displayName" autocomplete="name" required maxlength="40" value={form?.displayName ?? ''} /></label>
			<label>Password <input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="256" /></label>
			<button>Join</button>
		</form>
	{/if}
</main>
