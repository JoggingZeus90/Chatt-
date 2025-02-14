import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Room, MessageWithUser } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Loader2, Image, X, ArrowDown, Pencil, Check, Trash2 } from "lucide-react";
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

const MAX_MESSAGE_LENGTH = 100;
const ALLOWED_FILE_TYPES = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
} as const;

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
  const { toast } = useToast();

  const isOwner = user?.id === room.createdById;

  const { data: messages, isLoading } = useQuery<MessageWithUser[]>({
    queryKey: [`/api/rooms/${room.id}/messages`],
    refetchInterval: 1000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, mediaUrl, mediaType }: { content: string; mediaUrl?: string; mediaType?: string }) => {
      const res = await apiRequest("POST", `/api/rooms/${room.id}/messages`, {
        content,
        roomId: room.id,
        mediaUrl,
        mediaType,
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
      handleScroll(); // Initial check
    }

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !mediaFile) return;

    let uploadedMediaUrl: string | undefined;
    let uploadedMediaType: string | undefined;

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
        content: message.trim(),
        mediaUrl: uploadedMediaUrl,
        mediaType: uploadedMediaType,
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
    }
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
            <h2 className="font-semibold">{room.name}</h2>
            {isOwner && (
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
      <form onSubmit={handleSubmit} className="border-t p-4 space-y-4">
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
        <div className="flex gap-2">
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
          <Input
            value={message}
            onChange={handleMessageChange}
            placeholder="Type a message..."
            disabled={sendMessageMutation.isPending}
            maxLength={MAX_MESSAGE_LENGTH}
          />
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
    </div>
  );
}