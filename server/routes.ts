import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertRoomSchema, insertMessageSchema, updateUserSchema, UserRole } from "@shared/schema";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from 'express';
import { requireRole } from "./auth";
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import * as schema from "@shared/schema";
import { pool } from './db';
import passport from 'passport'; // Import passport

// Move typingUsers outside of registerRoutes to prevent resetting on hot reload
const typingUsers: { [roomId: string]: { [userId: string]: boolean } } = {};

function canChangeUsername(lastChange: Date | null): boolean {
  if (!lastChange) return true;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return lastChange < sevenDaysAgo;
}

const scryptAsync = promisify(scrypt);

// Configure multer for handling file uploads
const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(process.cwd(), 'uploads');
      console.log('Upload directory:', uploadDir);

      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.chmodSync(uploadDir, 0o755);
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

const db = drizzle({ client: pool, schema });

type UserRoleType = UserRole;


export function registerRoutes(app: Express): Server {
  setupAuth(app);

  // Create uploads directory
  const uploadDir = path.join(process.cwd(), 'uploads');
  console.log('Initializing upload directory:', uploadDir);

  if (!fs.existsSync(uploadDir)) {
    console.log('Creating upload directory');
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.chmodSync(uploadDir, 0o755);
  }

  // Set CORS headers for all routes
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE, PATCH'); // Added more methods for completeness
    res.setHeader('Access-Control-Allow-Headers', '*');
    console.log(`CORS preflight request handled for ${req.method} ${req.url}`); // Added logging for CORS requests
    next();
  });

  // Serve uploads directory with proper headers
  app.use('/uploads', (req, res, next) => {
    console.log('Serving file:', req.url, 'from uploads directory');
    next();
  }, express.static(uploadDir, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
        res.setHeader('Content-Type', 'image/jpeg');
      } else if (filePath.endsWith('.gif')) {
        res.setHeader('Content-Type', 'image/gif');
      } else if (filePath.endsWith('.mp4')) {
        res.setHeader('Content-Type', 'video/mp4');
      } else if (filePath.endsWith('.mov')) {
        res.setHeader('Content-Type', 'video/quicktime');
      } // Added support for common video types


      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));

  // File upload endpoint
  app.post("/api/upload", upload.single('file'), (req, res) => {
    console.log('Upload request received');
    console.log("Request body:", req.body); // Added logging for request body
    console.log("Request file:", req.file); // Added logging for request file

    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      fs.chmodSync(req.file.path, 0o644);

      console.log('File uploaded successfully:', {
        filename: req.file.filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
        permissions: fs.statSync(req.file.path).mode
      });

      const fileUrl = `/uploads/${req.file.filename}`;
      console.log('Generated file URL:', fileUrl);
      res.json({ url: fileUrl });
    } catch (error) {
      console.error('Error during file upload:', error);
      res.status(500).json({ error: 'Failed to process uploaded file' });
    }
  });

  // Chat rooms
  // Modify getRooms endpoint to filter private rooms
  app.get("/api/rooms", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      // Get all rooms first
      const allRooms = await storage.getRooms();

      // Filter rooms to only show public ones and private ones where user is a member
      const accessibleRooms = allRooms.filter(room =>
        room.isPublic || room.participants?.some(p => p.id === req.user.id)
      );

      // Get participants for each accessible room
      const roomsWithParticipants = await Promise.all(
        accessibleRooms.map(async (room) => {
          const participants = await storage.getRoomMembers(room.id);
          return { ...room, participants };
        })
      );

      res.json(roomsWithParticipants);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).send('Failed to fetch rooms');
    }
  });

  // Create room and automatically add creator as member
  // Update room creation to generate invite code for private rooms
  app.post("/api/rooms", async (req, res) => {
    console.log(`POST request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertRoomSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.message);

    try {
      // Generate invite code for private rooms
      const inviteCode = !parsed.data.isPublic ?
        `${Math.random().toString(36).substring(2, 8)}` :
        null;

      const room = await storage.createRoom({
        ...parsed.data,
        createdById: req.user.id,
        inviteCode
      });

      // Add creator as first member
      await storage.joinRoom(room.id, req.user.id);
      res.status(201).json(room);
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).send('Failed to create room');
    }
  });

  // Add automatic room joining when getting messages
  app.get("/api/rooms/:roomId/messages", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const roomId = parseInt(req.params.roomId);
      const userId = req.user.id;

      // Automatically join room if not already a member
      const isMember = await storage.isRoomMember(roomId, userId);
      if (!isMember) {
        await storage.joinRoom(roomId, userId);
      }

      const messages = await storage.getMessages(parseInt(req.params.roomId));
      res.json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  });

  app.post("/api/rooms/:roomId/messages", async (req, res) => {
    console.log(`POST request received for ${req.url}`); // Added request logging
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
          role: messageWithUser.users.role,
          suspended: messageWithUser.users.suspended,
          suspendedAt: messageWithUser.users.suspendedAt,
          suspendedReason: messageWithUser.users.suspendedReason
        }
      };

      res.status(201).json(formattedMessage);
    } catch (error) {
      console.error('Error creating message:', error);
      res.status(500).json({ error: 'Error creating message' });
    }
  });

  // Edit message (only owner can edit)
  app.patch("/api/messages/:messageId", async (req, res) => {
    console.log(`PATCH request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messageId = parseInt(req.params.messageId);
      const { content } = req.body;

      if (!content || typeof content !== "string") {
        return res.status(400).send("Content is required");
      }

      const updatedMessage = await storage.updateMessage(messageId, req.user.id, content);
      res.json(updatedMessage);
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        res.status(403).send("Not authorized to edit this message");
      } else {
        console.error("Error updating message:", error);
        res.status(500).send("Internal server error");
      }
    }
  });

  // Delete room (only by creator)
  app.delete("/api/rooms/:roomId", async (req, res) => {
    console.log(`DELETE request received for ${req.url}`); // Added request logging
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

  // Join room (check visibility and handle accordingly)
  app.post("/api/rooms/:roomId/join", async (req, res) => {
    console.log(`POST request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const roomId = parseInt(req.params.roomId);
      const userId = req.user.id;

      // Get room details to check visibility
      const room = await storage.getRoom(roomId);
      if (!room) {
        return res.status(404).send("Room not found");
      }

      // For private rooms, only allow joining with invite code
      if (!room.isPublic) {
        return res.status(403).send("This is a private room. You need an invite code to join.");
      }

      // Check if user is already a member
      const isMember = await storage.isRoomMember(roomId, userId);
      if (!isMember) {
        await storage.joinRoom(roomId, userId);
      }

      // Return updated room members
      const members = await storage.getRoomMembers(roomId);
      const safeMembers = members.map(member => ({
        id: member.id,
        username: member.username,
        isOnline: member.isOnline,
        lastSeen: member.lastSeen,
        avatarUrl: member.avatarUrl,
        role: member.role,
        suspended: member.suspended
      }));

      res.json(safeMembers);
    } catch (error) {
      console.error('Error joining room:', error);
      res.status(500).send('Failed to join room');
    }
  });

  // Leave room
  // Update leave room to properly remove user
  app.post("/api/rooms/:roomId/leave", async (req, res) => {
    console.log(`POST request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const roomId = parseInt(req.params.roomId);
      const userId = req.user.id;

      await storage.leaveRoom(roomId, userId);

      // After leaving, check if this was the last member
      const members = await storage.getRoomMembers(roomId);
      if (members.length === 0) {
        // If no members left, delete the room
        await storage.deleteRoom(roomId, userId);
      }

      res.sendStatus(200);
    } catch (error) {
      console.error('Error leaving room:', error);
      res.status(500).send('Failed to leave room');
    }
  });

  // Get room members (only members who have access to the room)
  app.get("/api/rooms/:roomId/members", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const roomId = parseInt(req.params.roomId);
      const members = await storage.getRoomMembers(roomId);

      console.log(`Found ${members.length} members for room ${roomId}`);

      // Filter out sensitive information
      const safeMembers = members.map(member => ({
        id: member.id,
        username: member.username,
        isOnline: member.isOnline,
        lastSeen: member.lastSeen,
        avatarUrl: member.avatarUrl,
        role: member.role,
        suspended: member.suspended
      }));

      res.json(safeMembers);
    } catch (error) {
      console.error('Error fetching room members:', error);
      res.status(500).send('Failed to fetch room members');
    }
  });

  // Get all users in a room (accessible to authenticated users)
  app.get("/api/rooms/:roomId/users", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const roomId = parseInt(req.params.roomId);
      const users = await storage.getRoomMembers(roomId);

      // Filter out sensitive information
      const safeUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        avatarUrl: user.avatarUrl,
        role: user.role,
        suspended: user.suspended
      }));

      res.json(safeUsers);
    } catch (error) {
      console.error('Error fetching room users:', error);
      res.status(500).send('Failed to fetch room users');
    }
  });


  // Online status
  app.post("/api/users/:userId/status", async (req, res) => {
    console.log(`POST request received for ${req.url}`); // Added request logging
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.updateUserStatus(parseInt(req.params.userId), req.body.isOnline);
    res.sendStatus(200);
  });

  // Update user profile
  app.patch("/api/user/profile", async (req, res) => {
    console.log(`PATCH request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.message);

    const { currentPassword, newPassword, username, avatarUrl } = parsed.data;

    // Only verify current password if either password is being changed or username is being changed
    if (currentPassword) {
      const user = await storage.getUser(req.user.id);
      if (!user || !(await comparePasswords(currentPassword, user.password))) {
        return res.status(400).send("Current password is incorrect");
      }

      // Check username availability and cooldown if changing
      if (username && username !== user.username) {
        // Check if user can change username (7-day cooldown)
        if (!canChangeUsername(user.lastUsernameChange)) {
          const nextChangeDate = new Date(user.lastUsernameChange!);
          nextChangeDate.setDate(nextChangeDate.getDate() + 7);
          return res.status(400).send(`You can change your username again on ${nextChangeDate.toLocaleDateString()}`);
        }

        const existing = await storage.getUserByUsername(username);
        if (existing) {
          return res.status(400).send("Username is already taken");
        }
      }
    } else if (newPassword) {
      // If trying to set new password without providing current password
      return res.status(400).send("Current password is required to change password");
    }

    try {
      const updatedUser = await storage.updateUserProfile(req.user.id, {
        username,
        password: newPassword,
        avatarUrl,
        lastUsernameChange: username !== req.user.username ? new Date() : null,
      });

      res.json(updatedUser);
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).send("Failed to update profile");
    }
  });

  // Delete account
  app.delete("/api/user", async (req, res) => {
    console.log(`DELETE request received for ${req.url}`); // Added request logging
    if (!req.isAuthenticated()) return res.sendStatus(401);

    await storage.deleteUser(req.user.id);
    req.logout((err) => {
      if (err) return res.status(500).send("Error during logout");
      res.sendStatus(200);
    });
  });

  // Moderator routes
  app.get("/api/users", requireRole(UserRole.MODERATOR), async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });

  // Get all users (accessible to authenticated users)
  app.get("/api/users", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const users = await storage.getUsers();
      // Filter out sensitive information
      const safeUsers = users.map(user => ({
        id: user.id,
        username: user.username,
        isOnline: user.isOnline,
        lastSeen: user.lastSeen,
        avatarUrl: user.avatarUrl,
        role: user.role,
        suspended: user.suspended
      }));
      res.json(safeUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).send('Failed to fetch users');
    }
  });


  // Moderation actions (available to moderators and admins)
  app.post("/api/users/:userId/mute", requireRole(UserRole.MODERATOR), async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const { duration, reason } = req.body;

      if (!duration || !reason) {
        return res.status(400).json({ message: "Duration and reason are required" });
      }

      const user = await storage.muteUser(userId, duration, reason);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to mute user" });
    }
  });

  app.post("/api/users/:userId/unmute", requireRole(UserRole.MODERATOR), async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await storage.unmuteUser(userId);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to unmute user" });
    }
  });

  // Admin-only routes
  app.patch("/api/users/:userId/role", requireRole(UserRole.ADMIN), async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const newRole = req.body.role;

      // Validate the role
      if (!Object.values(UserRole).includes(newRole)) {
        return res.status(400).json({ message: "Invalid role" });
      }

      const updatedUser = await storage.updateUserRole(userId, newRole);
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Admin-only routes for user suspension
  app.post("/api/users/:userId/suspend", requireRole(UserRole.ADMIN), async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const reason = req.body.reason || "No reason provided";

      const user = await storage.suspendUser(userId, reason);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to suspend user" });
    }
  });

  app.post("/api/users/:userId/unsuspend", requireRole(UserRole.ADMIN), async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const user = await storage.unsuspendUser(userId);
      res.json(user);
    } catch (error) {
      res.status(500).json({ message: "Failed to unsuspend user" });
    }
  });

  // Delete message (owner, admin, or moderator)
  app.delete("/api/messages/:messageId", async (req, res) => {
    console.log(`DELETE request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const messageId = parseInt(req.params.messageId);
      await storage.deleteMessage(messageId, req.user.id, req.user.role as UserRoleType);
      res.sendStatus(200);
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        res.status(403).send("Not authorized to delete this message");
      } else {
        console.error("Error deleting message:", error);
        res.status(500).send("Internal server error");
      }
    }
  });

  // Add room name update endpoint
  app.patch("/api/rooms/:roomId", async (req, res) => {
    console.log(`PATCH request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);

    try {
      const roomId = parseInt(req.params.roomId);
      const { name } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).send("Room name is required");
      }

      const [room] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, roomId));

      if (!room) {
        return res.status(404).send("Room not found");
      }

      if (room.createdById !== req.user.id) {
        return res.status(403).send("Only room creator can update the room name");
      }

      const [updatedRoom] = await db
        .update(schema.rooms)
        .set({ name })
        .where(eq(schema.rooms.id, roomId))
        .returning();

      res.json(updatedRoom);
    } catch (error) {
      console.error("Error updating room:", error);
      res.status(500).send("Internal server error");
    }
  });

  app.post("/api/login", (req, res, next) => {
    console.log('Login attempt for username:', req.body.username);
    passport.authenticate("local", (err, user, info) => {
      if (err) {
        console.error('Authentication error:', err);
        return next(err);
      }
      if (!user) {
        console.log('Authentication failed:', info?.message || 'Invalid credentials');
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.login(user, (err) => {
        if (err) {
          console.error('Login error:', err);
          return next(err);
        }
        console.log('User successfully authenticated:', user.username);
        res.json(user);
      });
    })(req, res, next);
  });


  // Store typing users in a database table to prevent reset on hot reload
  app.post("/api/rooms/:roomId/typing", async (req, res) => {
    console.log(`POST request received for ${req.url}`);
    if (!req.isAuthenticated()) {
      console.log('Unauthorized typing status update attempt');
      return res.sendStatus(401);
    }

    const roomId = req.params.roomId;
    const userId = req.user.id.toString();
    const { isTyping } = req.body;

    console.log(`Updating typing status for user ${userId} in room ${roomId}: ${isTyping}`);

    try {
      if (!typingUsers[roomId]) {
        typingUsers[roomId] = {};
      }

      if (isTyping) {
        typingUsers[roomId][userId] = true;
      } else {
        delete typingUsers[roomId][userId];
      }

      console.log('Current typing users:', JSON.stringify(typingUsers, null, 2));
      res.sendStatus(200);
    } catch (error) {
      console.error('Error updating typing status:', error);
      res.status(500).send('Failed to update typing status');
    }
  });

  app.get("/api/rooms/:roomId/typing", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) {
      console.log('Unauthorized typing status request');
      return res.sendStatus(401);
    }

    try {
      const roomId = req.params.roomId;
      const typingStatus = typingUsers[roomId] || {};
      console.log('Sending typing status:', JSON.stringify(typingStatus, null, 2));
      res.json(typingStatus);
    } catch (error) {
      console.error('Error fetching typing status:', error);
      res.status(500).send('Failed to fetch typing status');
    }
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