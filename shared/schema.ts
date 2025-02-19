import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const UserRole = {
  USER: 'user',
  MODERATOR: 'moderator',
  ADMIN: 'admin',
  OWNER: 'owner', // Added owner role
} as const;

export type UserRoleType = typeof UserRole[keyof typeof UserRole];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isOnline: boolean("is_online").notNull().default(false),
  appearOffline: boolean("appear_offline").notNull().default(false),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
  avatarUrl: text("avatar_url"),
  role: text("role").notNull().default(UserRole.USER),
  suspended: boolean("suspended").notNull().default(false),
  suspendedAt: timestamp("suspended_at"),
  suspendedReason: text("suspended_reason"),
  muted: boolean("muted").notNull().default(false),
  mutedUntil: timestamp("muted_until"),
  mutedReason: text("muted_reason"),
  lastUsernameChange: timestamp("last_username_change"),
});

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
  })
  .extend({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    consent: z.boolean().refine((val) => val === true, {
      message: "You must consent to the data sharing to create an account"
    })
  });

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdById: integer("created_by_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isPublic: boolean("is_public").notNull().default(true),
  inviteCode: text("invite_code").unique(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  content: text("content"),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"),
  roomId: integer("room_id")
    .references(() => rooms.id)
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  editedAt: timestamp("edited_at"),
});

export const roomMembers = pgTable("room_members", {
  id: serial("id").primaryKey(),
  roomId: integer("room_id")
    .references(() => rooms.id)
    .notNull(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const unreadMentions = pgTable("unread_mentions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  messageId: integer("message_id")
    .references(() => messages.id)
    .notNull(),
  roomId: integer("room_id")
    .references(() => rooms.id)
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertRoomSchema = createInsertSchema(rooms).pick({
  name: true,
}).extend({
  isPublic: z.boolean().default(true)
});

export const insertMessageSchema = createInsertSchema(messages)
  .pick({
    content: true,
    mediaUrl: true,
    mediaType: true,
    roomId: true,
  })
  .extend({
    content: z.string().max(100, "Message cannot exceed 100 characters").optional(),
    mediaUrl: z.string().optional().nullable(),
    mediaType: z.enum(["image", "video"]).optional().nullable(),
    mentions: z.array(z.string()).optional(),
  });

export const updateUserSchema = z.object({
  username: z.string().min(1).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional().transform(val => val === "" ? undefined : val)
    .pipe(z.string().min(6, "Password must be at least 6 characters").optional()),
  avatarUrl: z.string().url().optional(),
  appearOffline: z.boolean().optional(),
}).refine((data) => {
  // Only require current password when changing password or username
  if ((data.newPassword || (data.username && !data.appearOffline)) && !data.currentPassword) {
    return false;
  }
  return true;
}, {
  message: "Current password is required when changing password or username",
  path: ["currentPassword"],
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Room = typeof rooms.$inferSelect & {
  participants?: User[];
};
export type Message = typeof messages.$inferSelect;
export type MessageWithUser = Message & { user: User };
export type RoomMember = typeof roomMembers.$inferSelect;
export type UnreadMention = typeof unreadMentions.$inferSelect;
export type InsertUnreadMention = typeof unreadMentions.$inferInsert;