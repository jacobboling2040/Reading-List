<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const user = $derived(data.user!);
</script>

<svelte:head><title>Settings</title></svelte:head>

<main class="page">
	<h1>Settings</h1>

	<section class="card">
		<h2>Display name</h2>
		<form class="stack" method="POST" action="?/name" use:enhance>
			<label>Display name <input name="displayName" required maxlength="40" value={user.displayName} /></label>
			{#if form?.section === 'name'}
				{#if form.message}<p class="error" role="alert">{form.message}</p>{/if}
				{#if form.saved}<p class="notice" role="status">{form.saved}</p>{/if}
			{/if}
			<button>Save name</button>
		</form>
	</section>

	<section class="card">
		<h2>Password</h2>
		<form class="stack" method="POST" action="?/password" use:enhance>
			<label>Current password <input name="current" type="password" autocomplete="current-password" required /></label>
			<label>New password <input name="next" type="password" autocomplete="new-password" required minlength="10" maxlength="256" /></label>
			{#if form?.section === 'password'}
				{#if form.message}<p class="error" role="alert">{form.message}</p>{/if}
				{#if form.saved}<p class="notice" role="status">{form.saved}</p>{/if}
			{/if}
			<button>Change password</button>
		</form>
		<p class="hint">Changing your password signs you out on your other devices.</p>
	</section>

	<section class="card">
		<h2>More</h2>
		<p><a href="/invite">Invite a friend</a></p>
		{#if user.isAdmin}<p><a href="/admin">Admin</a></p>{/if}
		<form method="POST" action="/logout" use:enhance>
			<button>Log out</button>
		</form>
	</section>

	<section class="card danger">
		<h2>Delete account</h2>
		<p>
			This permanently deletes your shelves, reviews and follows. Your username
			<strong>{user.username}</strong> becomes free again.
		</p>
		<form class="stack" method="POST" action="?/delete" use:enhance>
			<label>Type your username to confirm <input name="confirm" autocomplete="off" required /></label>
			{#if form?.section === 'delete' && form.message}<p class="error" role="alert">{form.message}</p>{/if}
			<button>Delete my account</button>
		</form>
	</section>
</main>

<style>
	section {
		margin-bottom: var(--space-5);
	}
	.danger {
		border-color: var(--color-error);
	}
</style>
