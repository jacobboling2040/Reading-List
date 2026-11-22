<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { untrack } from 'svelte';
	import Cover from '../../../lib/components/Cover.svelte';
	import { SHELF_LABELS } from '../../../lib/format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const shelves = Object.entries(SHELF_LABELS);

	// Seeded once; the effect below keeps it in step with the URL when not typing.
	let value = $state(untrack(() => data.q));
	let input: HTMLInputElement;
	let timer: ReturnType<typeof setTimeout>;

	// Follow the URL (back/forward), but never overwrite what the user is typing.
	$effect(() => {
		const q = data.q;
		if (document.activeElement !== input) value = q;
	});

	function onInput() {
		clearTimeout(timer);
		const q = value.trim();
		if (q.length === 1) return;
		// SvelteKit drops the result of a navigation superseded by a newer one, so a slow
		// older response can't replace newer results.
		timer = setTimeout(
			() => goto('?q=' + encodeURIComponent(q), { replace: true, reset: false }),
			300
		);
	}

	// Keep the chosen shelf in the select after an add instead of snapping back to the first option.
	const keepChoice = () => async ({ update }: { update: (o: { reset: boolean }) => Promise<void> }) =>
		update({ reset: false });
</script>

<svelte:head><title>{data.q ? `${data.q} · Search` : 'Search'}</title></svelte:head>

<main class="page">
	<h1>Add a book</h1>
	<p class="page-intro">Search Open Library by title or author.</p>

	<form class="search" role="search" method="GET">
		<label class="visually-hidden" for="q">Find a book</label>
		<input
			id="q"
			name="q"
			type="search"
			bind:this={input}
			bind:value
			oninput={onInput}
			placeholder="Title or author"
			required
		/>
		<button>Search</button>
	</form>

	{#if data.searchError}<p class="callout error" role="alert">{data.searchError}</p>{/if}
	{#if form?.message}<p class="callout error" role="alert">{form.message}</p>{/if}

	{#if data.q && !data.searchError}
		{#if data.results.length === 0}
			<p class="empty">No matches for “{data.q}”. You can add it by hand below.</p>
		{:else}
			<h2 class="visually-hidden">Results</h2>
			<ul class="list results">
				{#each data.results as r (r.olWorkId)}
					<li class="card result">
						<Cover title={r.title} coverId={r.coverId} size="sm" />
						<div class="body">
							<h3>{r.title}</h3>
							<p class="muted">
								{r.authors.join(', ') || 'Unknown author'}
								{#if r.year}<span>· {r.year}</span>{/if}
							</p>
							{#if form?.added?.olWorkId === r.olWorkId}
								<p class="muted status" role="status">
									Added to {SHELF_LABELS[form.added.status]}
									· <a href="/books/{form.added.bookId}">View book</a>
									{#if form.added.status === 'finished'}
										· <a href="/books/{form.added.bookId}?review=1">Write a review</a>
									{/if}
								</p>
							{:else if data.onShelf[r.olWorkId]}
								<p class="muted status">On your {SHELF_LABELS[data.onShelf[r.olWorkId]]} shelf</p>
							{/if}
						</div>
						<form method="POST" action="?q={encodeURIComponent(data.q)}&/add" use:enhance={keepChoice}>
							<input type="hidden" name="q" value={data.q} />
							<input type="hidden" name="olWorkId" value={r.olWorkId} />
							<label>
								<span class="visually-hidden">Shelf for {r.title}</span>
								<select name="status" value={data.onShelf[r.olWorkId] ?? 'to_read'}>
									{#each shelves as [value, label] (value)}
										<option {value}>{label}</option>
									{/each}
								</select>
							</label>
							<button class="button-quiet">Add<span class="visually-hidden"> {r.title}</span></button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}

	<section class="manual card" aria-labelledby="manual-heading">
		<h2 id="manual-heading">Not finding it? Add it by hand.</h2>
		{#if form?.manualMessage}<p class="error" role="alert">{form.manualMessage}</p>{/if}
		<form class="stack" method="POST" action="?/manual" use:enhance>
			<label>Title <input name="title" required maxlength="200" value={form?.title ?? ''} /></label>
			<label>Author <input name="author" required maxlength="100" value={form?.author ?? ''} /></label>
			<label>
				Shelf
				<select name="status">
					{#each shelves as [value, label] (value)}
						<option {value}>{label}</option>
					{/each}
				</select>
			</label>
			<div><button>Add book</button></div>
		</form>
	</section>
</main>

<style>
	.search {
		display: flex;
		gap: var(--space-2);
		margin-bottom: var(--space-5);
	}
	.search input {
		flex: 1;
		min-width: 0;
		border-radius: 999px;
		padding-inline: var(--space-4);
	}
	.results {
		gap: var(--space-3);
		margin-bottom: var(--space-6);
	}
	.result {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-3);
	}
	.result .body {
		flex: 1;
		min-width: 0;
	}
	.result h3 {
		margin-bottom: var(--space-1);
	}
	.result p {
		margin: 0;
		font-size: 0.95rem;
	}
	.result form {
		display: grid;
		gap: var(--space-2);
		margin: 0;
	}
	.result select {
		width: auto;
	}
	.result .status {
		margin-top: var(--space-1);
	}
	.manual {
		margin-top: var(--space-5);
		background: var(--color-surface-sunk);
		box-shadow: none;
	}
	.manual h2 {
		font-size: 1.15rem;
	}
</style>
