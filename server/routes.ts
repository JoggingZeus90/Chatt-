import type { Express } from "express";
import { createServer, type Server } from "http";
import { setupAuth } from "./auth";
import { storage } from "./storage";
import { insertRoomSchema, insertMessageSchema, updateUserSchema, UserRole } from "@shared/schema";
import { scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import multer from "multer";
import path from "path";
import fs from 'fs/promises';
import fsSync from 'fs';
import express from 'express';
import { requireRole } from "./auth";
import { drizzle } from 'drizzle-orm/neon-serverless';
import { eq } from 'drizzle-orm';
import * as schema from "@shared/schema";
import { pool } from './db';
import passport from 'passport';
import { storeRoomCode, validateRoomCode } from './room-codes';

async function logMessageToFile(roomName: string, logEntry: string) {
  try {
    const sanitizedRoomName = roomName.replace(/[^a-zA-Z0-9]/g, '_');
    const logDir = path.join(process.cwd(), 'Chat Logs');
    const logFile = path.join(logDir, `${sanitizedRoomName}_chat.log`);
    await fs.mkdir(logDir, { recursive: true });
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${logEntry}\n`;
    await fs.appendFile(logFile, logLine);
  } catch (error) {
    console.error('Error writing to log file:', error);
  }
}

const typingUsers: { [roomId: string]: { [userId: string]: boolean } } = {};

function canChangeUsername(lastChange: Date | null): boolean {
  if (!lastChange) return true;
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  return lastChange < sevenDaysAgo;
}

const scryptAsync = promisify(scrypt);

const upload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      const uploadDir = path.join(process.cwd(), 'uploads');
      console.log('Upload directory:', uploadDir);
      if (!fsSync.existsSync(uploadDir)) {
        fsSync.mkdirSync(uploadDir, { recursive: true });
        fsSync.chmodSync(uploadDir, 0o755);
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
    fileSize: 5 * 1024 * 1024
  }
});

const db = drizzle({ client: pool, schema });

type UserRoleType = UserRole;

function generateInviteCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function registerRoutes(app: Express): Server {
  setupAuth(app);
  const uploadDir = path.join(process.cwd(), 'uploads');
  console.log('Initializing upload directory:', uploadDir);
  if (!fsSync.existsSync(uploadDir)) {
    console.log('Creating upload directory');
    fsSync.mkdirSync(uploadDir, { recursive: true });
    fsSync.chmodSync(uploadDir, 0o755);
  }
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS, POST, PUT, DELETE, PATCH');
    res.setHeader('Access-Control-Allow-Headers', '*');
    console.log(`CORS preflight request handled for ${req.method} ${req.url}`);
    next();
  });
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
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }));
  app.post("/api/upload", upload.single('file'), (req, res) => {
    console.log('Upload request received');
    console.log("Request body:", req.body);
    console.log("Request file:", req.file);
    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: "No file uploaded" });
    }
    try {
      fsSync.chmodSync(req.file.path, 0o644);
      console.log('File uploaded successfully:', {
        filename: req.file.filename,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
        permissions: fsSync.statSync(req.file.path).mode
      });
      const fileUrl = `/uploads/${req.file.filename}`;
      console.log('Generated file URL:', fileUrl);
      res.json({ url: fileUrl });
    } catch (error) {
      console.error('Error during file upload:', error);
      res.status(500).json({ error: 'Failed to process uploaded file' });
    }
  });
  app.get("/api/rooms", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const allRooms = await storage.getRooms();
      console.log('All rooms:', allRooms);
      const roomsWithMembers = await Promise.all(
        allRooms.map(async (room) => {
          const members = await storage.getRoomMembers(room.id);
          return { ...room, participants: members };
        })
      );
      console.log('Rooms with members:', roomsWithMembers);
      const accessibleRooms = roomsWithMembers.filter(room =>
        room.isPublic ||
        room.participants.some(p => p.id === req.user.id) ||
        req.user.role === UserRole.OWNER
      );
      console.log('Accessible rooms:', accessibleRooms);
      res.json(accessibleRooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).send('Failed to fetch rooms');
    }
  });
  app.post("/api/rooms", async (req, res) => {
    console.log(`POST request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = insertRoomSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.message);
    try {
      console.log('Creating room with data:', parsed.data);
      const inviteCode = !parsed.data.isPublic ? generateInviteCode() : null;
      const room = await storage.createRoom({
        ...parsed.data,
        createdById: req.user.id,
        inviteCode
      });
      if (!parsed.data.isPublic && inviteCode) {
        await storeRoomCode(room.id, room.name, inviteCode);
      }
      console.log('Room created:', room);
      await storage.joinRoom(room.id, req.user.id);
      console.log('Final room data:', room);
      res.status(201).json(room);
    } catch (error) {
      console.error('Error creating room:', error);
      res.status(500).send('Failed to create room');
    }
  });
  app.get("/api/rooms/:roomId/messages", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const roomId = parseInt(req.params.roomId);
      const userId = req.user.id;
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
    console.log(`POST request received for ${req.url}`);
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
      const [messageWithUser] = await db
        .select()
        .from(schema.messages)
        .innerJoin(schema.users, eq(schema.messages.userId, schema.users.id))
        .where(eq(schema.messages.id, message.id));
      if (!messageWithUser) {
        throw new Error('Message not found after creation');
      }
      const [room] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, parseInt(req.params.roomId)));
      await logMessageToFile(
        room.name,
        `NEW MESSAGE - User: ${messageWithUser.users.username}, Content: ${message.content}${
          message.mediaUrl ? `, Media: ${message.mediaUrl}` : ''
        }`
      );
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
  app.patch("/api/messages/:messageId", async (req, res) => {
    console.log(`PATCH request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const messageId = parseInt(req.params.messageId);
      const { content } = req.body;
      if (!content || typeof content !== "string") {
        return res.status(400).send("Content is required");
      }
      const [originalMessage] = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, messageId));
      const updatedMessage = await storage.updateMessage(messageId, req.user.id, content, req.user.role as UserRoleType);
      const [room] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, updatedMessage.roomId));
      await logMessageToFile(
        room.name,
        `EDITED MESSAGE - User: ${req.user.username}, MessageID: ${messageId}, ` +
        `Original: "${originalMessage.content}", New: "${content}"`
      );
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
  app.delete("/api/rooms/:roomId", async (req, res) => {
    console.log(`DELETE request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      await storage.deleteRoom(parseInt(req.params.roomId), req.user.id, req.user.role as UserRoleType);
      res.sendStatus(200);
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        res.status(403).send("Only room creator or owner can delete the room");
      } else {
        res.status(500).send("Internal server error");
      }
    }
  });
  app.post("/api/rooms/:roomId/join", async (req, res) => {
    console.log('Join room request received:', {
      url: req.url,
      body: req.body,
      params: req.params,
      authenticated: req.isAuthenticated(),
      userId: req.user?.id
    });
    if (!req.isAuthenticated()) {
      console.log('Unauthorized join attempt - no user session');
      return res.status(401).json({ error: "You must be logged in to join rooms" });
    }
    try {
      const roomId = parseInt(req.params.roomId);
      const userId = req.user.id;
      const providedCode = req.body.inviteCode;
      console.log('Processing join request:', { roomId, userId, providedCode });

      // Get all rooms to verify invite code
      const [room] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, roomId));
      
      if (!room) {
        console.log('Room not found:', roomId);
        return res.status(404).json({ error: "Room not found" });
      }

      if (!room.isPublic) {
        if (providedCode !== room.inviteCode) {
          console.log('Invalid invite code:', { provided: providedCode, expected: room.inviteCode });
          return res.status(403).json({ error: "Invalid invite code" });
        }
      }
      console.log('Found room:', room);
      const isMember = await storage.isRoomMember(roomId, userId);
      console.log('User membership status:', { userId, roomId, isMember });
      if (isMember) {
        const members = await storage.getRoomMembers(roomId);
        console.log('User is already a member, returning member list');
        return res.json(members);
      }
      if (!room.isPublic) {
        if (req.user.role !== UserRole.OWNER) {
          console.log('Private room join attempt:', {
            roomId,
            roomInviteCode: room.inviteCode,
            providedCode
          });
          if (!providedCode) {
            console.log('No invite code provided for private room');
            return res.status(403).json({
              error: "Invite code is required for private rooms"
            });
          }
          const isValidCode = await validateRoomCode(roomId, providedCode);
          if (!isValidCode) {
            console.log('Invalid invite code:', {
              provided: providedCode
            });
            return res.status(403).json({
              error: "Invalid invite code"
            });
          }
          console.log('Invite code validated successfully');
        } else {
          console.log('Owner bypassing invite code requirement');
        }
      }
      await storage.joinRoom(roomId, userId);
      console.log(`User ${userId} joined room ${roomId}`);
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
      console.log('Returning updated member list:', safeMembers);
      res.json(safeMembers);
    } catch (error) {
      console.error('Error joining room:', error);
      res.status(500).json({ error: 'Failed to join room' });
    }
  });
  app.post("/api/rooms/:roomId/leave", async (req, res) => {
    console.log(`POST request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const roomId = parseInt(req.params.roomId);
      const userId = req.user.id;
      await storage.leaveRoom(roomId, userId);
      const members = await storage.getRoomMembers(roomId);
      if (members.length === 0) {
        await storage.deleteRoom(roomId, userId);
      }
      res.sendStatus(200);
    } catch (error) {
      console.error('Error leaving room:', error);
      res.status(500).send('Failed to leave room');
    }
  });
  app.get("/api/rooms/:roomId/members", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const roomId = parseInt(req.params.roomId);
      const members = await storage.getRoomMembers(roomId);
      console.log(`Found ${members.length} members for room ${roomId}`);
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
  app.get("/api/rooms/:roomId/users", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const roomId = parseInt(req.params.roomId);
      const users = await storage.getRoomMembers(roomId);
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
  app.post("/api/users/:userId/status", async (req, res) => {
    console.log(`POST request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.updateUserStatus(parseInt(req.params.userId), req.body.isOnline);
    res.sendStatus(200);
  });
  app.patch("/api/user/profile", async (req, res) => {
    console.log(`PATCH request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).send(parsed.error.message);
    const { currentPassword, newPassword, username, avatarUrl } = parsed.data;
    if (currentPassword) {
      const user = await storage.getUser(req.user.id);
      if (!user || !(await comparePasswords(currentPassword, user.password))) {
        return res.status(400).send("Current password is incorrect");
      }
      if (username && username !== user.username) {
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
  app.delete("/api/user", async (req, res) => {
    console.log(`DELETE request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    await storage.deleteUser(req.user.id);
    req.logout((err) => {
      if (err) return res.status(500).send("Error during logout");
      res.sendStatus(200);
    });
  });
  app.get("/api/users", requireRole(UserRole.MODERATOR), async (req, res) => {
    const users = await storage.getUsers();
    res.json(users);
  });
  app.get("/api/users", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const users = await storage.getUsers();
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
  app.patch("/api/users/:userId/role", requireRole(UserRole.ADMIN), async (req, res) => {
    try {
      const userId = parseInt(req.params.userId);
      const newRole = req.body.role;
      if (!Object.values(UserRole).includes(newRole)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      const updatedUser = await storage.updateUserRole(userId, newRole);
      res.json(updatedUser);
    } catch (error) {
      res.status(500).json({ message: "Failed to update user role" });
    }
  });
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
  app.delete("/api/messages/:messageId", async (req, res) => {
    console.log(`DELETE request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const messageId = parseInt(req.params.messageId);
      const [message] = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, messageId));
      const [room] = await db
        .select()
        .from(schema.rooms)
        .where(eq(schema.rooms.id, message.roomId));
      await storage.deleteMessage(messageId, req.user.id, req.user.role as UserRoleType);
      await logMessageToFile(
        room.name,
        `DELETED MESSAGE - User: ${req.user.username}, MessageID: ${messageId}, ` +
        `Content: "${message.content}"`
      );
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
  app.patch("/api/rooms/:roomId", async (req, res) => {
    console.log(`PATCH request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const roomId = parseInt(req.params.roomId);
      const { name } = req.body;
      if (!name || typeof name !== "string") {
        return res.status(400).send("Room name is required");
      }
      const updatedRoom = await storage.updateRoomName(roomId, req.user.id, req.user.role as UserRoleType, name);
      res.json(updatedRoom);
    } catch (error) {
      if (error instanceof Error && error.message === "Unauthorized") {
        res.status(403).send("Only room creator or owner can update the room name");
      } else {
        console.error("Error updating room:", error);
        res.status(500).send("Internal server error");
      }
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
  app.post("/api/messages/:messageId/mentions", async (req, res) => {
    console.log(`POST request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const messageId = parseInt(req.params.messageId);
      const mentions = req.body.mentions || [];
      const roomId = req.body.roomId;
      for (const username of mentions) {
        const mentionedUser = await storage.getUserByUsername(username);
        if (mentionedUser && mentionedUser.id !== req.user.id) {
          await db.insert(schema.unreadMentions).values({
            userId: mentionedUser.id,
            messageId,
            roomId,
            createdAt: new Date(),
          });
        }
      }
      res.sendStatus(200);
    } catch (error) {
      console.error('Error creating mention:', error);
      res.status(500).send('Failed to create mention');
    }
  });
  app.get("/api/mentions/unread", async (req, res) => {
    console.log(`GET request received for ${req.url}`);
    if (!req.isAuthenticated()) return res.sendStatus(401);
    try {
      const mentions = await db.query.unreadMentions.findMany({
        where: eq(schema.unreadMentions.userId, req.user.id),
        columns: {
          roomId: true,
          messageId: true,
        },
      });
      const mentionsByRoom = mentions.reduce((acc, mention) => {
        acc[mention.roomId] = (acc[mention.roomId] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      const result = Object.entries(mentionsByRoom).map(([roomId, count]) => ({
        roomId: parseInt(roomId),
        count,
      }));
      res.json(result);
    } catch (error) {
      console.error('Error fetching unread mentions:', error);
      res.status(500).send('Failed to fetch unread mentions');
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