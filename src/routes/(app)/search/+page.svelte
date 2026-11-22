<script lang="ts">
	import { enhance } from '$app/forms';
	import Cover from '../../../lib/components/Cover.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
</script>

<svelte:head><title>{data.q ? `${data.q} · Search` : 'Search'}</title></svelte:head>

<main class="page">
	<h1>Add a book</h1>
	<p class="page-intro">Search Open Library by title or author.</p>

	<form class="search" role="search" method="GET">
		<label class="visually-hidden" for="q">Find a book</label>
		<input id="q" name="q" type="search" value={data.q} placeholder="Title or author" required />
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
						</div>
						<form method="POST" action="?/add" use:enhance>
							<input type="hidden" name="q" value={data.q} />
							<input type="hidden" name="olWorkId" value={r.olWorkId} />
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
		margin: 0;
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
