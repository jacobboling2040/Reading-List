<script lang="ts">
	import { enhance } from '$app/forms';
	import { fade } from 'svelte/transition';
	import BookCard from '../../../lib/components/BookCard.svelte';
	import ShelfTabs from '../../../lib/components/ShelfTabs.svelte';
	import { SHELF_LABELS } from '../../../lib/format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let tab = $state(data.tab);
	// Re-sync only when the server's tab changes; invalidation after a form action
	// re-runs load with the original URL and must not undo a client-side tab switch.
	let serverTab = data.tab;
	$effect(() => {
		if (data.tab !== serverTab) {
			serverTab = data.tab;
			tab = data.tab;
		}
	});
	const books = $derived(data.shelves[tab]);
	const fadeMs = () =>
		typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
			? 0
			: 120;

	const statuses = ['to_read', 'reading', 'finished'] as const;
	const empty = {
		to_read: 'Nothing here yet. Add books you want to read from For You or Search.',
		reading: 'Nothing here yet. Move a book here when you start it.',
		finished: 'Nothing here yet. Books you finish will gather here.'
	} as const;
</script>

<svelte:head><title>{SHELF_LABELS[tab]} · Shelves</title></svelte:head>

<main class="page">
	<h1>My shelves</h1>

	<ShelfTabs
		counts={data.counts}
		active={tab}
		href={(s) => `/shelves?tab=${s}`}
		onselect={(s) => (tab = s)}
		label="Shelves"
	/>

	{#if form?.message}<p class="callout error" role="alert">{form.message}</p>{/if}

	{#key tab}
		<div in:fade={{ duration: fadeMs() }}>
			{#if books.length === 0}
				<p class="empty">{empty[tab]}</p>
			{:else}
				<ul class="list">
					{#each books as book (book.id)}
						<li>
							<BookCard {book} size="sm">
								<div class="actions">
									<form class="moves" method="POST" action="?/move" use:enhance>
										<input type="hidden" name="bookId" value={book.id} />
										<span class="muted move-label">Move to</span>
										{#each statuses.filter((s) => s !== tab) as s (s)}
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
		</div>
	{/key}
</main>

<style>
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
