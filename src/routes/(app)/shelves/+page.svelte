<script lang="ts">
	import { enhance } from '$app/forms';
	import BookCard from '../../../lib/components/BookCard.svelte';
	import { SHELF_LABELS } from '../../../lib/format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const statuses = ['to_read', 'reading', 'finished'] as const;
	const empty = {
		to_read: 'Nothing here yet. Add books you want to read from For You or Search.',
		reading: 'Nothing here yet. Move a book here when you start it.',
		finished: 'Nothing here yet. Books you finish will gather here.'
	} as const;
</script>

<svelte:head><title>{SHELF_LABELS[data.tab]} · Shelves</title></svelte:head>

<main class="page">
	<h1>My shelves</h1>

	<nav class="tabs" aria-label="Shelves">
		{#each statuses as s (s)}
			<a href="/shelves?tab={s}" aria-current={data.tab === s ? 'page' : undefined}>
				{SHELF_LABELS[s]} <span class="count">{data.counts[s]}</span>
			</a>
		{/each}
	</nav>

	{#if form?.message}<p class="callout error" role="alert">{form.message}</p>{/if}

	{#if data.books.length === 0}
		<p class="empty">{empty[data.tab]}</p>
	{:else}
		<ul class="list">
			{#each data.books as book (book.id)}
				<li>
					<BookCard {book} size="sm">
						<div class="actions">
							<form class="moves" method="POST" action="?/move" use:enhance>
								<input type="hidden" name="bookId" value={book.id} />
								<span class="muted move-label">Move to</span>
								{#each statuses.filter((s) => s !== data.tab) as s (s)}
									<button class="button-quiet" name="status" value={s}>{SHELF_LABELS[s]}</button>
								{/each}
							</form>
							<form method="POST" action="?/remove" use:enhance>
								<input type="hidden" name="bookId" value={book.id} />
								<button class="link-button">Remove</button>
							</form>
						</div>
					</BookCard>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.tabs {
		display: flex;
		border-bottom: 1px solid var(--color-line);
		margin-bottom: var(--space-5);
	}
	.tabs a {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-height: var(--tap);
		padding: 0 var(--space-1);
		white-space: nowrap;
		color: var(--color-ink-soft);
		text-decoration: none;
		font-weight: 600;
		border-bottom: 3px solid transparent;
		margin-bottom: -1px;
	}
	.tabs a[aria-current='page'] {
		color: var(--color-ink);
		border-bottom-color: var(--color-accent);
	}
	.count {
		font-size: 0.8rem;
		font-weight: 500;
		min-width: 1.5rem;
		padding: 0 var(--space-1);
		border-radius: 999px;
		background: var(--color-surface-sunk);
		text-align: center;
	}
	.moves {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}
	.move-label {
		font-size: 0.9rem;
	}
	.moves button {
		padding-inline: var(--space-3);
	}
</style>
