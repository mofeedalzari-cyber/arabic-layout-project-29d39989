export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      card_requests: {
        Row: {
          agent_id: string
          agent_username: string
          approved_quantity: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          network_id: string
          network_name: string
          notes: string | null
          package_id: string
          package_name: string
          paid_amount: number
          payment_method: string
          quantity: number
          reject_reason: string | null
          status: string
          total_value: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          agent_username: string
          approved_quantity?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          network_id: string
          network_name: string
          notes?: string | null
          package_id: string
          package_name: string
          paid_amount?: number
          payment_method?: string
          quantity: number
          reject_reason?: string | null
          status?: string
          total_value?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          agent_username?: string
          approved_quantity?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          network_id?: string
          network_name?: string
          notes?: string | null
          package_id?: string
          package_name?: string
          paid_amount?: number
          payment_method?: string
          quantity?: number
          reject_reason?: string | null
          status?: string
          total_value?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_requests_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_requests_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          created_at: string
          id: string
          network_id: string
          package_id: string
          password: string | null
          sold_at: string | null
          sold_to: string | null
          status: Database["public"]["Enums"]["card_status"]
          username: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          id?: string
          network_id: string
          package_id: string
          password?: string | null
          sold_at?: string | null
          sold_to?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          username: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          created_at?: string
          id?: string
          network_id?: string
          package_id?: string
          password?: string | null
          sold_at?: string | null
          sold_to?: string | null
          status?: Database["public"]["Enums"]["card_status"]
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cards_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          agent_full_name: string | null
          agent_id: string
          agent_phone: string | null
          agent_username: string
          decided_at: string | null
          decided_by: string | null
          id: string
          network_id: string
          reject_reason: string | null
          requested_at: string
          status: string
        }
        Insert: {
          agent_full_name?: string | null
          agent_id: string
          agent_phone?: string | null
          agent_username: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          network_id: string
          reject_reason?: string | null
          requested_at?: string
          status?: string
        }
        Update: {
          agent_full_name?: string | null
          agent_id?: string
          agent_phone?: string | null
          agent_username?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          network_id?: string
          reject_reason?: string | null
          requested_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      logs: {
        Row: {
          action: string
          actor_username: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_username?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_username?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      networks: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          owner_id: string | null
          primary_color: string
          secondary_color: string
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          owner_id?: string | null
          primary_color?: string
          secondary_color?: string
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          primary_color?: string
          secondary_color?: string
          updated_at?: string
        }
        Relationships: []
      }
      packages: {
        Row: {
          allowed_time: string | null
          color: string | null
          created_at: string
          data_size: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          network_id: string
          price: number
          sort_order: number
          speed: string | null
          updated_at: string
          validity: string | null
        }
        Insert: {
          allowed_time?: string | null
          color?: string | null
          created_at?: string
          data_size?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          network_id: string
          price: number
          sort_order?: number
          speed?: string | null
          updated_at?: string
          validity?: string | null
        }
        Update: {
          allowed_time?: string | null
          color?: string | null
          created_at?: string
          data_size?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          network_id?: string
          price?: number
          sort_order?: number
          speed?: string | null
          updated_at?: string
          validity?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "packages_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          network_id: string | null
          phone: string | null
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          network_id?: string | null
          phone?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          network_id?: string | null
          phone?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
      }
      request_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          note: string | null
          recorded_by: string
          recorded_by_username: string | null
          request_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          note?: string | null
          recorded_by: string
          recorded_by_username?: string | null
          request_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          note?: string | null
          recorded_by?: string
          recorded_by_username?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_payments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "card_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          agent_id: string
          agent_username: string
          card_id: string
          id: string
          network_id: string
          network_name: string
          package_id: string
          package_name: string
          price: number
          sold_at: string
          transaction_no: string
        }
        Insert: {
          agent_id: string
          agent_username: string
          card_id: string
          id?: string
          network_id: string
          network_name: string
          package_id: string
          package_name: string
          price: number
          sold_at?: string
          transaction_no?: string
        }
        Update: {
          agent_id?: string
          agent_username?: string
          card_id?: string
          id?: string
          network_id?: string
          network_name?: string
          package_id?: string
          package_name?: string
          price?: number
          sold_at?: string
          transaction_no?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_cards:
        | {
            Args: { _ids: string[] }
            Returns: {
              deleted: number
              skipped_sold: number
            }[]
          }
        | {
            Args: { _force?: boolean; _ids: string[] }
            Returns: {
              deleted: number
              skipped_sold: number
            }[]
          }
      admin_delete_network: {
        Args: { _network_id: string }
        Returns: undefined
      }
      admin_delete_package: {
        Args: { _package_id: string }
        Returns: undefined
      }
      admin_list_cards: {
        Args: {
          _agent_id?: string
          _limit?: number
          _network_id: string
          _package_id?: string
          _search?: string
        }
        Returns: {
          assigned_at: string
          assigned_to: string
          assigned_username: string
          created_at: string
          id: string
          package_id: string
          package_name: string
          password: string
          sold_at: string
          sold_to: string
          sold_username: string
          status: string
          username: string
        }[]
      }
      admin_network: { Args: { _uid: string }; Returns: string }
      admin_stats: { Args: never; Returns: Json }
      admin_wipe_database: { Args: never; Returns: Json }
      agent_cabin: {
        Args: never
        Returns: {
          available: number
          color: string
          currency: string
          data_size: string
          network_id: string
          network_name: string
          package_id: string
          package_name: string
          price: number
          sold_count: number
          speed: string
          validity: string
        }[]
      }
      approve_card_request: {
        Args: { _request_id: string }
        Returns: {
          approved: number
          remaining: number
        }[]
      }
      approve_join_request: {
        Args: { _request_id: string }
        Returns: undefined
      }
      bulk_upload_cards: {
        Args: { _entries: Json; _package_id: string }
        Returns: {
          duplicates: number
          errors: number
          inserted: number
        }[]
      }
      create_my_network: { Args: { _name: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      list_active_networks: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      package_counts: {
        Args: { _network_id: string }
        Returns: {
          assigned: number
          available: number
          my_assigned: number
          package_id: string
          sold: number
        }[]
      }
      record_request_payment: {
        Args: { _amount: number; _note?: string; _request_id: string }
        Returns: {
          paid_amount: number
          remaining: number
        }[]
      }
      reject_card_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: undefined
      }
      reject_join_request: {
        Args: { _reason?: string; _request_id: string }
        Returns: undefined
      }
      request_cards: {
        Args: {
          _notes?: string
          _package_id: string
          _payment_method?: string
          _quantity: number
        }
        Returns: string
      }
      sell_card: {
        Args: { _package_id: string }
        Returns: {
          card_password: string
          card_username: string
          network_name: string
          package_name: string
          price: number
          sale_id: string
          sold_at: string
          transaction_no: string
        }[]
      }
      set_agent_active: {
        Args: { _active: boolean; _agent_id: string }
        Returns: undefined
      }
      set_agent_network: {
        Args: { _agent_id: string; _network_id: string }
        Returns: undefined
      }
      username_from_phone: { Args: { _phone: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "agent"
      card_status: "AVAILABLE" | "ASSIGNED" | "SOLD"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "agent"],
      card_status: ["AVAILABLE", "ASSIGNED", "SOLD"],
    },
  },
} as const
