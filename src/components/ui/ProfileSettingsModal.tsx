import { useState } from "react";
import { toast } from "sonner";
import { Loader2, X, UserCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";

export function ProfileSettingsModal({
  profile,
  onClose,
}: {
  profile: any;
  onClose: () => void;
}) {
  const [fullName, setFullName] = useState(profile?.full_name || "");
  const [phone, setPhone] = useState(profile?.phone || "");
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!profile?.id) return;
    setLoading(true);

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        phone: phone,
      })
      .eq("id", profile.id);

    setLoading(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Profile updated successfully");
      onClose();
      // Dăm un mic reload ca să se actualizeze numele în tot sistemul (inclusiv in Auth Store)
      setTimeout(() => {
        window.location.reload();
      }, 800);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] flex flex-col">
        {/* Header */}
        <div className="border-b-2 border-foreground px-6 py-5 flex items-start justify-between gap-4">
          <div>
            <p
              className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/40"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              Account
            </p>
            <h2
              className="mt-0.5 text-xl font-black uppercase tracking-tight flex items-center gap-2"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              <UserCircle className="h-5 w-5" /> Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="border-2 border-foreground p-1.5 hover:bg-foreground hover:text-background transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">
              Email Address (Read Only)
            </label>
            <input
              type="text"
              value={profile?.email || ""}
              disabled
              className="border-b-4 border-foreground/20 bg-foreground/5 text-foreground/50 py-3 text-lg outline-none w-full cursor-not-allowed"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. John Doe"
              className="border-b-4 border-foreground bg-transparent py-3 text-lg font-bold outline-none focus:bg-foreground/5 w-full"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">
              Phone Number
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. +40 700 000 000"
              className="border-b-4 border-foreground bg-transparent py-3 text-lg font-bold outline-none focus:bg-foreground/5 w-full"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="border-t-2 border-foreground px-6 py-4 flex gap-3">
          <button
            onClick={handleSave}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 bg-foreground text-background py-4 text-sm font-black uppercase tracking-widest hover:bg-primary hover:text-foreground transition-all disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}