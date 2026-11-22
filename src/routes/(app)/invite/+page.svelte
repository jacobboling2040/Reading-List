<script lang="ts">
	import { pending } from '../../../lib/pending';
	import { formatDate } from '../../../lib/format';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let copied = $state<string | null>(null);
	let failed = $state<string | null>(null);

	async function copy(text: string, input: HTMLInputElement | null) {
		try {
			await navigator.clipboard.writeText(text);
			copied = text;
			failed = null;
		} catch {
			// No clipboard access: select the text so it can be copied by hand.
			input?.focus();
			input?.select();
			failed = text;
			copied = null;
		}
	}
</script>

<svelte:head><title>Invite</title></svelte:head>

<main class="page">
	<h1>Invite a friend</h1>
	<p class="page-intro">Links work once and expire after 7 days.</p>
	{#if form?.message}<p class="callout error" role="alert">{form.message}</p>{/if}

	<form method="POST" action="?/create" use:pending>
		<button>Create invite link</button>
	</form>

	{#if form?.created}
		{@const created = form.created}
		<div class="card created">
			<label>
				New invite link
				<input readonly value={created} onfocus={(e) => e.currentTarget.select()} />
			</label>
			<div class="actions">
				<button
					type="button"
					class="button-quiet"
					onclick={(e) => copy(created, e.currentTarget.closest('.created')!.querySelector('input'))}
				>
					Copy
				</button>
				{#if copied === created}<span class="notice" role="status">Copied.</span>{/if}
				{#if failed === created}
					<span class="hint" role="status">Copy isn't available here. Select the link and copy it.</span>
				{/if}
			</div>
		</div>
	{/if}

	<h2>Pending invites</h2>
	{#if data.invites.length === 0}
		<p class="empty">No pending invites.</p>
	{:else}
		<ul class="list">
			{#each data.invites as inv (inv.token)}
				<li class="card pending" data-token={inv.token}>
					<code>{inv.url}</code>
					<span class="muted">Expires {formatDate(inv.expiresAt)}</span>
					<form method="POST" action="?/revoke" use:pending>
						<input type="hidden" name="token" value={inv.token} />
						<button class="button-quiet">Revoke</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	.created {
		margin: var(--space-4) 0 var(--space-5);
		display: grid;
		gap: var(--space-3);
	}
	.pending {
		display: grid;
		gap: var(--space-2);
	}
	.pending code {
		overflow-wrap: anywhere;
	}
	.pending form {
		margin: 0;
	}
	h2 {
		margin-top: var(--space-6);
	}
</style>
