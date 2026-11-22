import { sql } from 'drizzle-orm';
import {
	sqliteTable,
	integer,
	text,
	primaryKey,
	uniqueIndex,
	check,
	type AnySQLiteColumn
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable(
	'users',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		username: text('username').notNull(),
		displayName: text('display_name').notNull(),
		passwordHash: text('password_hash').notNull(),
		isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
		invitedBy: integer('invited_by').references((): AnySQLiteColumn => users.id, {
			onDelete: 'set null'
		}),
		createdAt: integer('created_at').notNull(),
		deactivatedAt: integer('deactivated_at')
	},
	(t) => [uniqueIndex('users_username_lower_unique').on(sql`lower(${t.username})`)]
);

export const invites = sqliteTable('invites', {
	token: text('token').primaryKey(),
	createdBy: integer('created_by')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	createdAt: integer('created_at').notNull(),
	expiresAt: integer('expires_at').notNull(),
	usedBy: integer('used_by').references(() => users.id, { onDelete: 'set null' }),
	usedAt: integer('used_at'),
	revokedAt: integer('revoked_at')
});

export const sessions = sqliteTable('sessions', {
	idHash: text('id_hash').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull()
});

export const passwordResets = sqliteTable('password_resets', {
	tokenHash: text('token_hash').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull(),
	usedAt: integer('used_at')
});

export const loginAttempts = sqliteTable('login_attempts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull(),
	ip: text('ip').notNull(),
	at: integer('at').notNull()
});

export const books = sqliteTable('books', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	olWorkId: text('ol_work_id').unique(),
	title: text('title').notNull(),
	authors: text('authors').notNull(), // JSON array of names
	coverId: integer('cover_id'),
	year: integer('year'),
	createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' })
});

export const shelfEntries = sqliteTable(
	'shelf_entries',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		bookId: integer('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		status: text('status', { enum: ['to_read', 'reading', 'finished'] }).notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(t) => [uniqueIndex('shelf_entries_user_book_unique').on(t.userId, t.bookId)]
);

export const reviews = sqliteTable(
	'reviews',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		bookId: integer('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' }),
		rating: integer('rating').notNull(),
		body: text('body'),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull()
	},
	(t) => [
		uniqueIndex('reviews_user_book_unique').on(t.userId, t.bookId),
		check('reviews_rating_range', sql`${t.rating} BETWEEN 1 AND 5`)
	]
);

export const follows = sqliteTable(
	'follows',
	{
		followerId: integer('follower_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		followeeId: integer('followee_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		createdAt: integer('created_at').notNull()
	},
	(t) => [
		primaryKey({ columns: [t.followerId, t.followeeId] }),
		check('follows_no_self', sql`${t.followerId} != ${t.followeeId}`)
	]
);

export const dismissals = sqliteTable(
	'dismissals',
	{
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		bookId: integer('book_id')
			.notNull()
			.references(() => books.id, { onDelete: 'cascade' })
	},
	(t) => [primaryKey({ columns: [t.userId, t.bookId] })]
);

// Open Library search results keyed by normalised query, so repeat searches skip the network.
export const olSearchCache = sqliteTable('ol_search_cache', {
	query: text('query').primaryKey(),
	results: text('results').notNull(),
	fetchedAt: integer('fetched_at').notNull()
});
