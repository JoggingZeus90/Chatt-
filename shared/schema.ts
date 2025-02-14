import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  isOnline: boolean("is_online").notNull().default(false),
  lastSeen: timestamp("last_seen").notNull().defaultNow(),
  avatarUrl: text("avatar_url"),
});

export const rooms = pgTable("rooms", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  createdById: integer("created_by_id")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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

export const insertUserSchema = createInsertSchema(users)
  .pick({
    username: true,
    password: true,
  })
  .extend({
    username: z.string().min(3, "Username must be at least 3 characters"),
    password: z.string().min(6, "Password must be at least 6 characters"),
  });

export const insertRoomSchema = createInsertSchema(rooms).pick({
  name: true,
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
  });

export const updateUserSchema = z.object({
  username: z.string().min(1).optional(),
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1).optional(),
  avatarUrl: z.string().url().optional(),
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type MessageWithUser = Message & { user: User };
export type RoomMember = typeof roomMembers.$inferSelect;