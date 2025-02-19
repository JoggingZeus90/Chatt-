import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function generateInviteCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

interface RoomCode {
  roomId: number;
  roomName: string;
  inviteCode: string;
}

export async function storeRoomCode(roomId: number, roomName: string, inviteCode: string) {
  try {
    const logDir = path.join(__dirname, '..', 'Chat Logs');
    const codeFile = path.join(logDir, 'private_room_codes.log');

    // Ensure the directory exists
    await fs.mkdir(logDir, { recursive: true });

    // Read existing codes
    let codes: RoomCode[] = [];
    try {
      const content = await fs.readFile(codeFile, 'utf-8');
      codes = JSON.parse(content);
    } catch (error) {
      // File doesn't exist or is invalid, start with empty array
      codes = [];
    }

    // Add or update room code
    const existingIndex = codes.findIndex(code => code.roomId === roomId);
    if (existingIndex !== -1) {
      codes[existingIndex] = { roomId, roomName, inviteCode };
    } else {
      codes.push({ roomId, roomName, inviteCode });
    }

    // Write back to file
    await fs.writeFile(codeFile, JSON.stringify(codes, null, 2));
  } catch (error) {
    console.error('Error storing room code:', error);
  }
}

export async function validateRoomCode(roomId: number, providedCode: string): Promise<boolean> {
  try {
    const logDir = path.join(__dirname, '..', 'Chat Logs');
    const codeFile = path.join(logDir, 'private_room_codes.log');

    const content = await fs.readFile(codeFile, 'utf-8');
    const codes: RoomCode[] = JSON.parse(content);

    const roomCode = codes.find(code => code.roomId === roomId);
    return roomCode?.inviteCode === providedCode;
  } catch (error) {
    console.error('Error validating room code:', error);
    return false;
  }
}
