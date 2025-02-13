import { IStorage } from "./types";
import { InsertUser, User, Room, Message, MessageWithUser } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

interface RoomMember {
  id: number;
  roomId: number;
  userId: number;
  joinedAt: Date;
}

const MemoryStore = createMemoryStore(session);

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private rooms: Map<number, Room>;
  private messages: Map<number, Message>;
  private roomMembers: Map<number, RoomMember>;
  sessionStore: session.Store;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.rooms = new Map();
    this.messages = new Map();
    this.roomMembers = new Map();
    this.currentId = 1;
    this.sessionStore = new MemoryStore({
      checkPeriod: 86400000,
    });
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = {
      ...insertUser,
      id,
      isOnline: false,
      lastSeen: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserStatus(userId: number, isOnline: boolean): Promise<void> {
    const user = await this.getUser(userId);
    if (!user) return;

    user.isOnline = isOnline;
    user.lastSeen = new Date();
    this.users.set(userId, user);
  }

  async getRooms(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  async createRoom(room: Omit<Room, "id" | "createdAt">): Promise<Room> {
    const id = this.currentId++;
    const newRoom: Room = {
      ...room,
      id,
      createdAt: new Date(),
    };
    this.rooms.set(id, newRoom);
    return newRoom;
  }

  async getMessages(roomId: number): Promise<MessageWithUser[]> {
    const messages = Array.from(this.messages.values())
      .filter((m) => m.roomId === roomId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    return Promise.all(
      messages.map(async (message) => {
        const user = await this.getUser(message.userId);
        return { ...message, user: user! };
      }),
    );
  }

  async createMessage(message: Omit<Message, "id" | "createdAt">): Promise<Message> {
    const id = this.currentId++;
    const newMessage: Message = {
      ...message,
      id,
      createdAt: new Date(),
    };
    this.messages.set(id, newMessage);
    return newMessage;
  }

  async deleteRoom(roomId: number, userId: number): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room || room.createdById !== userId) {
      throw new Error("Unauthorized");
    }

    // Delete all messages in the room
    for (const [messageId, message] of this.messages.entries()) {
      if (message.roomId === roomId) {
        this.messages.delete(messageId);
      }
    }

    // Delete all room members
    for (const [memberId, member] of this.roomMembers.entries()) {
      if (member.roomId === roomId) {
        this.roomMembers.delete(memberId);
      }
    }

    // Delete the room
    this.rooms.delete(roomId);
  }

  async joinRoom(roomId: number, userId: number): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error("Room not found");

    const id = this.currentId++;
    const member: RoomMember = {
      id,
      roomId,
      userId,
      joinedAt: new Date(),
    };
    this.roomMembers.set(id, member);
  }

  async leaveRoom(roomId: number, userId: number): Promise<void> {
    for (const [memberId, member] of this.roomMembers.entries()) {
      if (member.roomId === roomId && member.userId === userId) {
        this.roomMembers.delete(memberId);
        return;
      }
    }
  }

  async getRoomMembers(roomId: number): Promise<User[]> {
    const members = Array.from(this.roomMembers.values())
      .filter((member) => member.roomId === roomId);

    return Promise.all(
      members.map(async (member) => {
        const user = await this.getUser(member.userId);
        return user!;
      })
    );
  }

  async isRoomMember(roomId: number, userId: number): Promise<boolean> {
    return Array.from(this.roomMembers.values()).some(
      (member) => member.roomId === roomId && member.userId === userId
    );
  }
}

export const storage = new MemStorage();