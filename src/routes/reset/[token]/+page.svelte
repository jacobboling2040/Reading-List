<script lang="ts">
	import { pending } from '../../../lib/pending';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Reset password</title></svelte:head>

<main class="auth">
	<h1>Reset password</h1>
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
	{#if !data.valid && !form?.message}
		<p class="error" role="alert">This reset link has expired or was already used.</p>
	{:else if data.valid}
	<form method="POST" use:pending>
		<label>New password <input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="256" /></label>
		<button>Set password</button>
	</form>
	{/if}
</main>
