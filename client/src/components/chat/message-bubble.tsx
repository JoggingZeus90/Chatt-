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
          <Avatar className="h-8 w-8">
            <AvatarImage src={message.user.avatarUrl} />
            <AvatarFallback>
              {message.user.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>
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
        <p className="mt-1">{message.content}</p>
      </div>
    </div>
  );
}