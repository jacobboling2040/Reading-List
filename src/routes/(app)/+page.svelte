<script lang="ts">
	import { enhance } from '$app/forms';
	import BookCard from '../../lib/components/BookCard.svelte';
	import Stars from '../../lib/components/Stars.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>For You</title></svelte:head>

<main class="page">
	<h1>For You</h1>
	<p class="page-intro">Books the people you follow loved.</p>

	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

	{#if !data.followsAnyone}
		<div class="empty">
			<p>Follow some friends to see what they loved.</p>
			<a class="button" href="/people">Find people</a>
		</div>
	{:else if data.cards.length === 0}
		<p class="empty">Nothing new from the people you follow yet.</p>
	{:else}
		<ul class="list">
			{#each data.cards as card (card.book.id)}
				<li>
					<BookCard book={card.book}>
						<p class="why">
							<span class="muted">Loved by</span>
							{#each card.lovers as lover, i (lover.username)}
								{#if i > 0}<span class="sep" aria-hidden="true">·</span>{/if}
								<span class="lover">
									<a href="/u/{lover.username}">{lover.displayName}</a>
									<Stars rating={lover.rating} />
								</span>
							{/each}
						</p>
						{#if card.snippet}
							<figure class="snippet">
								<blockquote>{card.snippet.body}</blockquote>
								<figcaption>— {card.snippet.displayName}</figcaption>
							</figure>
						{/if}
						<div class="actions">
							<form method="POST" action="?/toRead" use:enhance>
								<input type="hidden" name="bookId" value={card.book.id} />
								<button>+ To-read</button>
							</form>
							<form method="POST" action="?/dismiss" use:enhance>
								<input type="hidden" name="bookId" value={card.book.id} />
								<button class="button-quiet">Not for me</button>
							</form>
						</div>
					</BookCard>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.empty .button {
		margin-top: var(--space-2);
		font-family: var(--font-sans);
		font-size: 1rem;
	}
	.why {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-2);
		margin-bottom: var(--space-2);
	}
	.lover {
		display: inline-flex;
		align-items: baseline;
		gap: var(--space-1);
		white-space: nowrap;
	}
	.lover a {
		color: inherit;
		font-weight: 600;
	}
	.sep {
		color: var(--color-ink-soft);
	}
	.snippet {
		margin: 0 0 var(--space-3);
	}
	blockquote {
		margin: 0;
		font-family: var(--font-serif);
		font-style: italic;
		font-size: 1.05rem;
		border-left: 3px solid var(--color-accent-soft);
		padding-left: var(--space-3);
	}
	blockquote::before {
		content: '“';
	}
	blockquote::after {
		content: '”';
	}
	figcaption {
		color: var(--color-ink-soft);
		font-size: 0.9rem;
		padding-left: var(--space-3);
	}
</style>
