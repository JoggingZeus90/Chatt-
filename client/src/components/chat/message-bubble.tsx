import { MessageWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { UserStatus } from "./user-status";
import { useState, useEffect, useRef } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

export function MessageBubble({ message }: { message: MessageWithUser }) {
  const { user } = useAuth();
  const isOwn = message.userId === user?.id;
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);

  // Ensure we have a full URL for the media
  const mediaUrl = message.mediaUrl 
    ? new URL(message.mediaUrl, window.location.origin).toString()
    : null;

  useEffect(() => {
    if (mediaUrl && imgRef.current) {
      // Reset states when URL changes
      setImageError(false);
      setImageLoading(true);

      console.log('Loading image:', {
        url: mediaUrl,
        timestamp: new Date().toISOString(),
        naturalWidth: imgRef.current?.naturalWidth,
        naturalHeight: imgRef.current?.naturalHeight,
        complete: imgRef.current?.complete
      });
    }
  }, [mediaUrl]);

  return (
    <div
      className={cn("flex gap-2 mb-4", {
        "justify-end": isOwn,
      })}
    >
      {!isOwn && (
        <UserStatus
          username={message.user.username}
          isOnline={message.user.isOnline}
          lastSeen={new Date(message.user.lastSeen)}
          avatarUrl={message.user.avatarUrl}
        />
      )}
      <div
        className={cn(
          "rounded-lg px-4 py-2 max-w-[70%] break-words",
          isOwn
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        <div className="flex items-baseline gap-2">
          {!isOwn && (
            <span className="font-semibold text-sm">{message.user.username}</span>
          )}
          <span className="text-xs opacity-70">
            {format(new Date(message.createdAt), "HH:mm")}
          </span>
        </div>
        {mediaUrl && message.mediaType === "image" && !imageError && (
          <div className="mt-2 relative">
            {imageLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-secondary/20">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            )}
            <img
              ref={imgRef}
              src={mediaUrl}
              alt="Shared image"
              className="rounded-lg max-w-full max-h-64 object-contain"
              onError={(e) => {
                console.error("Failed to load image:", {
                  url: mediaUrl,
                  error: e,
                  timestamp: new Date().toISOString(),
                  target: e.target
                });
                setImageError(true);
                setImageLoading(false);
              }}
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                console.log("Image loaded successfully:", {
                  url: mediaUrl,
                  timestamp: new Date().toISOString(),
                  naturalWidth: img.naturalWidth,
                  naturalHeight: img.naturalHeight,
                  complete: img.complete
                });
                setImageLoading(false);
              }}
            />
          </div>
        )}
        {imageError && (
          <div className="flex items-center gap-2 text-destructive text-sm mt-2">
            <AlertCircle className="h-4 w-4" />
            Failed to load image
          </div>
        )}
        {message.content && <p className="mt-1">{message.content}</p>}
      </div>
    </div>
  );
}