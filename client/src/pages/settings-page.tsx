import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Form, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { UserManagement } from "@/components/ui/user-management";
import { ColorPicker } from "@/components/ui/color-picker";
import { Switch } from "@/components/ui/switch";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, AlertTriangle, Upload } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updateUserSchema } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useTheme } from "@/hooks/use-theme";
import React from 'react';

export default function SettingsPage() {
  const { user, logoutMutation, isAdmin, isModerator } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();

  const form = useForm({
    resolver: zodResolver(updateUserSchema),
    defaultValues: {
      username: user?.username || "",
      avatarUrl: user?.avatarUrl || "",
      currentPassword: "",
      newPassword: "",
      appearOffline: user?.appearOffline || false,
    },
  });

  // Reset form when user data changes
  React.useEffect(() => {
    if (user) {
      form.reset({
        username: user.username,
        avatarUrl: user.avatarUrl || "",
        currentPassword: "",
        newPassword: "",
        appearOffline: user.appearOffline,
      });
    }
  }, [user, form]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive",
      });
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) throw new Error("Upload failed");

      const { url } = await uploadRes.json();
      form.setValue("avatarUrl", url);
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload image",
        variant: "destructive",
      });
    }
  };

  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PATCH", "/api/user/profile", data);
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error);
      }
      return res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/user"], updatedUser);
      toast({
        title: "Profile updated",
        description: "Your profile has been updated successfully.",
      });

      // Only reset the form if this is a full profile update
      if (Object.keys(form.getValues()).length > 1) {
        form.reset({
          username: updatedUser.username,
          avatarUrl: updatedUser.avatarUrl || "",
          currentPassword: "",
          newPassword: "",
          appearOffline: updatedUser.appearOffline,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAppearOfflineChange = (checked: boolean) => {
    form.setValue("appearOffline", checked);
    // Immediately submit the form when appearOffline changes
    updateProfileMutation.mutate({
      appearOffline: checked,
    });
  };

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/user");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      setLocation("/auth");
      toast({
        title: "Account deleted",
        description: "Your account has been successfully deleted.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Chat
        </Link>

        <Card className="mb-8">
          <Tabs defaultValue="profile" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="profile" className="flex-1">Profile</TabsTrigger>
              <TabsTrigger value="appearance" className="flex-1">Appearance</TabsTrigger>
              {isAdmin && <TabsTrigger value="admin" className="flex-1">Admin</TabsTrigger>}
            </TabsList>

            <TabsContent value="profile" className="p-6">
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => updateProfileMutation.mutate(data))} className="space-y-6">
                  {(isAdmin || isModerator) && (
                    <div className="flex items-center justify-between p-4 bg-secondary/20 rounded-lg">
                      <div className="space-y-0.5">
                        <Label htmlFor="appearOffline">Appear Offline</Label>
                        <p className="text-sm text-muted-foreground">
                          Hide your online status from other users
                        </p>
                      </div>
                      <Switch
                        id="appearOffline"
                        checked={form.watch("appearOffline")}
                        onCheckedChange={handleAppearOfflineChange}
                      />
                    </div>
                  )}

                  <div className="flex flex-col items-center space-y-4">
                    <Avatar className="h-24 w-24">
                      <AvatarImage src={form.watch("avatarUrl")} />
                      <AvatarFallback>
                        {form.watch("username")?.[0]?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => document.getElementById('avatar-upload')?.click()}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        Upload Image
                      </Button>
                      <input
                        id="avatar-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileUpload}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="avatarUrl"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Avatar URL (optional)</FormLabel>
                          <Input
                            type="url"
                            placeholder="https://example.com/avatar.jpg"
                            {...field}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <Input {...field} />
                          <FormMessage />
                          <p className="text-sm text-muted-foreground mt-2">
                            You can only change your username once every 7 days.
                          </p>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="currentPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Current Password</FormLabel>
                          <Input type="password" {...field} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="newPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>New Password (optional)</FormLabel>
                          <Input type="password" {...field} />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end gap-4">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="destructive">
                          Delete Account
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete your
                            account and remove all of your data from our servers.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteAccountMutation.mutate()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {deleteAccountMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                Delete Account
                              </>
                            )}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    <Button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                    >
                      {updateProfileMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </form>
              </Form>
            </TabsContent>

            <TabsContent value="appearance" className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium">Theme</h3>
                  <p className="text-sm text-muted-foreground">
                    Switch between light and dark mode
                  </p>
                </div>
                <ThemeToggle />
              </div>

              <div className="space-y-2">
                <h3 className="font-medium">Colors</h3>
                <p className="text-sm text-muted-foreground">
                  Customize the accent colors used throughout the app
                </p>
                <ColorPicker
                  label="Primary Color"
                  value={theme.primary}
                  onChange={(newColor) => {
                    setTheme({
                      ...theme,
                      primary: newColor,
                    });
                  }}
                />
              </div>
            </TabsContent>

            {isAdmin && (
              <TabsContent value="admin" className="p-6">
                <UserManagement />
              </TabsContent>
            )}
          </Tabs>
        </Card>
      </div>
    </div>
  );
}