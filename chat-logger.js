import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './server/db.ts';
import { rooms, messages, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createChatLogs() {
  // Create Chat Logs directory if it doesn't exist
  const logDir = path.join(__dirname, 'Chat Logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
  }

  // Get all rooms
  const allRooms = await db.select().from(rooms);

  for (const room of allRooms) {
    const messagesWithUsers = await db
      .select()
      .from(messages)
      .innerJoin(users, eq(messages.userId, users.id))
      .where(eq(messages.roomId, room.id));

    const logContent = messagesWithUsers.map(msg => {
      const timestamp = new Date(msg.messages.createdAt).toISOString();
      const editedInfo = msg.messages.editedAt ? `\n[EDITED at ${new Date(msg.messages.editedAt).toISOString()}]` : '';
      return `[${timestamp}] ${msg.users.username}: ${msg.messages.content}${editedInfo}`;
    }).join('\n');

    const fileName = `${room.name.replace(/[^a-z0-9]/gi, '_')}_room_${room.id}.log`;
    fs.writeFileSync(path.join(logDir, fileName), logContent);
  }
}

createChatLogs().catch(console.error);