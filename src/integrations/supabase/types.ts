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
      customer_payments: {
        Row: {
          agent_id: string
          amount: number
          created_at: string
          customer_id: string
          id: string
          network_id: string | null
          note: string | null
        }
        Insert: {
          agent_id: string
          amount: number
          created_at?: string
          customer_id: string
          id?: string
          network_id?: string | null
          note?: string | null
        }
        Update: {
          agent_id?: string
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          network_id?: string | null
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          name: string
          network_id: string | null
          updated_at: string
          whatsapp: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          name: string
          network_id?: string | null
          updated_at?: string
          whatsapp: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          name?: string
          network_id?: string | null
          updated_at?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
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
      login_attempts: {
        Row: {
          attempts: number
          first_attempt_at: string
          last_attempt_at: string
          locked_until: string | null
          phone_key: string
        }
        Insert: {
          attempts?: number
          first_attempt_at?: string
          last_attempt_at?: string
          locked_until?: string | null
          phone_key: string
        }
        Update: {
          attempts?: number
          first_attempt_at?: string
          last_attempt_at?: string
          locked_until?: string | null
          phone_key?: string
        }
        Relationships: []
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
      mikrotiks: {
        Row: {
          created_at: string
          created_by: string | null
          host: string
          id: string
          name: string
          network_id: string
          notes: string | null
          password: string
          port: number
          updated_at: string
          use_https: boolean
          username: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          host: string
          id?: string
          name: string
          network_id: string
          notes?: string | null
          password?: string
          port?: number
          updated_at?: string
          use_https?: boolean
          username: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          host?: string
          id?: string
          name?: string
          network_id?: string
          notes?: string | null
          password?: string
          port?: number
          updated_at?: string
          use_https?: boolean
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "mikrotiks_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
        ]
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
      password_reset_requests: {
        Row: {
          created_at: string
          id: string
          note: string | null
          phone: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          phone: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          phone?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: []
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
          agent_id: string | null
          agent_username: string
          buyer_name: string | null
          card_id: string | null
          card_number: string | null
          customer_id: string | null
          id: string
          is_external: boolean
          network_id: string
          network_name: string
          package_id: string
          package_name: string
          price: number
          sold_at: string
          transaction_no: string
        }
        Insert: {
          agent_id?: string | null
          agent_username: string
          buyer_name?: string | null
          card_id?: string | null
          card_number?: string | null
          customer_id?: string | null
          id?: string
          is_external?: boolean
          network_id: string
          network_name: string
          package_id: string
          package_name: string
          price: number
          sold_at?: string
          transaction_no?: string
        }
        Update: {
          agent_id?: string | null
          agent_username?: string
          buyer_name?: string | null
          card_id?: string | null
          card_number?: string | null
          customer_id?: string | null
          id?: string
          is_external?: boolean
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
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
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
      user_orders: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          bank_account: string | null
          bank_ref: string | null
          card_id: string | null
          card_password: string | null
          card_username: string | null
          created_at: string
          customer_name: string | null
          id: string
          network_id: string
          network_name: string
          note: string | null
          package_id: string
          package_name: string
          paid_at: string | null
          price: number
          receipt_path: string | null
          reject_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_ref?: string | null
          card_id?: string | null
          card_password?: string | null
          card_username?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          network_id: string
          network_name: string
          note?: string | null
          package_id: string
          package_name: string
          paid_at?: string | null
          price: number
          receipt_path?: string | null
          reject_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          bank_account?: string | null
          bank_ref?: string | null
          card_id?: string | null
          card_password?: string | null
          card_username?: string | null
          created_at?: string
          customer_name?: string | null
          id?: string
          network_id?: string
          network_name?: string
          note?: string | null
          package_id?: string
          package_name?: string
          paid_at?: string | null
          price?: number
          receipt_path?: string | null
          reject_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_orders_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_orders_network_id_fkey"
            columns: ["network_id"]
            isOneToOne: false
            referencedRelation: "networks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_orders_package_id_fkey"
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
      admin_delete_agent: { Args: { _agent_id: string }; Returns: Json }
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
      admin_delete_request_payment: {
        Args: { _payment_id: string }
        Returns: {
          paid_amount: number
          remaining: number
        }[]
      }
      admin_delete_user_orders: { Args: { _ids: string[] }; Returns: number }
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
      admin_reset_balance: {
        Args: never
        Returns: {
          cleared: number
          payments_deleted: number
          requests_updated: number
        }[]
      }
      admin_stats: { Args: never; Returns: Json }
      admin_transfer_sold_cards: {
        Args: { _ids: string[]; _to_agent: string }
        Returns: {
          amount: number
          moved: number
        }[]
      }
      admin_unassign_cards: { Args: { _ids: string[] }; Returns: number }
      admin_update_request_payment: {
        Args: { _amount: number; _note: string; _payment_id: string }
        Returns: {
          paid_amount: number
          remaining: number
        }[]
      }
      admin_user_orders: {
        Args: { _status?: string }
        Returns: {
          approved_at: string
          available: number
          created_at: string
          customer_name: string
          id: string
          network_id: string
          network_name: string
          note: string
          package_id: string
          package_name: string
          phone: string
          price: number
          receipt_path: string
          reject_reason: string
          status: string
          user_id: string
          username: string
        }[]
      }
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
      approve_user_order: {
        Args: { _order_id: string }
        Returns: {
          card_password: string
          card_username: string
        }[]
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
      dashboard_breakdown: { Args: never; Returns: Json }
      delete_customer: {
        Args: { _customer_id: string; _delete_cards?: boolean }
        Returns: undefined
      }
      delete_my_orders: { Args: { _ids: string[] }; Returns: number }
      delete_sale:
        | { Args: { _sale_id: string }; Returns: undefined }
        | {
            Args: { _delete_card?: boolean; _sale_id: string }
            Returns: undefined
          }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      is_superadmin: { Args: { _uid: string }; Returns: boolean }
      list_active_networks: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      login_guard_check: { Args: { _phone: string }; Returns: number }
      login_guard_record: {
        Args: { _ok: boolean; _phone: string }
        Returns: number
      }
      my_orders: {
        Args: never
        Returns: {
          approved_at: string
          card_password: string
          card_username: string
          created_at: string
          customer_name: string
          id: string
          network_name: string
          package_name: string
          price: number
          receipt_path: string
          reject_reason: string
          status: string
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
      reconcile_agent_debts: {
        Args: { _network_id?: string }
        Returns: {
          created: number
          total_value: number
        }[]
      }
      record_external_sale: {
        Args: {
          _buyer_name: string
          _card_number: string
          _customer_id: string
          _package_id: string
          _quantity: number
          _unit_price: number
        }
        Returns: number
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
      reject_user_order: {
        Args: { _order_id: string; _reason?: string }
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
      settle_agent_debt: {
        Args: { _agent_id: string; _amount: number; _note?: string }
        Returns: {
          applied: number
          payments_count: number
          remaining_debt: number
        }[]
      }
      submit_password_reset_request: {
        Args: { _note?: string; _phone: string }
        Returns: undefined
      }
      superadmin_agents: {
        Args: never
        Returns: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean
          network_id: string
          network_name: string
          phone: string
          role: string
          sold_count: number
          sold_value: number
          username: string
        }[]
      }
      superadmin_cards: {
        Args: {
          _limit?: number
          _network_id?: string
          _package_id?: string
          _search?: string
          _status?: string
        }
        Returns: {
          assigned_at: string
          assigned_to: string
          assigned_username: string
          created_at: string
          id: string
          network_id: string
          network_name: string
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
      superadmin_create_network: {
        Args: { _currency?: string; _name: string }
        Returns: string
      }
      superadmin_create_package: {
        Args: {
          _allowed_time?: string
          _color?: string
          _data_size?: string
          _name: string
          _network_id: string
          _price: number
          _speed?: string
          _validity?: string
        }
        Returns: string
      }
      superadmin_delete_agent: { Args: { _agent_id: string }; Returns: Json }
      superadmin_delete_network: {
        Args: { _network_id: string }
        Returns: Json
      }
      superadmin_delete_reset_requests: {
        Args: { _ids: string[] }
        Returns: number
      }
      superadmin_networks: {
        Args: never
        Returns: {
          agents_count: number
          assigned_count: number
          available_count: number
          cards_count: number
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
          owner_phone: string
          owner_username: string
          packages_count: number
          paid_value: number
          remaining_value: number
          requests_value: number
          sold_count: number
          sold_value: number
        }[]
      }
      superadmin_packages: {
        Args: never
        Returns: {
          assigned: number
          available: number
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          network_id: string
          network_name: string
          price: number
          sold: number
        }[]
      }
      superadmin_reset_password: {
        Args: { _new_password: string; _target_user_id: string }
        Returns: undefined
      }
      superadmin_reset_requests: {
        Args: never
        Returns: {
          created_at: string
          id: string
          matched_full_name: string
          matched_network_name: string
          matched_user_id: string
          matched_username: string
          note: string
          phone: string
          resolved_at: string
          status: string
        }[]
      }
      superadmin_resolve_reset_request: {
        Args: { _id: string; _status?: string }
        Returns: undefined
      }
      superadmin_set_agent_active: {
        Args: { _active: boolean; _agent_id: string }
        Returns: undefined
      }
      superadmin_set_network_active: {
        Args: { _active: boolean; _network_id: string }
        Returns: undefined
      }
      superadmin_stats: { Args: never; Returns: Json }
      superadmin_update_network: {
        Args: { _currency?: string; _name?: string; _network_id: string }
        Returns: undefined
      }
      user_create_order: { Args: { _package_id: string }; Returns: string }
      user_fulfill_order: {
        Args: {
          _bank_account: string
          _bank_ref: string
          _order_id: string
          _user_id: string
        }
        Returns: {
          card_password: string
          card_username: string
          network_name: string
          package_name: string
          price: number
        }[]
      }
      user_request_card: {
        Args: {
          _customer_name: string
          _note?: string
          _package_id: string
          _receipt_path?: string
        }
        Returns: string
      }
      user_store: {
        Args: never
        Returns: {
          admin_phone: string
          available: number
          color: string
          currency: string
          data_size: string
          network_id: string
          network_name: string
          package_id: string
          package_name: string
          price: number
          speed: string
          validity: string
        }[]
      }
      username_from_phone: { Args: { _phone: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "agent" | "superadmin" | "user"
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
      app_role: ["admin", "agent", "superadmin", "user"],
      card_status: ["AVAILABLE", "ASSIGNED", "SOLD"],
    },
  },
} as const
