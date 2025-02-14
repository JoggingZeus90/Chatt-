import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertRoomSchema, insertMessageSchema, updateUserSchema } from "@shared/schema";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from 'express';
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import * as schema from "@shared/schema";
import { pool } from './db';

const db = drizzle({ client: pool, schema });
const scryptAsync = promisify(scrypt);

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      // Use an absolute path for uploads
      const uploadDir = path.resolve(process.cwd(), 'uploads');
      console.log('Upload directory:', uploadDir);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const filename = uniqueSuffix + path.extname(file.originalname);
      console.log('Generated filename:', filename);
      cb(null, filename);
    }
  }),
  fileFilter: function (req, file, cb) {
    console.log('Received file:', file.originalname, 'Type:', file.mimetype);
    if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Create uploads directory if it doesn't exist
  const uploadDir = path.resolve(process.cwd(), 'uploads');
  console.log('Initializing upload directory:', uploadDir);

  if (!fs.existsSync(uploadDir)) {
    console.log('Creating upload directory');
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Serve static files from uploads directory
  app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res, filePath) => {
      // Set proper headers for images
      if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (filePath.endsWith('.gif')) {
        res.setHeader('Content-Type', 'image/gif');
      }
      // Disable caching
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }));


  // File upload endpoint with better error handling
  app.post("/api/upload", upload.single('file'), (req, res) => {
    console.log('Upload request received');

    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log('File uploaded successfully:', {
      filename: req.file.filename,
      path: req.file.path,
      mimetype: req.file.mimetype,
      size: req.file.size
    });

    const fileUrl = `/uploads/${req.file.filename}`;
    console.log('Generated file URL:', fileUrl);
    res.json({ url: fileUrl });
  });

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
    if (!parsed.success) {
      console.error("Message validation failed:", parsed.error);
      return res.status(400).json(parsed.error);
    }

    try {
      const message = await storage.createMessage({
        content: parsed.data.content || "",
        mediaUrl: parsed.data.mediaUrl || null,
        mediaType: parsed.data.mediaType || null,
        roomId: parseInt(req.params.roomId),
        userId: req.user.id,
      });

      // Get the complete message with user data
      const [messageWithUser] = await db
        .select()
        .from(schema.messages)
        .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
        .where(eq(schema.messages.id, message.id));

      if (!messageWithUser) {
        throw new Error('Message not found after creation');
      }

      const formattedMessage = {
        id: messageWithUser.messages.id,
        content: messageWithUser.messages.content,
        mediaUrl: messageWithUser.messages.mediaUrl,
        mediaType: messageWithUser.messages.mediaType,
        roomId: messageWithUser.messages.roomId,
        userId: messageWithUser.messages.userId,
        createdAt: messageWithUser.messages.createdAt,
        user: {
          id: messageWithUser.users.id,
          username: messageWithUser.users.username,
          password: messageWithUser.users.password,
          isOnline: messageWithUser.users.isOnline,
          lastSeen: messageWithUser.users.lastSeen,
          avatarUrl: messageWithUser.users.avatarUrl,
        }
      };

      res.status(201).json(formattedMessage);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: 'Error creating message' });
    }
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

async function comparePasswords(password: string, hash: string): Promise<boolean> {
  const scryptAsync = promisify(scrypt);
  const hashBuffer = Buffer.from(hash, 'hex');
  const newHash = await scryptAsync(password, 'salt', 64);
  return timingSafeEqual(newHash, hashBuffer);
}