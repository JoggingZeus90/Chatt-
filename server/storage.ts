import { IStorage } from "./types";
import { InsertUser, User, Room, Message, MessageWithUser } from "@shared/schema";
import session from "express-session";
import createMemoryStore from "memorystore";

const MemoryStore = createMemoryStore(session);

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private rooms: Map<number, Room>;
  private messages: Map<number, Message>;
  sessionStore: session.Store;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.rooms = new Map();
    this.messages = new Map();
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
}

export const storage = new MemStorage();
