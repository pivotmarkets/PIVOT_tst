import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useWalletAuth } from "@/app/hooks/useWalletAuth";
import { Loader2 } from "lucide-react";

export function UsernameModal() {
  const { showUsernameModal, closeUsernameModal, registerUser, isLoading, error } = useWalletAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    if (!username.trim()) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Username cannot be empty.",
      });
      return;
    }

    if (username.trim().length < 3) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Username must be at least 3 characters.",
      });
      return;
    }

    if (username.trim().length > 20) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Username must be 20 characters or less.",
      });
      return;
    }

    try {
      setIsSubmitting(true);
      await registerUser(username.trim());

      toast({
        title: "Success",
        description: `Welcome, ${username}! Your account has been created.`,
      });

      setUsername("");
      closeUsernameModal();
    } catch (err) {
      console.error("Registration failed:", err);
      toast({
        variant: "destructive",
        title: "Registration Failed",
        description: err instanceof Error ? err.message : "Failed to create account. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [username, registerUser, closeUsernameModal, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isSubmitting) {
      handleSubmit();
    }
  };

  return (
    <Dialog
      open={showUsernameModal}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          closeUsernameModal();
        }
      }}
    >
      <DialogContent className="max-h-screen overflow-auto max-w-[95vw] sm:max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Setup Your Account</DialogTitle>
          <DialogDescription className="text-base mt-2">Who do we call you?</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <Input
  id="username"
  placeholder="Enter your username"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
  onKeyDown={handleKeyDown}
  disabled={isSubmitting || isLoading}
  className={`
    w-full bg-[#2f2f35]/70 border 
    ${error ? "border-red-500" : "border-gray-600/50"} 
    rounded-lg p-3 text-gray-100 text-sm pr-16
        [appearance:textfield] 
        [&::-webkit-outer-spin-button]:appearance-none 
        [&::-webkit-inner-spin-button]:appearance-none
        focus:outline-none focus:border-green-400 transition-colors
  `}
  autoFocus
/>


            <p className="text-xs text-gray-500">3-20 characters, letters, numbers, and underscores</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || isLoading || !username.trim()}
            className="w-full bg-[#02834e] hover:bg-[#095435] text-white font-semibold py-2 rounded-md"
          >
            {isSubmitting || isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating account...
              </>
            ) : (
              "Continue"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
