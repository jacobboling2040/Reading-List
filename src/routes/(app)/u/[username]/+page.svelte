<script lang="ts">
	import { enhance } from '$app/forms';
	import BookCard from '../../../../lib/components/BookCard.svelte';
	import Stars from '../../../../lib/components/Stars.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const p = $derived(data.profile);
</script>

<svelte:head><title>{p.displayName}</title></svelte:head>

<main class="page">
	<header class="head">
		<div>
			<h1>{p.displayName}</h1>
			<p class="muted">@{p.username}</p>
		</div>
		{#if data.isSelf}
			<a class="button button-quiet" href="/settings">Edit your settings</a>
		{:else}
			<form method="POST" action={data.following ? '?/unfollow' : '?/follow'} use:enhance>
				<button class={data.following ? 'button-quiet' : ''}>
					{data.following ? 'Unfollow' : 'Follow'}
				</button>
			</form>
		{/if}
	</header>
	{#if form?.message}<p class="callout error" role="alert">{form.message}</p>{/if}

	<section>
		<h2>Reading now</h2>
		{#if p.readingNow.length === 0}
			<p class="muted">Not reading anything right now.</p>
		{:else}
			<ul class="list">
				{#each p.readingNow as book (book.id)}
					<li><BookCard {book} size="sm" /></li>
				{/each}
			</ul>
		{/if}
	</section>

	<p class="counts">
		<span>To-read ({p.counts.to_read})</span>
		<span>Finished ({p.counts.finished})</span>
	</p>

	<section>
		<h2>Recent reviews</h2>
		{#if p.recentReviews.length === 0}
			<p class="muted">No reviews yet.</p>
		{:else}
			<ul class="list">
				{#each p.recentReviews as r (r.book.id)}
					<li>
						<BookCard book={r.book} size="sm">
							<Stars rating={r.rating} />
							{#if r.body}<p class="body">{r.body}</p>{/if}
						</BookCard>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}
	.head form {
		margin: 0;
	}
	.counts {
		display: flex;
		gap: var(--space-5);
		font-family: var(--font-serif);
		font-size: 1.2rem;
		font-weight: 600;
		margin-bottom: var(--space-5);
	}
	section {
		margin-bottom: var(--space-5);
	}
	.body {
		white-space: pre-line;
		margin: var(--space-2) 0 0;
	}
</style>
