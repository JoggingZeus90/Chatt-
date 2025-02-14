import { useState, useEffect, useRef, ChangeEvent } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageBubble } from "./message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Room, MessageWithUser } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Send, Loader2, Image, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const MAX_MESSAGE_LENGTH = 100;
const ALLOWED_FILE_TYPES = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/webm": "video",
} as const;

export default function ChatRoom({ room }: { room: Room }) {
  const [message, setMessage] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { data: messages, isLoading } = useQuery<MessageWithUser[]>({
    queryKey: [`/api/rooms/${room.id}/messages`],
    refetchInterval: 1000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ content, mediaUrl, mediaType }: { content: string; mediaUrl?: string; mediaType?: string }) => {
      await apiRequest("POST", `/api/rooms/${room.id}/messages`, {
        content,
        roomId: room.id,
        mediaUrl,
        mediaType,
      });
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

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() && !mediaFile) return;

    let mediaUrl: string | undefined;
    let mediaType: string | undefined;

    if (mediaFile) {
      const formData = new FormData();
      formData.append("file", mediaFile);

      try {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          throw new Error("Upload failed: " + (await uploadRes.text()));
        }

        // Check content type to ensure we're getting JSON
        const contentType = uploadRes.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Invalid response from server: Expected JSON but got " + contentType);
        }

        const { url } = await uploadRes.json();
        if (!url) {
          throw new Error("No URL returned from server");
        }

        mediaUrl = url;
        mediaType = ALLOWED_FILE_TYPES[mediaFile.type as keyof typeof ALLOWED_FILE_TYPES];
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
        content: message.trim() || (mediaFile ? `Sent ${mediaFile.type.includes('image') ? 'an image' : 'a video'}` : ""),
        mediaUrl,
        mediaType,
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

  return (
    <div className="flex flex-col h-full">
      <div className="border-b p-4">
        <h2 className="font-semibold">{room.name}</h2>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          messages?.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))
        )}
        <div ref={messagesEndRef} />
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