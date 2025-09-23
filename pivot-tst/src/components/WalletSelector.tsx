// Internal components
import { Button } from "@/components/ui/button";
import { UserCircleIcon, UserIcon } from "@heroicons/react/24/solid";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import {
  APTOS_CONNECT_ACCOUNT_URL,
  AboutAptosConnect,
  type AboutAptosConnectEducationScreen,
  AdapterWallet,
  AdapterNotDetectedWallet,
  AptosPrivacyPolicy,
  WalletItem,
  groupAndSortWallets,
  isAptosConnectWallet,
  isInstallRequired,
  truncateAddress,
  useWallet,
} from "@aptos-labs/wallet-adapter-react";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  Circle,
  Copy,
  LogOut,
  LucideUserCircle,
  LucideUserCircle2,
  Sparkles,
  User,
  UserCircle2,
  Wallet,
  Zap,
} from "lucide-react";
import { useCallback, useState } from "react";

export function WalletSelector() {
  const { account, connected, disconnect, wallet } = useWallet();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const closeDialog = useCallback(() => setIsDialogOpen(false), []);

  const copyAddress = useCallback(async () => {
    if (!account?.address.toStringLong()) return;
    try {
      await navigator.clipboard.writeText(account.address.toStringLong());
      toast({
        title: "Success",
        description: "Copied wallet address to clipboard.",
      });
    } catch {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to copy wallet address.",
      });
    }
  }, [account?.address, toast]);

  return connected ? (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="default"
            className="group relative overflow-hidden bg-[#02834e] hover:bg-[#095435] font-medium px-4 py-2 rounded-lg hover:shadow-sm hover:shadow-black-900/10 focus:outline-none focus:ring-0 active:outline-none active:ring-0"
          >
            <div className="relative flex items-center  gap-3">
              {/* AI Profile Circle */}
              <div className="relative">
                <div className="w-6 h-6 rounded-full bg-none flex items-center justify-center">
                <Wallet className="h-5 w-5 text-white" />
                </div>
              </div>

              {/* Address/Name */}
              <span className="text-sm font-semibold">
                {account?.ansName || truncateAddress(account?.address.toStringLong()) || "Unknown"}
              </span>

              <ChevronDown className="h-4 w-4 text-slate-200 transition-transform group-hover:rotate-180 duration-200" />
            </div>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64 border-0 bg-[#2d2d33] shadow-2xl rounded-xl p-2">
          {/* Profile Header */}
          <div className="px-3 py-3 mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#02834e] flex items-center justify-center shadow-lg">
                <Circle className="h-5 w-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-200 dark:text-slate-100">
                    {account?.ansName || "User"}
                  </span>
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xs text-slate-200 dark:text-slate-300 font-mono">
                  {truncateAddress(account?.address.toStringLong())}
                </span>
              </div>
            </div>
          </div>

          <DropdownMenuItem
            onSelect={copyAddress}
            className="group flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center transition-colors">
              <Copy className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            </div>
            <span className="text-sm font-medium text-slate-300 dark:text-slate-800">Copy Address</span>
          </DropdownMenuItem>

          {wallet && isAptosConnectWallet(wallet) && (
            <DropdownMenuItem asChild>
              <a
                href={APTOS_CONNECT_ACCOUNT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
              >
                <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center group-hover:bg-purple-200 dark:group-hover:bg-purple-800/50 transition-colors">
                  <User className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                </div>
                <span className="text-sm font-medium text-slate-300 dark:text-slate-300">Manage Account</span>
              </a>
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator className="my-2 bg-slate-200/50 dark:bg-slate-700/50" />

          <DropdownMenuItem
            onSelect={disconnect}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer"
          >
            <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/50 flex items-center justify-center ">
              <LogOut className="h-4 w-4 text-red-600 dark:text-red-400" />
            </div>
            <span className="text-sm font-medium text-red-400 dark:text-slate-300">Disconnect</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  ) : (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button className="group relative overflow-hidden bg-[#02834e] hover:bg-[#17513f] text-white font-semibold px-6 py-3 rounded-md transition-all ">
          <div className="relative flex items-center gap-3">
            {/* Wallet Icon with animation */}
            <div className="relative">
              <Wallet className="h-5 w-5" />
            </div>

            <span className="text-sm font-bold">Sign in</span>
          </div>
        </Button>
      </DialogTrigger>
      <ConnectWalletDialog close={closeDialog} />
    </Dialog>
  );
}

interface ConnectWalletDialogProps {
  close: () => void;
}

function ConnectWalletDialog({ close }: ConnectWalletDialogProps) {
  const { wallets = [], notDetectedWallets = [] } = useWallet();
  const { aptosConnectWallets, availableWallets, installableWallets } = groupAndSortWallets([
    ...wallets,
    ...notDetectedWallets,
  ]);

  const hasAptosConnectWallets = !!aptosConnectWallets.length;

  return (
    <DialogContent className="max-h-screen overflow-auto">
      <AboutAptosConnect renderEducationScreen={renderEducationScreen}>
        <DialogHeader>
          <DialogTitle className="flex flex-col text-center leading-snug text-white">
            {hasAptosConnectWallets ? (
              <>
                <span>Log in or sign up</span>
                <span>with Social + Aptos Connect</span>
              </>
            ) : (
              "Connect Wallet"
            )}
          </DialogTitle>
        </DialogHeader>

        {hasAptosConnectWallets && (
          <div className="flex flex-col gap-2 pt-3">
            {aptosConnectWallets.map((wallet) => (
              <AptosConnectWalletRow key={wallet.name} wallet={wallet} onConnect={close} />
            ))}
            <p className="flex gap-1 justify-center items-center text-gray-300 text-sm">
              Learn more about{" "}
              <AboutAptosConnect.Trigger className="flex gap-1 py-3 items-center text-white hover:text-blue-400 transition-colors">
                Aptos Connect <ArrowRight size={16} />
              </AboutAptosConnect.Trigger>
            </p>
            <AptosPrivacyPolicy className="flex flex-col items-center py-1">
              <p className="text-xs leading-5 text-gray-300">
                <AptosPrivacyPolicy.Disclaimer />{" "}
                <AptosPrivacyPolicy.Link className="text-gray-300 underline underline-offset-4 hover:text-blue-400" />
                <span className="text-gray-300">.</span>
              </p>
              <AptosPrivacyPolicy.PoweredBy className="flex gap-1.5 items-center text-xs leading-5 text-gray-300" />
            </AptosPrivacyPolicy>
            <div className="flex items-center gap-3 pt-4 text-gray-300">
              <div className="h-px w-full bg-gray-600" />
              Or
              <div className="h-px w-full bg-gray-600" />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-3">
          {availableWallets.map((wallet) => (
            <WalletRow key={wallet.name} wallet={wallet} onConnect={close} />
          ))}
          {!!installableWallets.length && (
            <Collapsible className="flex flex-col gap-3">
              <CollapsibleTrigger asChild>
                <Button size="sm" variant="default" className="gap-2 text-black hover:bg-[#e8eceb69]">
                  More wallets <ChevronDown />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-3">
                {installableWallets.map((wallet) => (
                  <WalletRow key={wallet.name} wallet={wallet} onConnect={close} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      </AboutAptosConnect>
    </DialogContent>
  );
}

interface WalletRowProps {
  wallet: AdapterWallet | AdapterNotDetectedWallet;
  onConnect?: () => void;
}

function WalletRow({ wallet, onConnect }: WalletRowProps) {
  return (
    <WalletItem
      wallet={wallet}
      onConnect={onConnect}
      className="flex items-center justify-between px-4 py-3 gap-4 border border-gray-700 rounded-md"
    >
      <div className="flex items-center gap-4">
        <WalletItem.Icon className="h-6 w-6" />
        <WalletItem.Name className="text-base font-normal text-white" />
      </div>
      {isInstallRequired(wallet) ? (
        <Button size="sm" variant="default" asChild className="text-black hover:bg-[#e8eceb69]">
          <WalletItem.InstallLink />
        </Button>
      ) : (
        <WalletItem.ConnectButton asChild>
          <Button size="sm" className="text-black hover:bg-[#e8eceb69]">
            Connect
          </Button>
        </WalletItem.ConnectButton>
      )}
    </WalletItem>
  );
}

function AptosConnectWalletRow({ wallet, onConnect }: WalletRowProps) {
  return (
    <WalletItem wallet={wallet} onConnect={onConnect}>
      <WalletItem.ConnectButton asChild>
        <Button
          size="lg"
          variant="outline"
          className="w-full gap-4 text-white bg-gray-900/95 border-[#008259]/70 hover:bg-[#02834e]/50 hover:text-white"
        >
          <WalletItem.Icon className="h-5 w-5" />
          <WalletItem.Name className="text-base font-normal" />
        </Button>
      </WalletItem.ConnectButton>
    </WalletItem>
  );
}

function renderEducationScreen(screen: AboutAptosConnectEducationScreen) {
  return (
    <>
      <DialogHeader className="grid grid-cols-[1fr_4fr_1fr] items-center space-y-0">
        <Button variant="default" size="icon" onClick={screen.cancel}>
          <ArrowLeft />
        </Button>
        <DialogTitle className="leading-snug text-base text-center text-white">About Aptos Connect</DialogTitle>
      </DialogHeader>

      <div className="flex h-[162px] pb-3 items-end justify-center">
        <screen.Graphic />
      </div>
      <div className="flex flex-col gap-2 text-center pb-4">
        <screen.Title className="text-xl text-white" />
        <screen.Description className="text-sm text-gray-300 [&>a]:underline [&>a]:underline-offset-4 [&>a]:text-blue-400 [&>a]:hover:text-blue-300" />
      </div>

      <div className="grid grid-cols-3 items-center">
        <Button
          size="sm"
          variant="default"
          onClick={screen.back}
          className="justify-self-start text-gray-300 hover:text-white"
        >
          Back
        </Button>
        <div className="flex items-center gap-2 place-self-center">
          {screen.screenIndicators.map((ScreenIndicator, i) => (
            <ScreenIndicator key={i} className="py-4">
              <div className="h-0.5 w-6 transition-colors bg-gray-600 [[data-active]>&]:bg-white" />
            </ScreenIndicator>
          ))}
        </div>
        <Button
          size="sm"
          variant="default"
          onClick={screen.next}
          className="gap-2 justify-self-end text-gray-300 hover:text-white"
        >
          {screen.screenIndex === screen.totalScreens - 1 ? "Finish" : "Next"}
          <ArrowRight size={16} />
        </Button>
      </div>
    </>
  );
}
