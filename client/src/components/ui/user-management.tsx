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
import { apiRequest, queryClient } from "@/lib/queryClient";

export function UserManagement() {
  const { isAdmin, isModerator } = useAuth();
  const { toast } = useToast();
  const [selectedRole, setSelectedRole] = useState<string>();

  const { data: users, isLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: isAdmin || isModerator,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/users/${userId}/role`, { role });
      if (!res.ok) throw new Error("Failed to update role");
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

  if (!isAdmin && !isModerator) {
    return null;
  }

  if (isLoading) {
    return <div>Loading users...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">User Management</h2>
      <div className="space-y-4">
        {users?.map((user) => (
          <div
            key={user.id}
            className="flex items-center justify-between p-4 border rounded-lg"
          >
            <div>
              <p className="font-medium">{user.username}</p>
              <p className="text-sm text-muted-foreground">
                Current role: {user.role}
              </p>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Select
                  onValueChange={(value) => setSelectedRole(value)}
                  defaultValue={user.role}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(UserRole).map((role) => (
                      <SelectItem key={role} value={role}>
                        {role}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedRole) {
                      updateRoleMutation.mutate({
                        userId: user.id,
                        role: selectedRole,
                      });
                    }
                  }}
                  disabled={updateRoleMutation.isPending}
                >
                  Update Role
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
