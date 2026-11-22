<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Log in</title></svelte:head>

<main class="auth">
	<h1>Log in</h1>
	{#if data.notice}<p class="notice" role="status">{data.notice}</p>{/if}
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}
	<form method="POST" use:enhance>
		<input type="hidden" name="next" value={data.next} />
		<label>Username <input name="username" autocomplete="username" required value={form?.username ?? ''} /></label>
		<label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
		<button>Log in</button>
	</form>
	<p class="hint">Joining is by invite only.</p>
</main>
