
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

export function UserStatus({
  username,
  isOnline,
  lastSeen,
  avatarUrl,
}: {
  username: string;
  isOnline: boolean;
  lastSeen: Date;
  avatarUrl?: string;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Avatar className="h-8 w-8 relative">
            <AvatarImage src={avatarUrl} />
            <AvatarFallback>{username[0].toUpperCase()}</AvatarFallback>
            <span
              className={`absolute bottom-0 right-0 h-2 w-2 rounded-full ring-1 ring-background ${
                isOnline ? "bg-green-500" : "bg-gray-500"
              }`}
            />
          </Avatar>
        </TooltipTrigger>
        <TooltipContent>
          <p>{username}</p>
          <p className="text-xs text-muted-foreground">
            {isOnline
              ? "Online"
              : `Last seen ${formatDistanceToNow(lastSeen)} ago`}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
