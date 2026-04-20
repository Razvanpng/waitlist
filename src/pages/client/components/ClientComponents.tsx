import { ReactNode } from "react";
import { 
  Loader2, CheckCircle2, Clock4, CalendarPlus, ListPlus, XCircle, 
  UserMinus, Calendar, Users, Hourglass, Smartphone 
} from "lucide-react";
import type { Database } from "@/types/database.types";

export type Slot = Database["public"]["Tables"]["slots"]["Row"];
export type SlotAction = "booked" | "waitlisted" | "book" | "join_waitlist" | "cancelled_slot";
export type ConfirmKind = "cancel_booking" | "leave_waitlist";

export interface ConfirmState {
  slotId: string;
  title: string;
  kind: ConfirmKind;
}

// -- MODALS --

export function PhoneModal({
  phoneNumber,
  setPhoneNumber,
  onSave,
  onCancel,
  isSaving
}: {
  phoneNumber: string;
  setPhoneNumber: (val: string) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="border-b-2 border-foreground px-6 py-5">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>Contact Details</p>
          <h2 className="mt-1 text-xl font-black uppercase tracking-tight flex items-center gap-2" style={{ fontFamily: "'Syne', sans-serif" }}>
            <Smartphone className="h-5 w-5" /> Phone Required
          </h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-5">
          <p className="text-sm font-medium text-foreground/60">To reserve a spot or join the waitlist, please provide a phone number so the business can contact you.</p>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-bold uppercase tracking-[0.25em] text-foreground/50">Phone Number</label>
            <input type="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="e.g. +40 700 000 000" className="border-b-4 border-foreground bg-transparent py-3 text-xl outline-none focus:bg-foreground/5 w-full" autoFocus />
          </div>
          <div className="flex gap-3 mt-2">
            <button onClick={onSave} disabled={isSaving} className="flex-1 flex items-center justify-center gap-2 bg-foreground text-background py-4 text-sm font-black uppercase tracking-widest hover:bg-primary hover:text-foreground transition-all disabled:opacity-50">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />} Save & Continue
            </button>
            <button onClick={onCancel} className="px-4 border-2 border-foreground py-4 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActionConfirmModal({
  state,
  onConfirm,
  onCancel
}: {
  state: ConfirmState;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isCancel = state.kind === "cancel_booking";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm border-4 border-foreground bg-background shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
        <div className="border-b-2 border-foreground px-6 py-5">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-foreground/40" style={{ fontFamily: "'Syne', sans-serif" }}>Confirmation Required</p>
          <h2 className="mt-1 text-xl font-black uppercase tracking-tight" style={{ fontFamily: "'Syne', sans-serif" }}>
            {isCancel ? "Cancel Booking?" : "Leave Waitlist?"}
          </h2>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <p className="text-sm font-medium text-foreground/60">
            {isCancel 
              ? `You are about to cancel your booking for "${state.title}". Your spot will be released to the next person.`
              : `You are about to remove yourself from the waitlist for "${state.title}". You will lose your position.`}
          </p>
          <div className="flex gap-3">
            <button onClick={onConfirm} className="flex-1 bg-destructive text-destructive-foreground py-4 text-sm font-black uppercase tracking-widest hover:opacity-90 transition-opacity">
              {isCancel ? "Yes, Cancel" : "Yes, Leave"}
            </button>
            <button onClick={onCancel} className="flex-1 border-2 border-foreground py-4 text-sm font-black uppercase tracking-widest hover:bg-foreground hover:text-background transition-colors">Go Back</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// -- SLOT CARD UI --

const ACTION_BORDER: Record<SlotAction, string> = {
  booked: "border-l-4 border-l-green-500",
  waitlisted: "border-l-4 border-l-yellow-400",
  book: "border-l-4 border-l-foreground/20",
  join_waitlist: "border-l-4 border-l-orange-400",
  cancelled_slot: "border-l-4 border-l-foreground/10 opacity-40",
};

export function ClientSlotCard({
  slot, action, loading, isPast, waitlistPosition, onBook, onJoinWaitlist, onCancelBooking, onLeaveWaitlist,
}: {
  slot: Slot; action: SlotAction; loading: boolean; isPast: boolean; waitlistPosition?: number;
  onBook: () => void; onJoinWaitlist: () => void; onCancelBooking: () => void; onLeaveWaitlist: () => void;
}) {
  const starts = new Date(slot.starts_at);
  const ends = new Date(slot.ends_at);
  const fillPct = Math.min(100, Math.round((slot.booked_count / slot.capacity) * 100));
  const fmt = (d: Date) => d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`border-2 border-foreground bg-background ${isPast ? "border-l-4 border-l-foreground/20 opacity-70" : ACTION_BORDER[action]}`}>
      <div className="px-5 py-4 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-black uppercase tracking-wide leading-none truncate" style={{ fontFamily: "'Syne', sans-serif" }}>{slot.title}</span>
            <StatusPill action={action} position={waitlistPosition} isPast={isPast} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs font-medium text-foreground/50 uppercase tracking-widest">
            <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" />{fmt(starts)}</span>
            <span className="flex items-center gap-1.5"><Clock4 className="h-3 w-3" />ends {fmt(ends)}</span>
            <span className="flex items-center gap-1.5"><Users className="h-3 w-3" />{slot.booked_count}/{slot.capacity} booked</span>
          </div>
          <div className="h-1 w-full bg-foreground/10">
            <div className={`h-full transition-all ${isPast ? "bg-foreground/20" : fillPct >= 100 ? "bg-yellow-400" : "bg-green-500"}`} style={{ width: `${fillPct}%` }} />
          </div>
        </div>
        <div className="shrink-0">
          {!isPast && <ActionButton action={action} loading={loading} onBook={onBook} onJoinWaitlist={onJoinWaitlist} onCancelBooking={onCancelBooking} onLeaveWaitlist={onLeaveWaitlist} />}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ action, position, isPast }: { action: SlotAction; position?: number, isPast?: boolean }) {
  if (isPast) return <span className="flex items-center gap-1 border text-[10px] font-black uppercase tracking-widest px-2 py-0.5 border-foreground/20 text-foreground/40">ENDED</span>;
  const configs: Record<SlotAction, { label: string; icon: ReactNode; cls: string }> = {
    booked: { label: "Booked", icon: <CheckCircle2 className="h-3 w-3" />, cls: "border-green-500/40 text-green-500" },
    waitlisted: { label: position ? `Queue #${position}` : "On Waitlist", icon: <Hourglass className="h-3 w-3" />, cls: "border-yellow-400/40 text-yellow-400" },
    book: { label: "Available", icon: <CalendarPlus className="h-3 w-3" />, cls: "border-foreground/20 text-foreground/40" },
    join_waitlist: { label: "Full", icon: <ListPlus className="h-3 w-3" />, cls: "border-orange-400/40 text-orange-400" },
    cancelled_slot: { label: "Cancelled", icon: <XCircle className="h-3 w-3" />, cls: "border-foreground/20 text-foreground/30" },
  };
  const c = configs[action];
  return <span className={`flex items-center gap-1 border text-[10px] font-black uppercase tracking-widest px-2 py-0.5 ${c.cls}`}>{c.icon}{c.label}</span>;
}

function ActionButton({ action, loading, onBook, onJoinWaitlist, onCancelBooking, onLeaveWaitlist }: { action: SlotAction; loading: boolean; onBook: () => void; onJoinWaitlist: () => void; onCancelBooking: () => void; onLeaveWaitlist: () => void; }) {
  if (action === "cancelled_slot") return null;
  const base = "flex items-center gap-2 border-2 border-foreground px-4 py-2.5 text-xs font-black uppercase tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap";
  if (loading) return <button disabled className={base}><Loader2 className="h-3.5 w-3.5 animate-spin" />Working…</button>;
  if (action === "booked") return <button onClick={onCancelBooking} className={`${base} hover:bg-destructive hover:border-destructive hover:text-destructive-foreground`}><XCircle className="h-3.5 w-3.5" />Cancel Booking</button>;
  if (action === "waitlisted") return <button onClick={onLeaveWaitlist} className={`${base} hover:bg-yellow-400/10 hover:border-yellow-400 hover:text-yellow-400`}><UserMinus className="h-3.5 w-3.5" />Leave Waitlist</button>;
  if (action === "book") return <button onClick={onBook} className={`${base} bg-foreground text-background hover:bg-primary hover:text-foreground`}><CalendarPlus className="h-3.5 w-3.5" />Book Slot</button>;
  return <button onClick={onJoinWaitlist} className={`${base} hover:bg-foreground hover:text-background`}><ListPlus className="h-3.5 w-3.5" />Join Waitlist</button>;
}