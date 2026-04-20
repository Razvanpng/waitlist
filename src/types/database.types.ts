export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      bookings: {
        Row: {
          client_id: string
          created_at: string
          id: string
          slot_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          slot_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          slot_id?: string
        }
        Relationships: []
      }
      businesses: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      slots: {
        Row: {
          booked_count: number
          business_id: string
          capacity: number
          created_at: string
          description: string | null
          ends_at: string
          id: string
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          booked_count?: number
          business_id: string
          capacity?: number
          created_at?: string
          description?: string | null
          ends_at: string
          id?: string
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          booked_count?: number
          business_id?: string
          capacity?: number
          created_at?: string
          description?: string | null
          ends_at?: string
          id?: string
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      waitlist_entries: {
        Row: {
          client_id: string
          created_at: string
          id: string
          position: number
          slot_id: string
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          position: number
          slot_id: string
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          position?: number
          slot_id?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_slot: {
        Args: {
          p_slot_id: string
          p_client_id: string
        }
        Returns: {
          success: boolean
          error: string
        }[]
      }
      join_waitlist: {
        Args: {
          p_slot_id: string
          p_client_id: string
        }
        Returns: {
          success: boolean
          error: string
        }[]
      }
      cancel_booking: {
        Args: {
          p_slot_id: string
          p_client_id: string
        }
        Returns: {
          success: boolean
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}