import { MessageWithUser } from "@shared/schema";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
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
        <div className="flex items-center gap-2">
          <UserStatus
            username={message.user.username}
            isOnline={message.user.isOnline}
            lastSeen={new Date(message.user.lastSeen)}
            avatarUrl={message.user.avatarUrl}
          />
        </div>
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
        {message.content.startsWith("http") ? (
          message.content.includes(".mp4") ? (
            <video
              src={message.content}
              controls
              className="w-full max-h-64 rounded-lg object-contain"
            />
          ) : message.content.includes("youtu.be") ||
            message.content.includes("youtube.com") ? (
            <iframe
              width="560"
              height="315"
              src={message.content}
              title="YouTube video player"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="w-full max-h-64 rounded-lg"
            ></iframe>
          ) : (
            <img
              src={message.content}
              alt="Image"
              className="w-full max-h-64 rounded-lg object-contain"
            />
          )
        ) : (
          <p className="mt-1">{message.content.substring(0, 75)}</p>
        )}
      </div>
    </div>
  );
}