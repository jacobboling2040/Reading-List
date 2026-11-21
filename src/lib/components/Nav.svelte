<script lang="ts">
	import { enhance } from '$app/forms';

	let { user }: { user: { displayName: string; isAdmin: boolean } } = $props();
</script>

<nav>
	<a href="/">For You</a>
	<a href="/search">Search</a>
	<a href="/shelves">Shelves</a>
	<a href="/people">People</a>
	<a href="/invite">Invite</a>
	<a href="/settings">Settings</a>
	{#if user.isAdmin}<a href="/admin">Admin</a>{/if}
	<form method="POST" action="/logout" use:enhance>
		<button>Log out</button>
	</form>
</nav>

<style>
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 1rem;
		align-items: center;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid #ddd;
	}
	form {
		margin-left: auto;
	}
</style>
