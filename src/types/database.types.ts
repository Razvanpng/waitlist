export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; role: "admin" | "client"; full_name: string | null; email: string; avatar_url: string | null; created_at: string; updated_at: string; };
        Insert: Omit<Database["public"]["Tables"]["profiles"]["Row"], "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
      };
      businesses: {
        Row: { id: string; owner_id: string; name: string; description: string | null; timezone: string; created_at: string; updated_at: string; };
        Insert: Omit<Database["public"]["Tables"]["businesses"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["businesses"]["Insert"]>;
      };
      slots: {
        Row: { id: string; business_id: string; title: string; description: string | null; starts_at: string; ends_at: string; capacity: number; booked_count: number; status: "available" | "booked" | "cancelled"; created_at: string; updated_at: string; };
        Insert: Omit<Database["public"]["Tables"]["slots"]["Row"], "id" | "created_at" | "updated_at">;
        Update: Partial<Database["public"]["Tables"]["slots"]["Insert"]>;
      };
      bookings: {
        Row: { id: string; slot_id: string; client_id: string; created_at: string; };
        Insert: Omit<Database["public"]["Tables"]["bookings"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["bookings"]["Insert"]>;
      };
      waitlist_entries: {
        Row: { id: string; slot_id: string; client_id: string; position: number; status: "waiting" | "confirmed" | "expired" | "withdrawn"; created_at: string; };
        Insert: Omit<Database["public"]["Tables"]["waitlist_entries"]["Row"], "id" | "created_at">;
        Update: Partial<Database["public"]["Tables"]["waitlist_entries"]["Insert"]>;
      };
    };
    Functions: {
      book_slot: {
        Args: { p_slot_id: string; p_client_id: string; };
        Returns: { success: boolean; error?: string; };
      };
      join_waitlist: {
        Args: { p_slot_id: string; p_client_id: string; };
        Returns: { success: boolean; error?: string; };
      };
    };
  };
}