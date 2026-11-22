<script lang="ts">
	import { pending } from '../../../lib/pending';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>People</title></svelte:head>

<main class="page">
	<h1>People</h1>
	<p class="page-intro">Follow friends to see what they loved in For You.</p>
	{#if form?.message}<p class="callout error" role="alert">{form.message}</p>{/if}

	{#if data.members.length === 0}
		<p class="empty">Nobody else is here yet. Send an invite.</p>
	{:else}
		<ul class="list">
			{#each data.members as m (m.id)}
				<li class="card member" data-username={m.username}>
					<a href="/u/{m.username}">
						<strong>{m.displayName}</strong> <span class="muted">@{m.username}</span>
					</a>
					<form method="POST" action={m.following ? '?/unfollow' : '?/follow'} use:pending>
						<input type="hidden" name="userId" value={m.id} />
						<button class={m.following ? 'button-quiet' : ''}>
							{m.following ? 'Unfollow' : 'Follow'}
						</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.member {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}
	.member a {
		color: inherit;
		text-decoration: none;
	}
	.member form {
		margin: 0;
	}
</style>
