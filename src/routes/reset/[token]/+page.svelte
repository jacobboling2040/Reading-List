<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
</script>

<svelte:head><title>Reset password</title></svelte:head>

<main class="auth">
	<h1>Reset password</h1>
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
	<form method="POST" use:enhance>
		<label>New password <input name="password" type="password" autocomplete="new-password" required minlength="10" maxlength="256" /></label>
		<button>Set password</button>
	</form>
</main>
