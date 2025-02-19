import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User, UserRole } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { Loader2, ShieldAlert } from "lucide-react";

export function UserManagement() {
  const { user: currentUser, isAdmin, isOwner } = useAuth();
  const { toast } = useToast();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin || isOwner,
  });

  // Separate users by role and status
  const owners = users?.filter(user => user.role === UserRole.OWNER) || [];
  const admins = users?.filter(user => user.role === UserRole.ADMIN && !user.suspended) || [];
  const moderators = users?.filter(user => user.role === UserRole.MODERATOR && !user.suspended) || [];
  const activeUsers = users?.filter(user =>
    user.role === UserRole.USER && !user.suspended
  ) || [];
  const suspendedUsers = users?.filter(user => user.suspended) || [];

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User role updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const suspendUserMutation = useMutation({
    mutationFn: async ({ userId, reason }: { userId: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/suspend`, { reason });
      if (!res.ok) throw new Error("Failed to suspend user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User suspended successfully",
      });
      setSelectedUser(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const muteUserMutation = useMutation({
    mutationFn: async ({ userId, duration, reason }: { userId: number; duration: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/users/${userId}/mute`, { duration, reason });
      if (!res.ok) throw new Error("Failed to mute user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User muted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unmuteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/users/${userId}/unmute`);
      if (!res.ok) throw new Error("Failed to unmute user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User unmuted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const unsuspendUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/users/${userId}/unsuspend`);
      if (!res.ok) throw new Error("Failed to unsuspend user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/users"] });
      toast({
        title: "Success",
        description: "User unsuspended successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const UserCard = ({ user, showRoleSelect = true }: { user: User; showRoleSelect?: boolean }) => {
    const isUserOwner = user.role === UserRole.OWNER;
    const [selectedRole, setSelectedRole] = useState(user.role);
    const [isChangingRole, setIsChangingRole] = useState(false);
    const [isMuteDialogOpen, setIsMuteDialogOpen] = useState(false);
    const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
    const [localMuteReason, setLocalMuteReason] = useState("");
    const [localMuteDuration, setLocalMuteDuration] = useState("60");
    const [localSuspendReason, setLocalSuspendReason] = useState("");

    const handleRoleChange = (newRole: string) => {
      setSelectedRole(newRole);
      setIsChangingRole(true);
    };

    const handleRoleUpdate = () => {
      if (selectedRole && selectedRole !== user.role) {
        updateRoleMutation.mutate({
          userId: user.id,
          role: selectedRole,
        });
      }
      setIsChangingRole(false);
    };

    const handleMuteClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsMuteDialogOpen(true);
    };

    const handleSuspendClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsSuspendDialogOpen(true);
    };

    const handleMuteSubmitDialog = () => {
      if (!localMuteReason.trim() || parseInt(localMuteDuration) <= 0) {
        toast({
          title: "Missing information",
          description: "Please provide both duration and reason for muting.",
          variant: "destructive",
        });
        return;
      }

      muteUserMutation.mutate({
        userId: user.id,
        duration: parseInt(localMuteDuration),
        reason: localMuteReason,
      });
      setIsMuteDialogOpen(false);
    };

    const handleSuspendSubmitDialog = () => {
      if (!localSuspendReason.trim()) {
        toast({
          title: "Missing information",
          description: "Please provide a reason for suspension.",
          variant: "destructive",
        });
        return;
      }

      suspendUserMutation.mutate({
        userId: user.id,
        reason: localSuspendReason,
      });
      setIsSuspendDialogOpen(false);
    };

    // Show special card for owners
    if (isUserOwner && user.id !== currentUser?.id) {
      return (
        <div className="flex items-center justify-between p-4 border-2 border-primary rounded-lg bg-primary/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <p className="font-medium">{user.username}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Role: Owner
            </p>
            <p className="text-sm text-primary/80">
              This user is an owner of the application
            </p>
          </div>
        </div>
      );
    }

    // Show current user's owner card
    if (isUserOwner && user.id === currentUser?.id) {
      return (
        <div className="flex items-center justify-between p-4 border-2 border-primary rounded-lg bg-primary/5">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-primary" />
              <p className="font-medium">{user.username}</p>
            </div>
            <p className="text-sm text-muted-foreground">
              Role: Owner
            </p>
            <p className="text-sm text-primary/80">
              You are the owner of this application
            </p>
          </div>
        </div>
      );
    }

    // For non-owner users, show regular card with actions
    return (
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div>
          <p className="font-medium">{user.username}</p>
          <p className="text-sm text-muted-foreground">
            Role: {user.role}
          </p>
          {user.muted && (
            <p className="text-sm text-orange-500">
              Muted until: {format(new Date(user.mutedUntil!), "PPp")}
              <br />
              Reason: {user.mutedReason}
            </p>
          )}
        </div>
        {(isAdmin || isOwner) && showRoleSelect && user.id !== currentUser?.id && (
          <div className="flex items-center gap-2">
            <Select
              value={selectedRole}
              onValueChange={handleRoleChange}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(UserRole)
                  .filter(role => role !== UserRole.OWNER)
                  .map((role) => (
                    <SelectItem key={role} value={role}>
                      {role}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {isChangingRole && (
              <Button
                variant="outline"
                onClick={handleRoleUpdate}
                disabled={updateRoleMutation.isPending}
              >
                {updateRoleMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Update Role
              </Button>
            )}
            {!user.muted ? (
              <Dialog open={isMuteDialogOpen} onOpenChange={setIsMuteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" onClick={handleMuteClick}>
                    Mute
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Mute User</DialogTitle>
                    <DialogDescription>
                      Set the duration and reason for muting {user.username}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Duration (minutes)</label>
                      <Input
                        type="number"
                        value={localMuteDuration}
                        onChange={(e) => setLocalMuteDuration(e.target.value)}
                        min="1"
                        disabled={muteUserMutation.isPending}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Reason</label>
                      <Input
                        value={localMuteReason}
                        onChange={(e) => setLocalMuteReason(e.target.value)}
                        placeholder="Reason for muting"
                        disabled={muteUserMutation.isPending}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      type="button"
                      onClick={handleMuteSubmitDialog}
                      disabled={muteUserMutation.isPending || !localMuteReason.trim() || parseInt(localMuteDuration) <= 0}
                    >
                      {muteUserMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Mute User
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : (
              <Button
                variant="outline"
                onClick={() => unmuteUserMutation.mutate(user.id)}
                disabled={unmuteUserMutation.isPending}
              >
                {unmuteUserMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Unmute
              </Button>
            )}
            <Dialog open={isSuspendDialogOpen} onOpenChange={setIsSuspendDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" onClick={handleSuspendClick}>
                  Suspend
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Suspend User</DialogTitle>
                  <DialogDescription>
                    Please provide a reason for suspending {user.username}
                  </DialogDescription>
                </DialogHeader>
                <Input
                  placeholder="Suspension reason"
                  value={localSuspendReason}
                  onChange={(e) => setLocalSuspendReason(e.target.value)}
                  disabled={suspendUserMutation.isPending}
                />
                <DialogFooter>
                  <Button
                    variant="destructive"
                    onClick={handleSuspendSubmitDialog}
                    disabled={suspendUserMutation.isPending || !localSuspendReason.trim()}
                  >
                    {suspendUserMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Suspend User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </div>
    );
  };

  if (!isAdmin && !isOwner) {
    return null;
  }

  if (isLoading) {
    return <div>Loading users...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Owner Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-primary">Owner</h3>
        <div className="space-y-4">
          {owners.map((user) => (
            <UserCard key={user.id} user={user} showRoleSelect={false} />
          ))}
        </div>
      </div>

      {/* Admins Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-primary">Administrators</h3>
        <div className="space-y-4">
          {admins.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
          {admins.length === 0 && (
            <p className="text-sm text-muted-foreground">No administrators found</p>
          )}
        </div>
      </div>

      {/* Moderators Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-blue-500">Moderators</h3>
        <div className="space-y-4">
          {moderators.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
          {moderators.length === 0 && (
            <p className="text-sm text-muted-foreground">No moderators found</p>
          )}
        </div>
      </div>

      {/* Regular Users Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">Regular Users</h3>
        <div className="space-y-4">
          {activeUsers.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
          {activeUsers.length === 0 && (
            <p className="text-sm text-muted-foreground">No regular users found</p>
          )}
        </div>
      </div>

      {/* Suspended Users Section */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-destructive">Suspended Users</h3>
        <div className="space-y-4">
          {suspendedUsers.map((user) => (
            <div
              key={user.id}
              className="flex items-center justify-between p-4 border border-destructive/50 rounded-lg bg-destructive/5"
            >
              <div>
                <p className="font-medium">{user.username}</p>
                <p className="text-sm text-muted-foreground">
                  Role: {user.role}
                </p>
                <p className="text-sm text-destructive mt-1">
                  Suspended: {format(new Date(user.suspendedAt!), "PPp")}
                </p>
                <p className="text-sm text-destructive">
                  Reason: {user.suspendedReason}
                </p>
              </div>
              {(isAdmin || isOwner) && (
                <Button
                  variant="outline"
                  onClick={() => unsuspendUserMutation.mutate(user.id)}
                  disabled={unsuspendUserMutation.isPending}
                >
                  {unsuspendUserMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Unsuspend
                </Button>
              )}
            </div>
          ))}
          {suspendedUsers.length === 0 && (
            <p className="text-sm text-muted-foreground">No suspended users</p>
          )}
        </div>
      </div>
    </div>
  );
}