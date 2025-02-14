import { MessageWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { UserStatus } from "./user-status";
import { useState, useEffect, useRef } from "react";
import { AlertCircle, Loader2, Trash2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
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

export function MessageBubble({ message, roomId }: { message: MessageWithUser; roomId: number }) {
  const { user } = useAuth();
  const isOwn = message.userId === user?.id;
  const canDelete = isOwn || user?.role === 'admin' || user?.role === 'moderator';
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const imgRef = useRef<HTMLImageElement>(null);
  const { toast } = useToast();

  // Create an absolute URL for the media
  const mediaUrl = message.mediaUrl 
    ? message.mediaUrl.startsWith('http') 
      ? message.mediaUrl 
      : `${window.location.origin}${message.mediaUrl}`
    : null;

  const deleteMessageMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/messages/${message.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/messages`] });
      toast({
        title: "Message deleted",
        description: "The message has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (mediaUrl && imgRef.current) {
      setImageError(false);
      setImageLoading(true);

      console.log('Loading image:', {
        url: mediaUrl,
        originalUrl: message.mediaUrl,
        timestamp: new Date().toISOString(),
        element: imgRef.current ? {
          complete: imgRef.current.complete,
          naturalWidth: imgRef.current.naturalWidth,
          naturalHeight: imgRef.current.naturalHeight,
          currentSrc: imgRef.current.currentSrc,
        } : null
      });
    }
  }, [mediaUrl, message.mediaUrl]);

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
          "rounded-lg px-4 py-2 max-w-[70%] break-words relative group",
          isOwn
            ? "bg-primary text-primary-foreground"
            : "bg-secondary text-secondary-foreground",
        )}
      >
        {canDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity",
                  isOwn ? "-left-10" : "-right-10"
                )}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Message</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete this message? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <Button 
                  variant="destructive" 
                  onClick={() => deleteMessageMutation.mutate()}
                  disabled={deleteMessageMutation.isPending}
                >
                  {deleteMessageMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Delete"
                  )}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <div className="flex items-baseline gap-2">
          {!isOwn && (
            <div className="flex items-baseline gap-2">
              <span className="font-semibold text-sm">{message.user.username}</span>
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                {message.user.role}
              </span>
            </div>
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
                  originalUrl: message.mediaUrl,
                  error: e,
                  timestamp: new Date().toISOString(),
                  currentTarget: {
                    src: (e.currentTarget as HTMLImageElement).src,
                    complete: (e.currentTarget as HTMLImageElement).complete,
                    naturalWidth: (e.currentTarget as HTMLImageElement).naturalWidth,
                    naturalHeight: (e.currentTarget as HTMLImageElement).naturalHeight,
                  }
                });
                setImageError(true);
                setImageLoading(false);
              }}
              onLoad={(e) => {
                const img = e.target as HTMLImageElement;
                console.log("Image loaded successfully:", {
                  url: mediaUrl,
                  originalUrl: message.mediaUrl,
                  timestamp: new Date().toISOString(),
                  element: {
                    complete: img.complete,
                    naturalWidth: img.naturalWidth,
                    naturalHeight: img.naturalHeight,
                    currentSrc: img.currentSrc,
                  }
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