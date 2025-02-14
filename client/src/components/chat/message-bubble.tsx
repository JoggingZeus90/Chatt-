import { MessageWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { UserStatus } from "./user-status";
import { useState } from "react";

export function MessageBubble({ message }: { message: MessageWithUser }) {
  const { user } = useAuth();
  const isOwn = message.userId === user?.id;
  const [imageError, setImageError] = useState(false);

  // Ensure we have a full URL for the media
  const mediaUrl = message.mediaUrl 
    ? message.mediaUrl.startsWith('http') 
      ? message.mediaUrl 
      : `${window.location.origin}${message.mediaUrl}`
    : null;

  console.log('Message media info:', {
    originalUrl: message.mediaUrl,
    processedUrl: mediaUrl,
    mediaType: message.mediaType
  });

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
          <div className="mt-2">
            <img
              src={mediaUrl}
              alt="Shared image"
              className="rounded-lg max-w-full max-h-64 object-contain"
              onError={(e) => {
                console.error("Failed to load image:", mediaUrl);
                setImageError(true);
              }}
            />
          </div>
        )}
        {message.content && <p className="mt-1">{message.content}</p>}
      </div>
    </div>
  );
}