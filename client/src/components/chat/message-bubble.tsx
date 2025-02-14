import { MessageWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { UserStatus } from "./user-status";

export function MessageBubble({ message }: { message: MessageWithUser }) {
  const { user } = useAuth();
  const isOwn = message.userId === user?.id;

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
        {message.mediaUrl && message.mediaType === "image" && (
          <img
            src={message.mediaUrl}
            alt="Shared image"
            className="mt-2 rounded-lg max-w-full max-h-64 object-contain"
          />
        )}
        {message.mediaUrl && message.mediaType === "video" && (
          <video
            src={message.mediaUrl}
            controls
            className="mt-2 rounded-lg max-w-full max-h-64"
          />
        )}
        <p className="mt-1">{message.content}</p>
      </div>
    </div>
  );
}