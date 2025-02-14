import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertRoomSchema, insertMessageSchema, updateUserSchema } from "@shared/schema";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function comparePasswords(supplied: string, stored: string) {
  const [hashed, salt] = stored.split(".");
  const hashedBuf = Buffer.from(hashed, "hex");
  const suppliedBuf = (await scryptAsync(supplied, salt, 64)) as Buffer;
  return timingSafeEqual(hashedBuf, suppliedBuf);
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Chat rooms
  app.get("/api/rooms", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const rooms = await storage.getRooms();
    res.json(rooms);
  });

  app.post("/api/rooms", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertRoomSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.message);

    const room = await storage.createRoom({
      ...parsed.data,
      createdById: req.user.id,
    });
    res.status(201).json(room);
  });

  app.get("/api/rooms/:roomId/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const messages = await storage.getMessages(parseInt(req.params.roomId));
    res.json(messages);
  });

  app.post("/api/rooms/:roomId/messages", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertMessageSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.message);

    const message = await storage.createMessage({
      ...parsed.data,
      roomId: parseInt(req.params.roomId),
      userId: req.user.id,
    });
    res.status(201).json(message);
  });

  // Delete room (only by creator)
  app.delete("/api/rooms/:roomId", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      await storage.deleteRoom(parseInt(req.params.roomId), req.user.id);
      res.sendStatus(200);
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        res.status(403).send("Only room creator can delete the room");
      } else {
        res.status(500).send("Internal server error");
      }
    }
  });

  // Join room
  app.post("/api/rooms/:roomId/join", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.joinRoom(parseInt(req.params.roomId), req.user.id);
    res.sendStatus(200);
  });

  // Leave room
  app.post("/api/rooms/:roomId/leave", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.leaveRoom(parseInt(req.params.roomId), req.user.id);
    res.sendStatus(200);
  });

  // Get room members
  app.get("/api/rooms/:roomId/members", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const members = await storage.getRoomMembers(parseInt(req.params.roomId));
    res.json(members);
  });

  // Online status
  app.post("/api/users/:userId/status", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.updateUserStatus(parseInt(req.params.userId), req.body.isOnline);
    res.sendStatus(200);
  });

  // Update user profile
  app.patch("/api/user/profile", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.message);

    const { currentPassword, newPassword, username, avatarUrl } = parsed.data;

    // Verify current password
    const user = await storage.getUser(req.user.id);
    if (!user || !(await comparePasswords(currentPassword, user.password))) {
      return res.status(400).send("Current password is incorrect");
    }

    // Check username availability if changing
    if (username && username !== user.username) {
      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).send("Username is already taken");
      }
    }

    const updatedUser = await storage.updateUserProfile(req.user.id, {
      username,
      password: newPassword,
      avatarUrl,
    });

    res.json(updatedUser);
  });

  // Delete account
  app.delete("/api/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.sendStatus(401);

    await storage.deleteUser(req.user.id);
    req.logout((err) => {
      if (err) return res.status(500).send("Error during logout");
      res.sendStatus(200);
    });
  });

  const httpServer = createServer(app);
  return httpServer;
}