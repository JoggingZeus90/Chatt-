import { IStorage } from "./types";
import { users, type User, type InsertUser, rooms, type Room, messages, type Message, roomMembers, type RoomMember, UserRole, UserRoleType } from "@shared/schema";
import { db } from "./db";
import { eq, and } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { MessageWithUser } from "@shared/schema";
import { randomBytes } from "crypto";
import { scryptAsync } from "./lib/scrypt";

const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
  }

  async getUsers(roomId?: number): Promise<User[]> {
    if (roomId) {
      const users = await db
        .select()
        .from(users)
        .innerJoin(roomMembers, eq(roomMembers.userId, users.id))
        .where(eq(roomMembers.roomId, roomId));
      return users.map(user => user.users);
    }
    return db.select().from(users);
  }

  // Add method to update user role (admin only)
  async updateUserRole(userId: number, newRole: UserRoleType): Promise<User> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) throw new Error("User not found");
    if (user.role === UserRole.OWNER) {
      throw new Error("Cannot modify the owner's role");
    }

    const [updatedUser] = await db
      .update(users)
      .set({ role: newRole })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async updateUserStatus(userId: number, isOnline: boolean): Promise<void> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (user) {
      await db
        .update(users)
        .set({
          isOnline: user.appearOffline ? false : isOnline,
          lastSeen: new Date()
        })
        .where(eq(users.id, userId));
    }
  }

  async getRooms(): Promise<Room[]> {
    return db.select().from(rooms);
  }

  async createRoom(room: Omit<Room, "id" | "createdAt">): Promise<Room> {
    const [newRoom] = await db.insert(rooms).values(room).returning();
    return newRoom;
  }

  async getMessages(roomId: number): Promise<MessageWithUser[]> {
    const messagesWithUsers = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.roomId, roomId))
      .orderBy(messages.createdAt);

    return messagesWithUsers.map(row => ({
      id: row.messages.id,
      content: row.messages.content,
      mediaUrl: row.messages.mediaUrl,
      mediaType: row.messages.mediaType,
      roomId: row.messages.roomId,
      userId: row.messages.userId,
      createdAt: row.messages.createdAt,
      editedAt: row.messages.editedAt,
      user: {
        id: row.users.id,
        username: row.users.username,
        password: row.users.password,
        isOnline: row.users.isOnline,
        lastSeen: row.users.lastSeen,
        avatarUrl: row.users.avatarUrl,
        role: row.users.role,
        suspended: row.users.suspended,
        suspendedAt: row.users.suspendedAt,
        suspendedReason: row.users.suspendedReason
      }
    }));
  }

  async createMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async deleteRoom(roomId: number, userId: number, userRole: UserRoleType): Promise<void> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) {
      throw new Error("Room not found");
    }

    // Allow deletion only if user is application owner or the room creator
    if (userRole !== UserRole.OWNER && room.createdById !== userId) {
      throw new Error("Unauthorized");
    }

    await db.delete(messages).where(eq(messages.roomId, roomId));
    await db.delete(roomMembers).where(eq(roomMembers.roomId, roomId));
    await db.delete(rooms).where(eq(rooms.id, roomId));
  }

  async joinRoom(roomId: number, userId: number): Promise<void> {
    // Check if user is already a member to avoid duplicate entries
    const [existingMember] = await db
      .select()
      .from(roomMembers)
      .where(and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, userId)
      ));

    if (!existingMember) {
      await db.insert(roomMembers)
        .values({
          roomId,
          userId,
          joinedAt: new Date()
        });
    }
  }

  async leaveRoom(roomId: number, userId: number): Promise<void> {
    await db.delete(roomMembers)
      .where(eq(roomMembers.roomId, roomId))
      .where(eq(roomMembers.userId, userId));
  }

  async getRoomMembers(roomId: number): Promise<User[]> {
    const members = await db
      .select({
        users: users,
        roomMembers: roomMembers
      })
      .from(users)
      .innerJoin(roomMembers, eq(users.id, roomMembers.userId))
      .where(eq(roomMembers.roomId, roomId));

    return members.map(member => ({
      id: member.users.id,
      username: member.users.username,
      password: member.users.password,
      isOnline: member.users.appearOffline ? false : member.users.isOnline,
      appearOffline: member.users.appearOffline,
      lastSeen: member.users.lastSeen,
      avatarUrl: member.users.avatarUrl,
      role: member.users.role,
      suspended: member.users.suspended,
      suspendedAt: member.users.suspendedAt,
      suspendedReason: member.users.suspendedReason,
      muted: member.users.muted,
      mutedUntil: member.users.mutedUntil,
      mutedReason: member.users.mutedReason,
      lastUsernameChange: member.users.lastUsernameChange
    }));
  }

  async isRoomMember(roomId: number, userId: number): Promise<boolean> {
    const [existingMember] = await db
      .select()
      .from(roomMembers)
      .where(and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.userId, userId)
      ));

    return !!existingMember;
  }


  async updateUserProfile(userId: number, updates: {
    username?: string;
    password?: string;
    avatarUrl?: string;
    updateUsernameTimestamp?: boolean;
    appearOffline?: boolean;
  }): Promise<User> {
    const updateData: Partial<User> = {};

    if (updates.username !== undefined) {
      updateData.username = updates.username;
      if (updates.updateUsernameTimestamp) {
        updateData.lastUsernameChange = new Date();
      }
    }
    if (updates.avatarUrl !== undefined) {
      updateData.avatarUrl = updates.avatarUrl;
    }
    if (updates.appearOffline !== undefined) {
      updateData.appearOffline = updates.appearOffline;
      updateData.isOnline = !updates.appearOffline;
      updateData.lastSeen = new Date();
    }
    if (updates.password) {
      const salt = randomBytes(16).toString("hex");
      const buf = (await scryptAsync(updates.password, salt, 64)) as Buffer;
      updateData.password = `${buf.toString("hex")}.${salt}`;
    }

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, userId))
      .returning();

    if (!user) throw new Error("User not found");
    return user;
  }

  async deleteUser(userId: number): Promise<void> {
    // Delete all messages by this user
    await db.delete(messages).where(eq(messages.userId, userId));

    // Leave all rooms
    await db.delete(roomMembers).where(eq(roomMembers.userId, userId));

    // Delete rooms created by this user
    const userRooms = await db.select().from(rooms).where(eq(rooms.createdById, userId));
    for (const room of userRooms) {
      await this.deleteRoom(room.id, userId, UserRole.OWNER); // Assuming owner for deletion in this context.
    }

    // Finally delete the user
    await db.delete(users).where(eq(users.id, userId));
  }

  async suspendUser(userId: number, reason: string): Promise<User> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) throw new Error("User not found");
    if (user.role === UserRole.OWNER) {
      throw new Error("Cannot suspend the owner");
    }

    const [updatedUser] = await db
      .update(users)
      .set({
        suspended: true,
        suspendedAt: new Date(),
        suspendedReason: reason
      })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }

  async unsuspendUser(userId: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        suspended: false,
        suspendedAt: null,
        suspendedReason: null
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) throw new Error("User not found");
    return user;
  }

  async deleteMessage(messageId: number, userId: number, userRole: UserRoleType): Promise<void> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));

    if (!message) {
      throw new Error("Message not found");
    }

    // Allow message deletion if user is owner, admin/moderator or if it's their own message
    if (userRole === UserRole.OWNER || userRole === UserRole.ADMIN || userRole === UserRole.MODERATOR || message.userId === userId) {
      await db.delete(messages).where(eq(messages.id, messageId));
    } else {
      throw new Error("Unauthorized");
    }
  }

  async updateMessage(messageId: number, userId: number, content: string, userRole: UserRoleType): Promise<Message> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId));

    if (!message) {
      throw new Error("Message not found");
    }

    // Allow message editing if user is owner or if it's their own message
    if (userRole === UserRole.OWNER || message.userId === userId) {
      const [updatedMessage] = await db
        .update(messages)
        .set({
          content,
          editedAt: new Date()
        })
        .where(eq(messages.id, messageId))
        .returning();

      return updatedMessage;
    }

    throw new Error("Unauthorized");
  }

  async muteUser(userId: number, duration: number, reason: string): Promise<User> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));

    if (!user) throw new Error("User not found");
    if (user.role === UserRole.OWNER) {
      throw new Error("Cannot mute the owner");
    }

    const mutedUntil = new Date();
    mutedUntil.setMinutes(mutedUntil.getMinutes() + duration);

    const [updatedUser] = await db
      .update(users)
      .set({
        muted: true,
        mutedUntil,
        mutedReason: reason
      })
      .where(eq(users.id, userId))
      .returning();

    return updatedUser;
  }

  async unmuteUser(userId: number): Promise<User> {
    const [user] = await db
      .update(users)
      .set({
        muted: false,
        mutedUntil: null,
        mutedReason: null
      })
      .where(eq(users.id, userId))
      .returning();

    if (!user) throw new Error("User not found");
    return user;
  }
  async updateRoomName(roomId: number, userId: number, userRole: UserRoleType, name: string): Promise<Room> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room) {
      throw new Error("Room not found");
    }

    // Allow update if user is owner or room creator
    if (userRole !== UserRole.OWNER && room.createdById !== userId) {
      throw new Error("Unauthorized");
    }

    const [updatedRoom] = await db
      .update(rooms)
      .set({ name })
      .where(eq(rooms.id, roomId))
      .returning();

    return updatedRoom;
  }
}

export const storage = new DatabaseStorage();