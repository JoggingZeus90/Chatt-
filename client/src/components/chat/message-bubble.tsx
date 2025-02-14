import { MessageWithUser } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { format } from "date-fns";
import { UserStatus } from "./user-status";
import { useState, useEffect, useRef } from "react";
import { AlertCircle, Loader2, Trash2, Pencil, X, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type ExtendedMessageWithUser = MessageWithUser & {
  whisperTo?: string | null;
}

export function MessageBubble({ message, roomId }: { message: ExtendedMessageWithUser; roomId: number }) {
  const { user } = useAuth();
  const isOwn = message.userId === user?.id;
  const isWhisper = Boolean(message.whisperTo);
  const canSeeWhisper = isWhisper && (isOwn || message.whisperTo === user?.username);
  const canDelete = isOwn || user?.role === 'admin' || user?.role === 'moderator';
  const [imageError, setImageError] = useState(false);
  const [imageLoading, setImageLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(message.content || "");
  const imgRef = useRef<HTMLImageElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // If this is a whisper and the current user can't see it, don't render anything
  if (isWhisper && !canSeeWhisper) {
    return null;
  }

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

  const editMessageMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("PATCH", `/api/messages/${message.id}`, {
        content: editedContent,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/rooms/${roomId}/messages`] });
      setIsEditing(false);
      toast({
        title: "Message updated",
        description: "Your message has been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (mediaUrl && imgRef.current) {
      setImageError(false);
      setImageLoading(true);
    }
  }, [mediaUrl]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleStartEdit = () => {
    setEditedContent(message.content || "");
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedContent(message.content || "");
  };

  const handleSaveEdit = () => {
    if (editedContent.trim()) {
      editMessageMutation.mutate();
    }
  };

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
          isWhisper ? (
            isOwn
              ? "bg-violet-500 text-white"
              : "bg-violet-100 text-violet-900"
          ) : (
            isOwn
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground"
          )
        )}
      >
        {/* Message header with username and timestamp */}
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

        {/* Whisper indicator */}
        {isWhisper && (
          <div className="text-xs italic mb-1">
            {isOwn
              ? `Whispered to ${message.whisperTo}`
              : "Whispered to you"
            }
          </div>
        )}

        {/* Message content */}
        {message.content && !isEditing && (
          <div className="mt-1">
            <p>{message.content}</p>
            {message.editedAt && (
              <span className="text-xs text-muted-foreground italic">
                edited {format(new Date(message.editedAt), "HH:mm")}
              </span>
            )}
          </div>
        )}

        {/* Media content */}
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
              onError={() => {
                setImageError(true);
                setImageLoading(false);
              }}
              onLoad={() => {
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

        {/* Message actions */}
        <div className={cn(
          "absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2",
          isOwn ? "-left-20" : "-right-8"
        )}>
          {isOwn && !isEditing && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleStartEdit}
              disabled={editMessageMutation.isPending}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && !isEditing && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon">
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
        </div>

        {/* Edit form */}
        {isEditing && (
          <div className="mt-1 space-y-2">
            <Input
              ref={inputRef}
              value={editedContent}
              onChange={(e) => {
                if (e.target.value.length <= MAX_MESSAGE_LENGTH) {
                  setEditedContent(e.target.value);
                }
              }}
              maxLength={MAX_MESSAGE_LENGTH}
              className="min-w-[200px]"
              placeholder="Edit your message..."
            />
            <div className="flex items-center justify-end gap-2">
              <span className="text-xs text-muted-foreground">
                {editedContent.length}/{MAX_MESSAGE_LENGTH}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancelEdit}
                disabled={editMessageMutation.isPending}
              >
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={editMessageMutation.isPending || !editedContent.trim()}
              >
                {editMessageMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Save
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}