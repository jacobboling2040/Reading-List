<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const date = (ms: number) => new Date(ms).toISOString().slice(0, 10);
</script>

<svelte:head><title>Admin</title></svelte:head>

<main class="admin">
	<h1>Admin</h1>
	{#if form?.message}<p class="error" role="alert">{form.message}</p>{/if}

	<section>
		<h2>Members</h2>
		<table>
			<thead>
				<tr><th>Name</th><th>Username</th><th>Status</th><th>Actions</th></tr>
			</thead>
			<tbody>
				{#each data.members as m (m.id)}
					<tr data-username={m.username}>
						<td>{m.displayName}{m.isAdmin ? ' (admin)' : ''}</td>
						<td>@{m.username}</td>
						<td>{m.deactivatedAt === null ? 'Active' : 'Deactivated'}</td>
						<td class="actions">
							<form method="POST" action={m.deactivatedAt === null ? '?/deactivate' : '?/reactivate'} use:enhance>
								<input type="hidden" name="userId" value={m.id} />
								<button>{m.deactivatedAt === null ? 'Deactivate' : 'Reactivate'}</button>
							</form>
							<form method="POST" action="?/reset" use:enhance>
								<input type="hidden" name="userId" value={m.id} />
								<button>Create reset link</button>
							</form>
							{#if form?.resetLink && form.resetFor === m.id}
								<code class="reset-link">{form.resetLink}</code>
							{/if}
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>

	<section>
		<h2>Pending invites</h2>
		{#if data.invites.length === 0}
			<p>No pending invites.</p>
		{:else}
			<ul>
				{#each data.invites as inv (inv.token)}
					<li>
						From {inv.createdByName}, expires {date(inv.expiresAt)}
						<form method="POST" action="?/revoke" use:enhance>
							<input type="hidden" name="token" value={inv.token} />
							<button>Revoke</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2>Backup</h2>
		<a href="/admin/backup" data-sveltekit-reload download>Download backup</a>
	</section>
</main>

<style>
	.actions form {
		display: inline;
	}
	.reset-link {
		display: block;
		overflow-wrap: anywhere;
	}
	li form {
		display: inline;
	}
</style>
