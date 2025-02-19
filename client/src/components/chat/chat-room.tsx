import { useState, useEffect, useRef, ChangeEvent, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Room, MessageWithUser, User, UserRole } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Loader2, Image, X, ArrowDown, Pencil, Check, Trash2, LogOut, Users, PanelLeftClose, PanelLeft, Lock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useDebouncedCallback } from "use-debounce";
import { format } from "date-fns";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";

// Define inappropriate words to filter
const INAPPROPRIATE_WORDS = [
  // Common profanity
  'damn', 'hell', 'ass', 'fuck', 'shit', 'bastard', 'bitch',
  // Racial slurs and offensive terms - keeping the list minimal and non-explicit
  'slur1', 'slur2', 'slur3', 'slur4', 'slur5'
];

// Function to check if a word contains inappropriate content
function containsInappropriateWord(text: string): boolean {
  // Split out URLs from the text to avoid filtering them
  const parts = text.split(/(\b(?:https?:\/\/|www\.)[^\s]+\b)/g);
  // Only check non-URL parts for inappropriate words
  return parts
    .filter((part, index) => index % 2 === 0) // Even indices are non-URL parts
    .some(part => {
      const words = part.toLowerCase().split(/\s+/);
      return words.some(word =>
        INAPPROPRIATE_WORDS.some(badWord => {
          // Create a regex pattern that matches the whole word with word boundaries
          const pattern = new RegExp(`\\b${badWord}\\b`, 'i');
          // Check both original word and l33t speak version
          return pattern.test(word) ||
            pattern.test(word.replace(/[01345$@]/g, (m) => ({
              '0': 'o',
              '1': 'i',
              '3': 'e',
              '4': 'a',
              '5': 's',
              '$': 's',
              '@': 'a'
            })[m] || m));
        })
      );
    });
}

// Function to replace inappropriate words with hashtags
function filterInappropriateWords(text: string): string {
  // Split the text into URL and non-URL parts
  const parts = text.split(/(\b(?:https?:\/\/|www\.)[^\s]+\b)/g);

  // Process each part, preserving URLs
  return parts
    .map((part, index) => {
      // If it's a URL (odd indices), keep it unchanged
      if (index % 2 === 1) return part;

      // For non-URL parts, apply the filter
      let filteredText = part;
      INAPPROPRIATE_WORDS.forEach(word => {
        // Create a regex that matches whole words only
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        filteredText = filteredText.replace(regex, match => '#'.repeat(match.length));
      });
      return filteredText;
    })
    .join('');
}

const SPECIAL_MENTIONS = [
  { id: 'everyone', username: 'everyone', description: 'Mention all users in the room' },
  { id: 'admin', username: 'admin', description: 'Mention all administrators' },
  { id: 'mod', username: 'mod', description: 'Mention all moderators' }
] as const;

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
const GOOGLE_MESSAGE_SOUND_URL = "https://www.myinstants.com/media/sounds/google-message-sound.mp3";

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

interface ChatRoomProps {
  room: Room;
  onToggleSidebar: () => void;
  onLeave: (roomId: number) => void;
}

function ChatRoom({ room, onToggleSidebar, onLeave }: ChatRoomProps) {
  const { user } = useAuth();
  const [message, setMessage] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newRoomName, setNewRoomName] = useState(room.name);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [showCommands, setShowCommands] = useState(false);
  const commandsRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const messageSoundRef = useRef<HTMLAudioElement>(null);
  const [typingUsers, setTypingUsers] = useState<{ [key: string]: boolean }>({});
  const [isTyping, setIsTyping] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState("");
  const mentionMatchRef = useRef<{ start: number; end: number } | null>(null);

  const isOwner = user?.id === room.createdById;

  const { data: messages, isLoading } = useQuery<MessageWithUser[]>({
    queryKey: [`/api/rooms/${room.id}/messages`],
    refetchInterval: 1000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, mediaUrl, mediaType, whisperTo, mentions }: { content: string; mediaUrl?: string; mediaType?: string; whisperTo?: string; mentions?: string[] }) => {
      const res = await apiRequest("POST", `/api/rooms/${room.id}/messages`, {
        content,
        roomId: room.id,
        mediaUrl,
        mediaType,
        whisperTo,
        mentions,
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      const message = await res.json();

      // Handle mentions including special mentions
      if (mentions && mentions.length > 0) {
        const specialMentions = mentions.filter(mention =>
          ['everyone', 'admin', 'mod'].includes(mention.toLowerCase())
        );
        const userMentions = mentions.filter(mention =>
          !['everyone', 'admin', 'mod'].includes(mention.toLowerCase())
        );

        const mentionsPayload = {
          mentions: userMentions,
          specialMentions,
          roomId: room.id
        };

        const mentionRes = await apiRequest("POST", `/api/messages/${message.id}/mentions`, mentionsPayload);
        if (!mentionRes.ok) {
          const error = await mentionRes.text();
          throw new Error(error);
        }
      }

      return message;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [`/api/rooms/${room.id}/messages`],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/mentions/unread"],
      });
      setMessage("");
      setMediaFile(null);
      setMediaPreviewUrl(null);
      setShowCommands(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      if (messageSoundRef.current) {
        messageSoundRef.current.volume = 0.5;
        messageSoundRef.current.currentTime = 0;
        messageSoundRef.current.play().catch(error => {
          console.error('Failed to play message sound:', error);
        });
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
      setIsDeleteDialogOpen(false);
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
      setIsLeaveDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast({
        title: "Left room",
        description: "You have successfully left the room.",
      });
      onLeave(room.id);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to leave room",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const joinRoomMutation = useMutation({
    mutationFn: async (inviteCode?: string) => {
      try {
        const res = await apiRequest("POST", `/api/rooms/${room.id}/join`, {
          inviteCode
        });

        const text = await res.text();
        console.log('Join room response:', { status: res.status, text });

        if (!res.ok) {
          try {
            const error = JSON.parse(text);
            throw new Error(error.error || 'Failed to join room');
          } catch (e) {
            throw new Error(text || 'Failed to join room');
          }
        }

        try {
          return JSON.parse(text);
        } catch (e) {
          console.error('Failed to parse response:', e);
          throw new Error('Invalid server response');
        }
      } catch (error) {
        console.error('Join room error:', error);
        throw error;
      }
    }
  });

  const handleJoinRoom = useCallback(async (inviteCode?: string) => {
    toast({
      title: "Joining room...",
      description: inviteCode ? "Verifying invite code..." : "Joining public room...",
    });

    try {
      const result = await joinRoomMutation.mutateAsync(inviteCode);
      console.log('Join room result:', result);

      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${room.id}/messages`] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });

      toast({
        title: "Successfully joined room",
        description: inviteCode ? "Your invite code was accepted." : "You have joined the public room.",
      });
    } catch (error) {
      console.error('Failed to join room:', error);
      toast({
        title: "Failed to join room",
        description: error instanceof Error ? error.message : "Unable to join room",
        variant: "destructive",
      });
    }
  }, [room.id, joinRoomMutation]);

  useEffect(() => {
    const shouldJoinRoom = !room.participants?.some(p => p.id === user?.id);

    if (shouldJoinRoom) {
      if (!room.isPublic) {
        const inviteCode = prompt("Please enter the invite code to join this private room:");
        console.log('Attempting to join private room with code:', inviteCode);

        if (inviteCode) {
          handleJoinRoom(inviteCode);
        } else {
          toast({
            title: "Join room cancelled",
            description: "No invite code provided",
            variant: "destructive",
          });
        }
      } else {
        console.log('Attempting to join public room');
        handleJoinRoom();
      }
    }
  }, [room.id, room.isPublic, user?.id, room.participants, handleJoinRoom]);

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

    const mentions = message.match(/@(everyone|admin|mod|[^@\s]+)(?:\s|$)/g)?.map(mention =>
      mention.slice(1).trim()
    ).filter(Boolean) || [];

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
      const response = await sendMessageMutation.mutateAsync({
        content: messageContent,
        mediaUrl: uploadedMediaUrl,
        mediaType: uploadedMediaType,
        whisperTo,
        mentions: [...new Set(mentions)], // Ensure unique mentions
      });

      // If message sent successfully and there are mentions
      if (response && mentions.length > 0) {
        // Handle special mentions
        const specialMentions = mentions.filter(mention =>
          ['everyone', 'admin', 'mod'].includes(mention.toLowerCase())
        );
        const userMentions = mentions.filter(mention =>
          !['everyone', 'admin', 'mod'].includes(mention.toLowerCase())
        );

        try {
          const mentionsPayload = {
            mentions: userMentions,
            specialMentions,
            roomId: room.id,
            messageId: response.id
          };

          const mentionRes = await apiRequest("POST", `/api/messages/${response.id}/mentions`, mentionsPayload);
          if (!mentionRes.ok) {
            const error = await mentionRes.text();
            console.error('Failed to process mentions:', error);
          }
        } catch (error) {
          console.error('Failed to process mentions:', error);
        }
      }
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

      const cursorPosition = e.target.selectionStart || 0;
      const beforeCursor = newValue.slice(0, cursorPosition);
      const match = beforeCursor.match(/@([^@\s]*)$/);

      if (match) {
        const matchStart = match.index!;
        setShowMentions(true);
        setMentionSearch(match[1]);
        mentionMatchRef.current = { start: matchStart, end: cursorPosition };
      } else {
        setShowMentions(false);
        mentionMatchRef.current = null;
      }

      setIsTyping(true);
      apiRequest("POST", `/api/rooms/${room.id}/typing`, { isTyping: true })
        .catch(error => console.error('Failed to update typing status:', error));

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
    apiRequest("POST", `/api/rooms/${room.id}/typing`, { isTyping: false })
      .catch(error => console.error('Failed to update typing status:', error));
  }, 2000);

  const handleMentionSelect = (username: string) => {
    if (mentionMatchRef.current) {
      const { start, end } = mentionMatchRef.current;
      const newMessage = message.slice(0, start) + '@' + username + ' ' + message.slice(end);
      setMessage(newMessage);
      setShowMentions(false);
      setMentionSearch('');
      inputRef.current?.focus();
    }
  };

  useEffect(() => {
    console.log("Room data in ChatRoom:", room);
    console.log("Participants:", room.participants);
  }, [room]);

  useEffect(() => {
    const typingInterval = setInterval(async () => {
      try {
        const res = await apiRequest("GET", `/api/rooms/${room.id}/typing`);
        if (!res.ok) throw new Error('Failed to fetch typing status');
        const data = await res.json();
        setTypingUsers(data);
      } catch (error) {
        console.error('Failed to fetch typing status:', error);
      }
    }, 1000);

    return () => {
      clearInterval(typingInterval);
      if (isTyping) {
        apiRequest("POST", `/api/rooms/${room.id}/typing`, { isTyping: false })
          .catch(error => console.error('Failed to clear typing status:', error));
      }
    };
  }, [room.id, isTyping]);

  const { data: allUsers } = useQuery<User[]>({
    queryKey: [`/api/rooms/${room.id}/users`],
    refetchInterval: 1000,
    select: (users) => {
      const uniqueUsers = new Map();
      users?.forEach(user => {
        uniqueUsers.set(user.id, user);
      });
      return Array.from(uniqueUsers.values());
    }
  });

  function formatMessageContent(content: string | null) {
    if (!content) return "";

    return content
      .split(/(@[^@\s]+(?:\s+[^@\s]+)*\s|\b(?:https?:\/\/|www\.)[^\s]+\b)/g)
      .map((part, index) => {
        if (part.startsWith('@')) {
          return (
            <span
              key={index}
              className="text-blue-500 font-medium hover:underline cursor-pointer"
              onClick={() => {
                console.log('Clicked mention:', part);
              }}
            >
              {part}
            </span>
          );
        } else if (/^(?:https?:\/\/|www\.)[^\s]+$/.test(part)) {
          const href = part.startsWith('www.') ? `https://${part}` : part;
          return (
            <a
              key={index}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:underline break-all"
              onClick={(e) => {
                e.stopPropagation();
              }}
            >
              {part}
            </a>
          );
        }
        return <span key={index}>{part}</span>;
      });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-2 sm:p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setIsSidebarCollapsed(!isSidebarCollapsed);
              onToggleSidebar();
            }}
            className="flex-shrink-0"
            title={isSidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <PanelLeftClose
              className={`h-4 w-4 transition-transform duration-200 ${isSidebarCollapsed ? "rotate-180" : ""}`}
            />
          </Button>
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
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="flex flex-col min-w-0">
                <h2 className="font-semibold truncate">{room.name}</h2>
                <div className="flex items-center text-sm text-muted-foreground gap-1">
                  {!room.isPublic && room.inviteCode && (
                    <div className="flex items-center gap-1 mr-2">
                      <Lock className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">
                        Invite Code: {room.inviteCode}
                      </span>
                    </div>
                  )}
                  <Users className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">
                    {room.participants?.filter((p) => p.isOnline).length ?? 0}{" "}
                    online · {room.participants?.length ?? 0} total
                  </span>
                </div>
              </div>
              {(isOwner || user?.role === UserRole.OWNER) && (
                <>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsEditingName(true)}
                    className="flex-shrink-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <AlertDialog
                    open={isDeleteDialogOpen}
                    onOpenChange={setIsDeleteDialogOpen}
                  >
                    <AlertDialogTrigger asChild>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="sm:max-w-[425px]">
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
              {!isOwner && user?.id !== room.createdById && (
                <AlertDialog
                  open={isLeaveDialogOpen}
                  onOpenChange={setIsLeaveDialogOpen}
                >
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-muted-foreground/80 flex-shrink-0"
                    >
                      <LogOut className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="sm:max-w-[425px]">
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
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col overflow-hidden">
          <div
            className="flex-1 overflow-auto p-2 sm:p-4 relative"            ref={messagesContainerRef}
          >
            {isLoading ? (
              <div className="flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              messages?.map((message) => (
                <MessageBubble
                  key={message.id}
                  message={message}                  roomId={room.id}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
          {showScrollButton && (
            <Button
              className="fixed bottom-32 right-72 rounded-full shadow-lg z-50 md:block hidden p-3"
              size="icon"
              onClick={scrollToBottom}
            >
              <ArrowDown className="h-5 w-5" />
            </Button>
          )}
          <form onSubmit={handleSubmit} className="border-t p-2 sm:p-4 space-y-4 relative">
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
            <div className="flex gap-2 items-center relative">
              <input
                type="file"
                accept={Object.keys(ALLOWED_FILE_TYPES).join(",")}
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileSelect}
              />
              <div className="flex-1 relative">
                <Input
                  ref={inputRef}
                  type="text"
                  placeholder="Use @ to mention people..."
                  className="pr-12"
                  value={message}
                  onChange={handleMessageChange}
                  maxLength={MAX_MESSAGE_LENGTH}
                  disabled={sendMessageMutation.isPending}
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                  {message.length}/{MAX_MESSAGE_LENGTH}
                </span>
                {showMentions && (
                  <div className="absolute bottom-full left-0 w-80 bg-popover border rounded-lg shadow-lg mb-2 overflow-hidden">
                    <Command>
                      <CommandInput
                        placeholder="Search users..."
                        value={mentionSearch}
                        onValueChange={setMentionSearch}
                      />
                      <CommandList>
                        <CommandEmpty>No users found</CommandEmpty>
                        <CommandGroup heading="Special Mentions">
                          {SPECIAL_MENTIONS
                            .filter(mention =>
                              mention.username.toLowerCase().includes(mentionSearch.toLowerCase())
                            )
                            .map(mention => (
                              <CommandItem
                                key={mention.id}
                                value={mention.username}
                                onSelect={() => handleMentionSelect(mention.username)}
                              >
                                <Users className="h-4 w-4 mr-2" />
                                <span className="font-medium">@{mention.username}</span>
                                <span className="ml-2 text-muted-foreground text-sm">{mention.description}</span>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                        <CommandGroup heading="Room Members">
                          {room.participants
                            ?.filter(participant =>
                              participant.username.toLowerCase().includes(mentionSearch.toLowerCase()) &&
                              participant.id !== user?.id
                            )
                            .map((participant) => (
                              <CommandItem
                                key={participant.id}
                                value={participant.username}
                                onSelect={() => handleMentionSelect(participant.username)}
                              >
                                <Avatar className="h-6 w-6 mr-2">
                                  <AvatarImage src={participant.avatarUrl ?? undefined} />
                                  <AvatarFallback>{participant.username[0].toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <span className="font-medium">@{participant.username}</span>
                              </CommandItem>
                            ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={sendMessageMutation.isPending}
              >
                <Image className="h-5 w-5" />
              </Button>
              <Button
                type="submit"
                size="icon"
                disabled={sendMessageMutation.isPending || (!message.trim() && !mediaFile)}
              >
                {sendMessageMutation.isPending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </Button>
            </div>
            {showCommands && (
              <div ref={commandsRef} className="absolute bottom-20 left-4 w-64 bg-popover border rounded-lg shadow-lg overflow-hidden">
                <Command>
                  <CommandInput placeholder="Search commands..." />
                  <CommandList>
                    <CommandEmpty>No commands found</CommandEmpty>
                    <CommandGroup>
                      {commands.map((command) => (
                        <CommandItem
                          key={command.name}
                          value={command.name}
                          onSelect={() => handleCommandSelect(command)}
                        >
                          <span className="font-medium">/{command.name}</span>
                          <span className="ml-2 text-muted-foreground text-sm">{command.description}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </div>
            )}
          </form>
        </div>
        <div className="w-64 border-l hidden md:block">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Members</h3>
          </div>
          <div className="p-2">
            {room.participants?.map((member) => (
              <div key={member.id} className="flex items-center gap-2 p-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={member.avatarUrl ?? undefined} />
                  <AvatarFallback>
                    {member.username[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{member.username}</span>
                  <span className="text-xs text-muted-foreground">
                    {member.isOnline ? "Online" : "Offline"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <audio ref={audioRef} src={VINE_BOOM_URL} />
      <audio ref={messageSoundRef} src={GOOGLE_MESSAGE_SOUND_URL} />
    </div>
  );
}

export default ChatRoom;