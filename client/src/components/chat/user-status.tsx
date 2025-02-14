import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
}: {
  username: string;
  isOnline: boolean;
  lastSeen: Date;
}) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="relative">
              {username[0].toUpperCase()}
              <span
                className={`absolute bottom-0 right-0 h-2 w-2 rounded-full ring-1 ring-background ${
                  isOnline ? "bg-green-500" : "bg-gray-500"
                }`}
              />
            </AvatarFallback>
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
