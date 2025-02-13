import { IStorage } from "./types";
import { users, type User, type InsertUser, rooms, type Room, messages, type Message, roomMembers, type RoomMember } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { pool } from "./db";
import { MessageWithUser } from "@shared/schema";


const PostgresSessionStore = connectPg(session);

export class DatabaseStorage implements IStorage {
  sessionStore: session.Store;

  constructor() {
    this.sessionStore = new PostgresSessionStore({
      pool,
      createTableIfMissing: true,
    });
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
    await db
      .update(users)
      .set({ isOnline, lastSeen: new Date() })
      .where(eq(users.id, userId));
  }

  async getRooms(): Promise<Room[]> {
    return db.select().from(rooms);
  }

  async createRoom(room: Omit<Room, "id" | "createdAt">): Promise<Room> {
    const [newRoom] = await db.insert(rooms).values(room).returning();
    return newRoom;
  }

  async getMessages(roomId: number): Promise<MessageWithUser[]> {
    const messagesQuery = db.select({...messages, user: users}).from(messages).where(eq(messages.roomId, roomId)).orderBy(messages.createdAt);
    const messagesResult = await messagesQuery;
    return messagesResult;
  }

  async createMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    return newMessage;
  }

  async deleteRoom(roomId: number, userId: number): Promise<void> {
    const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId));
    if (!room || room.createdById !== userId) {
      throw new Error("Unauthorized");
    }
    await db.delete(rooms).where(eq(rooms.id, roomId));
    await db.delete(messages).where(eq(messages.roomId, roomId));
    await db.delete(roomMembers).where(eq(roomMembers.roomId, roomId));
  }

  async joinRoom(roomId: number, userId: number): Promise<void> {
    await db.insert(roomMembers).values({ roomId, userId, joinedAt: new Date() });
  }

  async leaveRoom(roomId: number, userId: number): Promise<void> {
    await db.delete(roomMembers).where(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId));
  }

  async getRoomMembers(roomId: number): Promise<User[]> {
    const members = await db.select({...users}).from(roomMembers).innerJoin(users, eq(roomMembers.userId, users.id)).where(eq(roomMembers.roomId, roomId));
    return members;
  }

  async isRoomMember(roomId: number, userId: number): Promise<boolean> {
    const [member] = await db.select().from(roomMembers).where(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, userId));
    return !!member;
  }

  async updateUserProfile(userId: number, updates: { avatarUrl?: string }): Promise<User> {
    const [user] = await db
      .update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    if (!user) throw new Error("User not found");
    return user;
  }
}

export const storage = new DatabaseStorage();