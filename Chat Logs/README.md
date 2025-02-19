# Chat Logs

This folder contains log files for all chat rooms in the application. Each file represents a single chat room and contains a chronological record of all messages, including edits and deletions.

## File Format

- Files are named using the pattern: `[room_name]_room_[room_id].log`
- Each message entry follows the format:
  ```
  [TIMESTAMP] USERNAME: MESSAGE_CONTENT
  [EDITED at TIMESTAMP] // Only appears for edited messages
  ```

## Purpose

These logs are maintained locally on Replit for record-keeping purposes and are separate from the application's functionality. They provide a historical record of all chat communications, including edited and deleted messages.

## Note

This is a local logging system and does not affect the application's functionality or user experience. The logs are stored only on Replit and are not accessible through the chat application interface.
