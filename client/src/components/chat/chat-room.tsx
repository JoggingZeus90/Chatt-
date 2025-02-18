import { useState, useEffect, useRef, ChangeEvent, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Room, MessageWithUser } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Loader2, Image, X, ArrowDown, Pencil, Check, Trash2, LogOut, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { format } from 'date-fns';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useDebouncedCallback } from "use-debounce";

// Define inappropriate words to filter
const INAPPROPRIATE_WORDS = [
  // Common profanity
  'damn', 'hell', 'ass', 'fuck', 'shit', 'bastard', 'bitch',
  // Racial slurs and offensive terms - keeping the list minimal and non-explicit
  'slur1', 'slur2', 'slur3', 'slur4', 'slur5'
];

// Function to check if a word contains inappropriate content
function containsInappropriateWord(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/);
  return words.some(word =>
    INAPPROPRIATE_WORDS.some(badWord =>
      word.includes(badWord) ||
      // Check for common letter substitutions
      word.replace(/[01345$@]/g, (m) => ({
        '0': 'o',
        '1': 'i',
        '3': 'e',
        '4': 'a',
        '5': 's',
        '$': 's',
        '@': 'a'
      })[m] || m).includes(badWord)
    )
  );
}

// Function to replace inappropriate words with hashtags
function filterInappropriateWords(text: string): string {
  let filteredText = text;
  INAPPROPRIATE_WORDS.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filteredText = filteredText.replace(regex, match => '#'.repeat(match.length));
  });
  return filteredText;
}

const MAX_MESSAGE_LENGTH = 100;
const ALLOWED_FILE_TYPES = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
} as const;

const WHISPER_COMMAND = "/whisper";
const SUS_IMAGE_URL = "https://i.ytimg.com/vi/Mw3jK9YwOxk/maxresdefault.jpg";
const KRATOS_IMAGE_URL = "https://ew.com/thmb/4lmLC5Ark8X7GwPpaATjk738Xao=/1500x0/filters:no_upscale():max_bytes(150000):strip_icc()/god-of-war-2018-2000-408387a68b78478aaa52d04b8a99c0a0.jpg";
const VINE_BOOM_URL = "https://www.myinstants.com/media/sounds/vine-boom.mp3";

const TEXT_COMMANDS = {
  "/tableflip": "(╯°□°)╯︵ ┻━┻",
  "/unflip": "┬─┬ ノ( ゜-゜ノ)",
  "/shrug": "¯\\_(ツ)_/¯",
} as const;

const commands = [
  {
    name: 'whisper',
    description: 'Send a private message to a user',
    format: '/whisper "username" your message',
  },
  {
    name: 'tableflip',
    description: 'Flip a table in anger',
    format: '/tableflip',
  },
  {
    name: 'unflip',
    description: 'Restore the flipped table',
    format: '/unflip',
  },
  {
    name: 'shrug',
    description: 'Shrug your shoulders',
    format: '/shrug',
  },
  {
    name: 'sus',
    description: 'Send the Rock eyebrow raise meme',
    format: '/sus',
  },
  {
    name: 'kratos',
    description: 'Send an angry Kratos image',
    format: '/kratos',
  },
];

export default function ChatRoom({ room }: { room: Room }) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newRoomName, setNewRoomName] = useState(room.name);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [showCommands, setShowCommands] = useState(false);
  const commandsRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [typingUsers, setTypingUsers] = useState<{ [key: string]: boolean }>({});
  const [isTyping, setIsTyping] = useState(false);

  const isOwner = user?.id === room.createdById;

  const { data: messages, isLoading } = useQuery<MessageWithUser[]>({
    queryKey: [`/api/rooms/${room.id}/messages`],
    refetchInterval: 1000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, mediaUrl, mediaType, whisperTo }: { content: string; mediaUrl?: string; mediaType?: string; whisperTo?: string }) => {
      const res = await apiRequest("POST", `/api/rooms/${room.id}/messages`, {
        content,
        roomId: room.id,
        mediaUrl,
        mediaType,
        whisperTo,
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/rooms/${room.id}/messages`],
      });
      setMessage("");
      setMediaFile(null);
      setMediaPreviewUrl(null);
      setShowCommands(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to send message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updateRoomNameMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest("PATCH", `/api/rooms/${room.id}`, { name });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      setIsEditingName(false);
      toast({
        title: "Room name updated",
        description: "The room name has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update room name",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteRoomMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/rooms/${room.id}`);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({
        title: "Room deleted",
        description: "The room has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete room",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const leaveRoomMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/rooms/${room.id}/leave`);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({
        title: "Left room",
        description: "You have successfully left the room.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to leave room",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const atBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 50;
    setShowScrollButton(!atBottom);
  };

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
      handleScroll();
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (commandsRef.current && !commandsRef.current.contains(event.target as Node)) {
        setShowCommands(false);
      }
    }

    if (showCommands) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showCommands]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowCommands(false);
    if (!message.trim() && !mediaFile) return;

    if (user?.muted) {
      const mutedUntil = new Date(user.mutedUntil!);
      if (mutedUntil > new Date()) {
        toast({
          title: "You are muted",
          description: `You cannot send messages until ${format(mutedUntil, 'PPp')}. Reason: ${user.mutedReason}`,
          variant: "destructive",
        });
        return;
      }
    }

    let uploadedMediaUrl: string | undefined;
    let uploadedMediaType: string | undefined;
    let whisperTo: string | undefined;
    let messageContent = message.trim();

    // Check for inappropriate content before processing commands
    if (containsInappropriateWord(messageContent)) {
      messageContent = filterInappropriateWords(messageContent);
    }

    const textCommand = TEXT_COMMANDS[messageContent as keyof typeof TEXT_COMMANDS];
    if (messageContent === '/sus') {
      uploadedMediaUrl = SUS_IMAGE_URL;
      uploadedMediaType = 'image';
      messageContent = '';
      if (audioRef.current) {
        audioRef.current.volume = 0.3;
        audioRef.current.currentTime = 0;
        audioRef.current.play();
      }
    } else if (messageContent === '/kratos') {
      uploadedMediaUrl = KRATOS_IMAGE_URL;
      uploadedMediaType = 'image';
      messageContent = '';
    } else if (textCommand) {
      messageContent = textCommand;
    } else if (messageContent.startsWith(WHISPER_COMMAND)) {
      const commandText = messageContent.slice(WHISPER_COMMAND.length).trim();

      const usernameMatch = commandText.match(/^["']([^"']+)["']\s+(.+)$/);
      if (!usernameMatch) {
        toast({
          title: "Invalid whisper format",
          description: `Use the format: /whisper "username" your message`,
          variant: "destructive",
        });
        return;
      }

      whisperTo = usernameMatch[1].replace(/^@/, '');
      messageContent = usernameMatch[2];

      if (!messageContent.trim()) {
        toast({
          title: "Invalid whisper format",
          description: "Message cannot be empty",
          variant: "destructive",
        });
        return;
      }
    }

    if (mediaFile) {
      const formData = new FormData();
      formData.append("file", mediaFile);

      try {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const errorText = await uploadRes.text();
          throw new Error("Upload failed: " + errorText);
        }

        const data = await uploadRes.json();
        if (!data.url) {
          throw new Error("No URL returned from server");
        }

        uploadedMediaUrl = data.url;
        uploadedMediaType = ALLOWED_FILE_TYPES[mediaFile.type as keyof typeof ALLOWED_FILE_TYPES];
      } catch (error) {
        toast({
          title: "Failed to upload file",
          description: error instanceof Error ? error.message : "Failed to upload media",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      await sendMessageMutation.mutateAsync({
        content: messageContent,
        mediaUrl: uploadedMediaUrl,
        mediaType: uploadedMediaType,
        whisperTo,
      });
    } catch (error) {
      toast({
        title: "Failed to send message",
        description: error instanceof Error ? error.message : "Failed to send message",
        variant: "destructive",
      });
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= MAX_MESSAGE_LENGTH) {
      setMessage(newValue);

      if (!isTyping) {
        setIsTyping(true);
        apiRequest("POST", `/api/rooms/${room.id}/typing`, { isTyping: true });
      }

      setTypingDebounced();

      if (newValue.startsWith('/')) {
        setShowCommands(true);
      } else if (showCommands && !newValue.startsWith('/')) {
        setShowCommands(false);
      }
    }
  };

  const handleCommandSelect = (command: typeof commands[0]) => {
    if (command.name === 'whisper') {
      setMessage(`${command.format.split(' ')[0]} "`);
    } else {
      setMessage(command.format);
    }
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_FILE_TYPES[file.type as keyof typeof ALLOWED_FILE_TYPES]) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image or video file",
        variant: "destructive",
      });
      return;
    }

    const url = URL.createObjectURL(file);
    setMediaFile(file);
    setMediaPreviewUrl(url);
  };

  const clearMediaPreview = () => {
    setMediaFile(null);
    setMediaPreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleUpdateRoomName = () => {
    if (newRoomName.trim() && newRoomName !== room.name) {
      updateRoomNameMutation.mutate(newRoomName);
    } else {
      setIsEditingName(false);
      setNewRoomName(room.name);
    }
  };

  const setTypingDebounced = useDebouncedCallback(() => {
    setIsTyping(false);
    apiRequest("POST", `/api/rooms/${room.id}/typing`, { isTyping: false });
  }, 2000);

  useEffect(() => {
    const typingInterval = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/rooms/${room.id}/typing`);
        const data = await res.json();
        setTypingUsers(data);
      } catch (error) {
        console.error('Failed to fetch typing status:', error);
      }
    }, 1000);

    return () => clearInterval(typingInterval);
  }, [room.id]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4 flex items-center justify-between">
        {isEditingName ? (
          <div className="flex items-center gap-2 flex-1">
            <Input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              className="max-w-md"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleUpdateRoomName();
                } else if (e.key === "Escape") {
                  setIsEditingName(false);
                  setNewRoomName(room.name);
                }
              }}
            />
            <Button
              size="icon"
              variant="ghost"
              onClick={handleUpdateRoomName}
              disabled={updateRoomNameMutation.isPending}
            >
              <Check className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setIsEditingName(false);
                setNewRoomName(room.name);
              }}
              disabled={updateRoomNameMutation.isPending}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <div className="flex flex-col">
              <h2 className="font-semibold">{room.name}</h2>
              <div className="flex items-center text-sm text-muted-foreground gap-1">
                <Users className="h-3 w-3" />
                <span>
                  {room.participants?.filter(p => p.isOnline).length ?? 0} online · {room.participants?.length ?? 0} total
                </span>
              </div>
            </div>
            {(isOwner || user?.role === 'admin') && (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setIsEditingName(true)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Room</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to delete this room? This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <Button
                        variant="destructive"
                        onClick={() => deleteRoomMutation.mutate()}
                        disabled={deleteRoomMutation.isPending}
                      >
                        {deleteRoomMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Delete"
                        )}
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {!isOwner && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="text-muted-foreground hover:text-muted-foreground/80"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Leave Room</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to leave this room? You can always join back later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button
                      variant="default"
                      onClick={() => leaveRoomMutation.mutate()}
                      disabled={leaveRoomMutation.isPending}
                    >
                      {leaveRoomMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Leave"
                      )}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        )}
      </div>
      <div
        className="flex-1 overflow-auto p-4 relative"
        ref={messagesContainerRef}
      >
        {isLoading ? (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          messages?.map((message) => (
            <MessageBubble key={message.id} message={message} roomId={room.id} />
          ))
        )}
        <div ref={messagesEndRef} />
        {showScrollButton && (
          <Button
            className="fixed bottom-32 right-8 rounded-full shadow-lg"
            size="icon"
            onClick={scrollToBottom}
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        )}
      </div>
      <form onSubmit={handleSubmit} className="border-t p-4 space-y-4 relative">
        {Object.entries(typingUsers)
          .filter(([userId, isTyping]) => isTyping && userId !== user?.id.toString())
          .map(([userId]) => {
            const typingUser = room.participants?.find(p => p.id.toString() === userId);
            return typingUser && (
              <div key={userId} className="absolute -top-6 left-4 text-sm text-muted-foreground">
                {typingUser.username} is typing...
              </div>
            );
          })}
        {mediaPreviewUrl && (
          <div className="relative inline-block">
            {ALLOWED_FILE_TYPES[mediaFile?.type as keyof typeof ALLOWED_FILE_TYPES] === "image" ? (
              <img
                src={mediaPreviewUrl}
                alt="Preview"
                className="max-h-32 rounded-lg"
              />
            ) : (
              <video
                src={mediaPreviewUrl}
                className="max-h-32 rounded-lg"
                controls
              />
            )}
            <button
              type="button"
              onClick={clearMediaPreview}
              className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 hover:bg-destructive/90"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex gap-2 relative">
          <input
            type="file"
            accept="image/jpeg,image/png,image/gif,video/mp4,video/webm"
            className="hidden"
            onChange={handleFileSelect}
            ref={fileInputRef}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
          >
            <Image className="h-4 w-4" />
          </Button>
          <div className="flex-1 relative">
            <Input
              value={message}
              onChange={handleMessageChange}
              placeholder="Type a message..."
              disabled={sendMessageMutation.isPending}
              maxLength={MAX_MESSAGE_LENGTH}
              ref={inputRef}
            />
            {showCommands && (
              <div className="absolute bottom-full mb-1 left-0 w-full z-50" ref={commandsRef}>
                <Command className="border rounded-lg shadow-lg">
                  <CommandInput placeholder="Search commands..." />
                  <CommandList>
                    <CommandEmpty>No commands found.</CommandEmpty>
                    <CommandGroup heading="Available Commands">
                      {commands.map((command) => (
                        <CommandItem
                          key={command.name}
                          onSelect={() => handleCommandSelect(command)}
                          className="flex flex-col items-start"
                        >
                          <div className="font-medium">{command.format}</div>
                          <div className="text-sm text-muted-foreground">
                            {command.description}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            )}
          </div>
          <Button
            type="submit"
            disabled={sendMessageMutation.isPending || (!message.trim() && !mediaFile)}
          >
            {sendMessageMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          {message.length}/{MAX_MESSAGE_LENGTH} characters
        </div>
      </form>
      <audio ref={audioRef} src={VINE_BOOM_URL} preload="auto" />
    </div>
  );
}