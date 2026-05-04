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
      admin_support_tickets: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string
          customer_email: string | null
          customer_phone: string | null
          id: string
          issue_type: string
          linked_case_id: string | null
          linked_deposit_id: string | null
          linked_order_id: string | null
          linked_transaction_reference: string | null
          linked_user_id: string | null
          manager_review: boolean
          notes: string | null
          reference_type: string
          reference_value: string | null
          resolution_code: string | null
          resolution_message: string | null
          resolution_notes: string | null
          resolution_type: string | null
          resolved_by: string | null
          status: string
          ticket_code: string
          ticket_metadata: Json | null
          ticket_number: number
          updated_at: string
          user_notified: boolean
          verification_status: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by: string
          customer_email?: string | null
          customer_phone?: string | null
          id?: string
          issue_type: string
          linked_case_id?: string | null
          linked_deposit_id?: string | null
          linked_order_id?: string | null
          linked_transaction_reference?: string | null
          linked_user_id?: string | null
          manager_review?: boolean
          notes?: string | null
          reference_type?: string
          reference_value?: string | null
          resolution_code?: string | null
          resolution_message?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_by?: string | null
          status?: string
          ticket_code: string
          ticket_metadata?: Json | null
          ticket_number?: number
          updated_at?: string
          user_notified?: boolean
          verification_status?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string
          customer_email?: string | null
          customer_phone?: string | null
          id?: string
          issue_type?: string
          linked_case_id?: string | null
          linked_deposit_id?: string | null
          linked_order_id?: string | null
          linked_transaction_reference?: string | null
          linked_user_id?: string | null
          manager_review?: boolean
          notes?: string | null
          reference_type?: string
          reference_value?: string | null
          resolution_code?: string | null
          resolution_message?: string | null
          resolution_notes?: string | null
          resolution_type?: string | null
          resolved_by?: string | null
          status?: string
          ticket_code?: string
          ticket_metadata?: Json | null
          ticket_number?: number
          updated_at?: string
          user_notified?: boolean
          verification_status?: string
        }
        Relationships: []
      }
      admin_ticket_messages: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_internal: boolean
          message: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_internal?: boolean
          message: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_internal?: boolean
          message?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "admin_support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_activity_logs: {
        Row: {
          actor_id: string | null
          agent_id: string
          created_at: string
          event_type: string
          id: string
          ip: string | null
          meta: Json | null
          user_agent: string | null
        }
        Insert: {
          actor_id?: string | null
          agent_id: string
          created_at?: string
          event_type: string
          id?: string
          ip?: string | null
          meta?: Json | null
          user_agent?: string | null
        }
        Update: {
          actor_id?: string | null
          agent_id?: string
          created_at?: string
          event_type?: string
          id?: string
          ip?: string | null
          meta?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_activity_logs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_application_errors: {
        Row: {
          created_at: string
          error_code: string | null
          error_message: string | null
          id: string
          payload: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          payload?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      agent_applications: {
        Row: {
          admin_notes: string | null
          agreed_min_price: boolean
          agreed_no_scam: boolean
          agreed_suspension: boolean
          created_at: string
          date_of_birth: string | null
          expected_customers: string
          full_name: string
          id: string
          personal_email: string | null
          personal_phone: string
          referral_source: string | null
          region: string
          reviewed_at: string | null
          reviewed_by: string | null
          selling_method: string
          sold_before: boolean
          status: string
          store_description: string
          store_email: string
          store_logo_url: string | null
          store_name: string
          updated_at: string
          user_id: string
          whatsapp_number: string
        }
        Insert: {
          admin_notes?: string | null
          agreed_min_price?: boolean
          agreed_no_scam?: boolean
          agreed_suspension?: boolean
          created_at?: string
          date_of_birth?: string | null
          expected_customers: string
          full_name: string
          id?: string
          personal_email?: string | null
          personal_phone: string
          referral_source?: string | null
          region: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selling_method: string
          sold_before?: boolean
          status?: string
          store_description: string
          store_email: string
          store_logo_url?: string | null
          store_name: string
          updated_at?: string
          user_id: string
          whatsapp_number: string
        }
        Update: {
          admin_notes?: string | null
          agreed_min_price?: boolean
          agreed_no_scam?: boolean
          agreed_suspension?: boolean
          created_at?: string
          date_of_birth?: string | null
          expected_customers?: string
          full_name?: string
          id?: string
          personal_email?: string | null
          personal_phone?: string
          referral_source?: string | null
          region?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          selling_method?: string
          sold_before?: boolean
          status?: string
          store_description?: string
          store_email?: string
          store_logo_url?: string | null
          store_name?: string
          updated_at?: string
          user_id?: string
          whatsapp_number?: string
        }
        Relationships: []
      }
      agent_channel_dismissals: {
        Row: {
          agent_id: string
          dismissed_at: string
          id: string
        }
        Insert: {
          agent_id: string
          dismissed_at?: string
          id?: string
        }
        Update: {
          agent_id?: string
          dismissed_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_channel_dismissals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_orders: {
        Row: {
          agent_base_price_at_purchase: number | null
          agent_cost_price: number
          agent_id: string
          agent_profit_at_purchase: number | null
          agent_selling_price: number
          agent_store_price_at_purchase: number | null
          batch_id: string | null
          batched_at: string | null
          bundle_size_gb: number
          created_at: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string
          yiego_profit_at_purchase: number | null
          failure_reason: string | null
          id: string
          last_supplier_status: string | null
          last_supplier_sync_at: string | null
          network: string
          order_id: string
          order_source: string
          payment_method: string
          payment_status: string
          paystack_reference: string | null
          processing_fee: number | null
          product_id: string | null
          profit_credited: boolean
          profit_credited_at: string | null
          profit_ghs: number
          queue_state: string | null
          status: string
          supplier_cost_at_purchase: number | null
          supplier_failed_at: string | null
          supplier_message: string | null
          supplier_order_id: string | null
          supplier_raw_response: string | null
          supplier_reference: string | null
          supplier_status: string | null
          supplier_status_watch_until: string | null
          supplier_timestamp: string | null
          total_paid: number | null
          updated_at: string
        }
        Insert: {
          agent_base_price_at_purchase?: number | null
          agent_cost_price: number
          agent_id: string
          agent_profit_at_purchase?: number | null
          agent_selling_price: number
          agent_store_price_at_purchase?: number | null
          batch_id?: string | null
          batched_at?: string | null
          bundle_size_gb: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone: string
          yiego_profit_at_purchase?: number | null
          failure_reason?: string | null
          id?: string
          last_supplier_status?: string | null
          last_supplier_sync_at?: string | null
          network: string
          order_id: string
          order_source?: string
          payment_method?: string
          payment_status?: string
          paystack_reference?: string | null
          processing_fee?: number | null
          product_id?: string | null
          profit_credited?: boolean
          profit_credited_at?: string | null
          profit_ghs: number
          queue_state?: string | null
          status?: string
          supplier_cost_at_purchase?: number | null
          supplier_failed_at?: string | null
          supplier_message?: string | null
          supplier_order_id?: string | null
          supplier_raw_response?: string | null
          supplier_reference?: string | null
          supplier_status?: string | null
          supplier_status_watch_until?: string | null
          supplier_timestamp?: string | null
          total_paid?: number | null
          updated_at?: string
        }
        Update: {
          agent_base_price_at_purchase?: number | null
          agent_cost_price?: number
          agent_id?: string
          agent_profit_at_purchase?: number | null
          agent_selling_price?: number
          agent_store_price_at_purchase?: number | null
          batch_id?: string | null
          batched_at?: string | null
          bundle_size_gb?: number
          created_at?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string
          yiego_profit_at_purchase?: number | null
          failure_reason?: string | null
          id?: string
          last_supplier_status?: string | null
          last_supplier_sync_at?: string | null
          network?: string
          order_id?: string
          order_source?: string
          payment_method?: string
          payment_status?: string
          paystack_reference?: string | null
          processing_fee?: number | null
          product_id?: string | null
          profit_credited?: boolean
          profit_credited_at?: string | null
          profit_ghs?: number
          queue_state?: string | null
          status?: string
          supplier_cost_at_purchase?: number | null
          supplier_failed_at?: string | null
          supplier_message?: string | null
          supplier_order_id?: string | null
          supplier_raw_response?: string | null
          supplier_reference?: string | null
          supplier_status?: string | null
          supplier_status_watch_until?: string | null
          supplier_timestamp?: string | null
          total_paid?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_orders_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_payout_profiles: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          label: string | null
          momo_name: string
          momo_number: string
          network: string | null
          paystack_recipient_code: string | null
          paystack_recipient_created_at: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string | null
          momo_name: string
          momo_number: string
          network?: string | null
          paystack_recipient_code?: string | null
          paystack_recipient_created_at?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          label?: string | null
          momo_name?: string
          momo_number?: string
          network?: string | null
          paystack_recipient_code?: string | null
          paystack_recipient_created_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_payout_profiles_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_pricing: {
        Row: {
          agent_id: string
          created_at: string
          custom_price: number | null
          id: string
          markup_percent: number | null
          network: string | null
          product_id: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          custom_price?: number | null
          id?: string
          markup_percent?: number | null
          network?: string | null
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          custom_price?: number | null
          id?: string
          markup_percent?: number | null
          network?: string | null
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_pricing_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_profit_audit_logs: {
        Row: {
          agent_id: string
          created_at: string
          id: string
          meta: Json | null
          new_status: string | null
          order_id: string
          previous_status: string | null
          profit_credited: boolean | null
          profit_ghs: number | null
          wallet_credit_amount: number | null
          wallet_credit_exists: boolean | null
        }
        Insert: {
          agent_id: string
          created_at?: string
          id?: string
          meta?: Json | null
          new_status?: string | null
          order_id: string
          previous_status?: string | null
          profit_credited?: boolean | null
          profit_ghs?: number | null
          wallet_credit_amount?: number | null
          wallet_credit_exists?: boolean | null
        }
        Update: {
          agent_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          new_status?: string | null
          order_id?: string
          previous_status?: string | null
          profit_credited?: boolean | null
          profit_ghs?: number | null
          wallet_credit_amount?: number | null
          wallet_credit_exists?: boolean | null
        }
        Relationships: []
      }
      agent_subscription_payment_intents: {
        Row: {
          agent_id: string
          amount_expected: number
          created_at: string
          id: string
          intent_type: string
          paystack_reference: string
          plan: string
          status: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          amount_expected: number
          created_at?: string
          id?: string
          intent_type?: string
          paystack_reference: string
          plan?: string
          status?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          amount_expected?: number
          created_at?: string
          id?: string
          intent_type?: string
          paystack_reference?: string
          plan?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_subscription_payment_intents_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_subscriptions: {
        Row: {
          agent_id: string
          created_at: string
          currency: string
          expiry_date: string
          id: string
          next_billing_date: string
          paid_at: string
          paystack_reference: string | null
          plan_price_current: number
          plan_price_standard: number
          status: string
        }
        Insert: {
          agent_id: string
          created_at?: string
          currency?: string
          expiry_date?: string
          id?: string
          next_billing_date?: string
          paid_at?: string
          paystack_reference?: string | null
          plan_price_current?: number
          plan_price_standard?: number
          status?: string
        }
        Update: {
          agent_id?: string
          created_at?: string
          currency?: string
          expiry_date?: string
          id?: string
          next_billing_date?: string
          paid_at?: string
          paystack_reference?: string | null
          plan_price_current?: number
          plan_price_standard?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_subscriptions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_wallet_transactions: {
        Row: {
          agent_id: string
          amount_ghs: number
          created_at: string
          description: string | null
          id: string
          order_id: string | null
          reference: string | null
          status: string
          type: string
        }
        Insert: {
          agent_id: string
          amount_ghs: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          reference?: string | null
          status?: string
          type: string
        }
        Update: {
          agent_id?: string
          amount_ghs?: number
          created_at?: string
          description?: string | null
          id?: string
          order_id?: string | null
          reference?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_wallet_transactions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_wallets: {
        Row: {
          agent_id: string
          available_balance: number
          id: string
          pending_balance: number
          total_earned: number
          total_withdrawn: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          available_balance?: number
          id?: string
          pending_balance?: number
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          available_balance?: number
          id?: string
          pending_balance?: number
          total_earned?: number
          total_withdrawn?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_wallets_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_withdrawals: {
        Row: {
          admin_notes: string | null
          agent_id: string
          amount_ghs: number
          automation_attempted: boolean
          automation_attempted_at: string | null
          automation_error: string | null
          created_at: string
          created_from_flow: string | null
          id: string
          internal_note: string | null
          momo_network: string
          momo_number: string
          payout_completed_at: string | null
          payout_failure_reason: string | null
          payout_initiated_at: string | null
          payout_mode: string | null
          payout_momo_name: string | null
          payout_network: string | null
          payout_profile_id: string | null
          paystack_raw_response: Json | null
          paystack_recipient_code: string | null
          paystack_transfer_code: string | null
          paystack_transfer_id: number | null
          paystack_transfer_reference: string | null
          paystack_transfer_status: string | null
          processed_at: string | null
          processed_by: string | null
          review_flag: string | null
          status: string
          total_deducted_ghs: number | null
          withdrawal_fee_ghs: number
        }
        Insert: {
          admin_notes?: string | null
          agent_id: string
          amount_ghs: number
          automation_attempted?: boolean
          automation_attempted_at?: string | null
          automation_error?: string | null
          created_at?: string
          created_from_flow?: string | null
          id?: string
          internal_note?: string | null
          momo_network: string
          momo_number: string
          payout_completed_at?: string | null
          payout_failure_reason?: string | null
          payout_initiated_at?: string | null
          payout_mode?: string | null
          payout_momo_name?: string | null
          payout_network?: string | null
          payout_profile_id?: string | null
          paystack_raw_response?: Json | null
          paystack_recipient_code?: string | null
          paystack_transfer_code?: string | null
          paystack_transfer_id?: number | null
          paystack_transfer_reference?: string | null
          paystack_transfer_status?: string | null
          processed_at?: string | null
          processed_by?: string | null
          review_flag?: string | null
          status?: string
          total_deducted_ghs?: number | null
          withdrawal_fee_ghs?: number
        }
        Update: {
          admin_notes?: string | null
          agent_id?: string
          amount_ghs?: number
          automation_attempted?: boolean
          automation_attempted_at?: string | null
          automation_error?: string | null
          created_at?: string
          created_from_flow?: string | null
          id?: string
          internal_note?: string | null
          momo_network?: string
          momo_number?: string
          payout_completed_at?: string | null
          payout_failure_reason?: string | null
          payout_initiated_at?: string | null
          payout_mode?: string | null
          payout_momo_name?: string | null
          payout_network?: string | null
          payout_profile_id?: string | null
          paystack_raw_response?: Json | null
          paystack_recipient_code?: string | null
          paystack_transfer_code?: string | null
          paystack_transfer_id?: number | null
          paystack_transfer_reference?: string | null
          paystack_transfer_status?: string | null
          processed_at?: string | null
          processed_by?: string | null
          review_flag?: string | null
          status?: string
          total_deducted_ghs?: number | null
          withdrawal_fee_ghs?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_withdrawals_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_withdrawals_payout_profile_id_fkey"
            columns: ["payout_profile_id"]
            isOneToOne: false
            referencedRelation: "agent_payout_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          activation_discount_expires_at: string | null
          activation_paid: boolean
          activation_paid_at: string | null
          activation_promo_reset_applied: boolean
          activation_reference: string | null
          agent_approved_at: string | null
          application_id: string | null
          created_at: string
          discount_extended_until: string | null
          discount_extension_used: boolean
          id: string
          region: string
          status: string
          store_description: string
          store_email: string
          store_logo_url: string | null
          store_name: string
          store_slug: string
          subscription_plan: string | null
          updated_at: string
          user_id: string
          whatsapp_number: string
        }
        Insert: {
          activation_discount_expires_at?: string | null
          activation_paid?: boolean
          activation_paid_at?: string | null
          activation_promo_reset_applied?: boolean
          activation_reference?: string | null
          agent_approved_at?: string | null
          application_id?: string | null
          created_at?: string
          discount_extended_until?: string | null
          discount_extension_used?: boolean
          id?: string
          region: string
          status?: string
          store_description?: string
          store_email: string
          store_logo_url?: string | null
          store_name: string
          store_slug: string
          subscription_plan?: string | null
          updated_at?: string
          user_id: string
          whatsapp_number: string
        }
        Update: {
          activation_discount_expires_at?: string | null
          activation_paid?: boolean
          activation_paid_at?: string | null
          activation_promo_reset_applied?: boolean
          activation_reference?: string | null
          agent_approved_at?: string | null
          application_id?: string | null
          created_at?: string
          discount_extended_until?: string | null
          discount_extension_used?: boolean
          id?: string
          region?: string
          status?: string
          store_description?: string
          store_email?: string
          store_logo_url?: string | null
          store_name?: string
          store_slug?: string
          subscription_plan?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "agent_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversation_messages: {
        Row: {
          admin_name: string | null
          content: string
          conversation_id: string
          created_at: string
          event_type: string | null
          id: string
          image_url: string | null
          role: string
        }
        Insert: {
          admin_name?: string | null
          content: string
          conversation_id: string
          created_at?: string
          event_type?: string | null
          id?: string
          image_url?: string | null
          role: string
        }
        Update: {
          admin_name?: string | null
          content?: string
          conversation_id?: string
          created_at?: string
          event_type?: string | null
          id?: string
          image_url?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversation_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          admin_handler_id: string | null
          admin_handler_name: string | null
          admin_joined_at: string | null
          admin_left_at: string | null
          admin_notes: string | null
          ai_message_count: number
          created_at: string
          ended_at: string | null
          escalation_attempted: boolean
          escalation_blocked: boolean
          flags: string[] | null
          guest_name: string | null
          handled_by: string
          has_evidence: boolean
          id: string
          ip_address: string | null
          last_ai_message_preview: string | null
          last_user_message_preview: string | null
          manager_review: boolean
          outcome: string | null
          quality_rating: string | null
          session_id: string
          source_page: string | null
          status: string
          ticket_code: string | null
          ticket_id: string | null
          updated_at: string
          user_email: string | null
          user_id: string | null
          user_message_count: number
          user_type: string
          username: string | null
        }
        Insert: {
          admin_handler_id?: string | null
          admin_handler_name?: string | null
          admin_joined_at?: string | null
          admin_left_at?: string | null
          admin_notes?: string | null
          ai_message_count?: number
          created_at?: string
          ended_at?: string | null
          escalation_attempted?: boolean
          escalation_blocked?: boolean
          flags?: string[] | null
          guest_name?: string | null
          handled_by?: string
          has_evidence?: boolean
          id?: string
          ip_address?: string | null
          last_ai_message_preview?: string | null
          last_user_message_preview?: string | null
          manager_review?: boolean
          outcome?: string | null
          quality_rating?: string | null
          session_id: string
          source_page?: string | null
          status?: string
          ticket_code?: string | null
          ticket_id?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_message_count?: number
          user_type?: string
          username?: string | null
        }
        Update: {
          admin_handler_id?: string | null
          admin_handler_name?: string | null
          admin_joined_at?: string | null
          admin_left_at?: string | null
          admin_notes?: string | null
          ai_message_count?: number
          created_at?: string
          ended_at?: string | null
          escalation_attempted?: boolean
          escalation_blocked?: boolean
          flags?: string[] | null
          guest_name?: string | null
          handled_by?: string
          has_evidence?: boolean
          id?: string
          ip_address?: string | null
          last_ai_message_preview?: string | null
          last_user_message_preview?: string | null
          manager_review?: boolean
          outcome?: string | null
          quality_rating?: string | null
          session_id?: string
          source_page?: string | null
          status?: string
          ticket_code?: string | null
          ticket_id?: string | null
          updated_at?: string
          user_email?: string | null
          user_id?: string | null
          user_message_count?: number
          user_type?: string
          username?: string | null
        }
        Relationships: []
      }
      ai_support_usage: {
        Row: {
          created_at: string
          id: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      analytics_daily_metrics: {
        Row: {
          date: string
          orders_by_network: Json
          orders_by_source: Json
          page_views: number
          total_delivered: number
          total_failed: number
          total_orders: number
          total_revenue: number
          unique_visitors: number
          updated_at: string
        }
        Insert: {
          date: string
          orders_by_network?: Json
          orders_by_source?: Json
          page_views?: number
          total_delivered?: number
          total_failed?: number
          total_orders?: number
          total_revenue?: number
          unique_visitors?: number
          updated_at?: string
        }
        Update: {
          date?: string
          orders_by_network?: Json
          orders_by_source?: Json
          page_views?: number
          total_delivered?: number
          total_failed?: number
          total_orders?: number
          total_revenue?: number
          unique_visitors?: number
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string
          changes: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string
          changes?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      backfill_runs: {
        Row: {
          completed_at: string | null
          id: string
          run_key: string
          started_at: string
          status: string
          summary: Json | null
        }
        Insert: {
          completed_at?: string | null
          id?: string
          run_key: string
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Update: {
          completed_at?: string | null
          id?: string
          run_key?: string
          started_at?: string
          status?: string
          summary?: Json | null
        }
        Relationships: []
      }
      blog_posts: {
        Row: {
          author_id: string | null
          category: string | null
          content: string
          cover_image_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          meta_description: string | null
          published: boolean
          published_at: string | null
          seo_title: string | null
          slug: string
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string | null
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          meta_description?: string | null
          published?: boolean
          published_at?: string | null
          seo_title?: string | null
          slug: string
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string | null
          content?: string
          cover_image_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          meta_description?: string | null
          published?: boolean
          published_at?: string | null
          seo_title?: string | null
          slug?: string
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      bulk_dispatch_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          new_value: Json | null
          previous_value: Json | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          previous_value?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          new_value?: Json | null
          previous_value?: Json | null
        }
        Relationships: []
      }
      campaign_banner_events: {
        Row: {
          anonymous_id: string | null
          banner_id: string
          created_at: string
          device_type: string | null
          event_type: string
          id: string
          page: string | null
          user_id: string | null
        }
        Insert: {
          anonymous_id?: string | null
          banner_id: string
          created_at?: string
          device_type?: string | null
          event_type: string
          id?: string
          page?: string | null
          user_id?: string | null
        }
        Update: {
          anonymous_id?: string | null
          banner_id?: string
          created_at?: string
          device_type?: string | null
          event_type?: string
          id?: string
          page?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_banner_events_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "campaign_banners"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_banners: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          audience_type: string
          badge_text: string | null
          conversion_goal: string | null
          created_at: string
          created_by: string | null
          dismiss_behavior: string
          display_mode: string
          end_at: string | null
          frequency_type: string
          icon_type: string | null
          id: string
          image_url: string | null
          is_enabled: boolean
          max_views_per_user: number | null
          message: string
          primary_button_text: string | null
          primary_button_url: string | null
          priority: number
          reset_frequency_at: string | null
          secondary_button_text: string | null
          secondary_button_url: string | null
          show_delay_seconds: number
          start_at: string | null
          status: string
          target_pages: Json
          targeting_rules: Json
          template_type: string
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          audience_type?: string
          badge_text?: string | null
          conversion_goal?: string | null
          created_at?: string
          created_by?: string | null
          dismiss_behavior?: string
          display_mode?: string
          end_at?: string | null
          frequency_type?: string
          icon_type?: string | null
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          max_views_per_user?: number | null
          message?: string
          primary_button_text?: string | null
          primary_button_url?: string | null
          priority?: number
          reset_frequency_at?: string | null
          secondary_button_text?: string | null
          secondary_button_url?: string | null
          show_delay_seconds?: number
          start_at?: string | null
          status?: string
          target_pages?: Json
          targeting_rules?: Json
          template_type?: string
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          audience_type?: string
          badge_text?: string | null
          conversion_goal?: string | null
          created_at?: string
          created_by?: string | null
          dismiss_behavior?: string
          display_mode?: string
          end_at?: string | null
          frequency_type?: string
          icon_type?: string | null
          id?: string
          image_url?: string | null
          is_enabled?: boolean
          max_views_per_user?: number | null
          message?: string
          primary_button_text?: string | null
          primary_button_url?: string | null
          priority?: number
          reset_frequency_at?: string | null
          secondary_button_text?: string | null
          secondary_button_url?: string | null
          show_delay_seconds?: number
          start_at?: string | null
          status?: string
          target_pages?: Json
          targeting_rules?: Json
          template_type?: string
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      checkpoint_settings: {
        Row: {
          active_hours_end: number
          active_hours_start: number
          daily_max: number
          enabled: boolean
          id: string
          min_gap_hours: number
          test_bundle_id: string | null
          test_bundle_name: string | null
          test_network: string
          test_phone: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active_hours_end?: number
          active_hours_start?: number
          daily_max?: number
          enabled?: boolean
          id?: string
          min_gap_hours?: number
          test_bundle_id?: string | null
          test_bundle_name?: string | null
          test_network?: string
          test_phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active_hours_end?: number
          active_hours_start?: number
          daily_max?: number
          enabled?: boolean
          id?: string
          min_gap_hours?: number
          test_bundle_id?: string | null
          test_bundle_name?: string | null
          test_network?: string
          test_phone?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      delivery_checkpoints: {
        Row: {
          bundle_id: string | null
          bundle_name: string | null
          confirmed_at: string | null
          confirmed_by_admin_id: string | null
          created_at: string
          created_by_admin_id: string
          id: string
          internal_order_id: string | null
          network: string
          notes: string | null
          orders_delivered_count: number
          status: string
          supplier_order_id: string | null
          test_phone: string
        }
        Insert: {
          bundle_id?: string | null
          bundle_name?: string | null
          confirmed_at?: string | null
          confirmed_by_admin_id?: string | null
          created_at?: string
          created_by_admin_id: string
          id?: string
          internal_order_id?: string | null
          network?: string
          notes?: string | null
          orders_delivered_count?: number
          status?: string
          supplier_order_id?: string | null
          test_phone: string
        }
        Update: {
          bundle_id?: string | null
          bundle_name?: string | null
          confirmed_at?: string | null
          confirmed_by_admin_id?: string | null
          created_at?: string
          created_by_admin_id?: string
          id?: string
          internal_order_id?: string | null
          network?: string
          notes?: string | null
          orders_delivered_count?: number
          status?: string
          supplier_order_id?: string | null
          test_phone?: string
        }
        Relationships: []
      }
      dispatch_batch_items: {
        Row: {
          batch_id: string
          bundle_size_gb: number
          created_at: string
          id: string
          network: string
          notes: string | null
          order_id: string
          order_table: string
          order_uuid: string | null
          recipient_number: string
          resolved_action: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          batch_id: string
          bundle_size_gb: number
          created_at?: string
          id?: string
          network: string
          notes?: string | null
          order_id: string
          order_table?: string
          order_uuid?: string | null
          recipient_number: string
          resolved_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          batch_id?: string
          bundle_size_gb?: number
          created_at?: string
          id?: string
          network?: string
          notes?: string | null
          order_id?: string
          order_table?: string
          order_uuid?: string | null
          recipient_number?: string
          resolved_action?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "dispatch_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatch_batches: {
        Row: {
          batch_number: string
          bundle_label: string | null
          bundle_size_gb: number | null
          completed_at: string | null
          copied_at: string | null
          created_at: string
          created_by: string | null
          id: string
          network: string
          notes: string | null
          order_count: number
          sent_at: string | null
          sent_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          batch_number: string
          bundle_label?: string | null
          bundle_size_gb?: number | null
          completed_at?: string | null
          copied_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          network: string
          notes?: string | null
          order_count?: number
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          batch_number?: string
          bundle_label?: string | null
          bundle_size_gb?: number | null
          completed_at?: string | null
          copied_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          network?: string
          notes?: string | null
          order_count?: number
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      finance_categories: {
        Row: {
          archived: boolean
          color_hex: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          archived?: boolean
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          archived?: boolean
          color_hex?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      finance_ledger_entries: {
        Row: {
          amount: number
          bucket: string
          category: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          direction: string
          entry_date: string
          expected_date: string | null
          id: string
          notes: string | null
          reference: string | null
          source: string
          source_id: string | null
          status: string
          transfer_group_id: string | null
          type: string
        }
        Insert: {
          amount: number
          bucket?: string
          category?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          direction: string
          entry_date?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          source?: string
          source_id?: string | null
          status?: string
          transfer_group_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          bucket?: string
          category?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          direction?: string
          entry_date?: string
          expected_date?: string | null
          id?: string
          notes?: string | null
          reference?: string | null
          source?: string
          source_id?: string | null
          status?: string
          transfer_group_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "finance_ledger_entries_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "finance_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      finance_monthly_snapshots: {
        Row: {
          available_balance: number
          created_at: string
          created_by: string | null
          entry_count: number
          id: string
          master_balance: number
          net_movement: number
          notes: string | null
          savings_balance: number
          snapshot_month: string
          total_in: number
          total_out: number
        }
        Insert: {
          available_balance: number
          created_at?: string
          created_by?: string | null
          entry_count: number
          id?: string
          master_balance: number
          net_movement: number
          notes?: string | null
          savings_balance: number
          snapshot_month: string
          total_in: number
          total_out: number
        }
        Update: {
          available_balance?: number
          created_at?: string
          created_by?: string | null
          entry_count?: number
          id?: string
          master_balance?: number
          net_movement?: number
          notes?: string | null
          savings_balance?: number
          snapshot_month?: string
          total_in?: number
          total_out?: number
        }
        Relationships: []
      }
      finance_settings: {
        Row: {
          id: boolean
          starting_balance: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          starting_balance?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          starting_balance?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          banned_from_program: boolean
          banned_reason: string | null
          birthday: string | null
          birthday_bonus_claimed_year: number | null
          created_at: string
          current_tier: string
          id: string
          lifetime_points_earned: number
          lifetime_points_redeemed: number
          lifetime_spend_ghs: number
          notes: string | null
          points_balance: number
          tier_achieved_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          banned_from_program?: boolean
          banned_reason?: string | null
          birthday?: string | null
          birthday_bonus_claimed_year?: number | null
          created_at?: string
          current_tier?: string
          id?: string
          lifetime_points_earned?: number
          lifetime_points_redeemed?: number
          lifetime_spend_ghs?: number
          notes?: string | null
          points_balance?: number
          tier_achieved_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          banned_from_program?: boolean
          banned_reason?: string | null
          birthday?: string | null
          birthday_bonus_claimed_year?: number | null
          created_at?: string
          current_tier?: string
          id?: string
          lifetime_points_earned?: number
          lifetime_points_redeemed?: number
          lifetime_spend_ghs?: number
          notes?: string | null
          points_balance?: number
          tier_achieved_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          id: string
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          id?: string
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: []
      }
      loyalty_promotions: {
        Row: {
          active: boolean
          applies_to: string
          bonus_points: number
          created_at: string
          created_by: string | null
          description: string | null
          ends_at: string
          id: string
          multiplier: number
          name: string
          starts_at: string
          tier_filter: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          applies_to?: string
          bonus_points?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at: string
          id?: string
          multiplier?: number
          name: string
          starts_at: string
          tier_filter?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          applies_to?: string
          bonus_points?: number
          created_at?: string
          created_by?: string | null
          description?: string | null
          ends_at?: string
          id?: string
          multiplier?: number
          name?: string
          starts_at?: string
          tier_filter?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_redemptions: {
        Row: {
          created_at: string
          ghs_value: number
          id: string
          metadata: Json
          order_id: string | null
          points_used: number
          status: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ghs_value: number
          id?: string
          metadata?: Json
          order_id?: string | null
          points_used: number
          status?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          ghs_value?: number
          id?: string
          metadata?: Json
          order_id?: string | null
          points_used?: number
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_referral_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_referrals: {
        Row: {
          code_used: string | null
          created_at: string
          device_fingerprint: string | null
          first_order_id: string | null
          flag_reason: string | null
          flagged: boolean
          id: string
          ip_address: unknown
          referee_id: string
          referee_reward_ghs: number
          referrer_id: string
          referrer_reward_points: number
          rejection_reason: string | null
          rewards_issued_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code_used?: string | null
          created_at?: string
          device_fingerprint?: string | null
          first_order_id?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          ip_address?: unknown
          referee_id: string
          referee_reward_ghs?: number
          referrer_id: string
          referrer_reward_points?: number
          rejection_reason?: string | null
          rewards_issued_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code_used?: string | null
          created_at?: string
          device_fingerprint?: string | null
          first_order_id?: string | null
          flag_reason?: string | null
          flagged?: boolean
          id?: string
          ip_address?: unknown
          referee_id?: string
          referee_reward_ghs?: number
          referrer_id?: string
          referrer_reward_points?: number
          rejection_reason?: string | null
          rewards_issued_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_settings: {
        Row: {
          birthday_bonus_points: number
          id: number
          max_redeem_percent_per_order: number
          max_referrals_per_month: number
          min_order_ghs_for_points: number
          points_expiry_months: number | null
          points_per_ghs: number
          points_to_ghs_rate: number
          program_active: boolean
          referral_bonus_referee_ghs: number
          referral_bonus_referrer_points: number
          signup_bonus_points: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          birthday_bonus_points?: number
          id: number
          max_redeem_percent_per_order?: number
          max_referrals_per_month?: number
          min_order_ghs_for_points?: number
          points_expiry_months?: number | null
          points_per_ghs?: number
          points_to_ghs_rate?: number
          program_active?: boolean
          referral_bonus_referee_ghs?: number
          referral_bonus_referrer_points?: number
          signup_bonus_points?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          birthday_bonus_points?: number
          id?: number
          max_redeem_percent_per_order?: number
          max_referrals_per_month?: number
          min_order_ghs_for_points?: number
          points_expiry_months?: number | null
          points_per_ghs?: number
          points_to_ghs_rate?: number
          program_active?: boolean
          referral_bonus_referee_ghs?: number
          referral_bonus_referrer_points?: number
          signup_bonus_points?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      loyalty_tiers_config: {
        Row: {
          active: boolean
          color_hex: string
          created_at: string
          display_name: string
          icon_name: string
          id: string
          min_lifetime_spend: number
          perks: Json
          point_multiplier: number
          sort_order: number
          tier_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          color_hex?: string
          created_at?: string
          display_name: string
          icon_name?: string
          id?: string
          min_lifetime_spend?: number
          perks?: Json
          point_multiplier?: number
          sort_order?: number
          tier_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          color_hex?: string
          created_at?: string
          display_name?: string
          icon_name?: string
          id?: string
          min_lifetime_spend?: number
          perks?: Json
          point_multiplier?: number
          sort_order?: number
          tier_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          link: string | null
          message: string
          read: boolean
          read_at: string | null
          related_entity_id: string | null
          related_entity_type: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          message: string
          read?: boolean
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          message?: string
          read?: boolean
          read_at?: string | null
          related_entity_id?: string | null
          related_entity_type?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      notify_runtime_config: {
        Row: {
          enabled: boolean
          function_base_url: string
          id: boolean
          service_role_key: string
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          function_base_url: string
          id?: boolean
          service_role_key: string
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          function_base_url?: string
          id?: boolean
          service_role_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      onesignal_players: {
        Row: {
          created_at: string
          device_type: string | null
          id: string
          is_active: boolean
          last_active_at: string
          platform: string | null
          player_id: string
          subscribed_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_type?: string | null
          id?: string
          is_active?: boolean
          last_active_at?: string
          platform?: string | null
          player_id: string
          subscribed_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_type?: string | null
          id?: string
          is_active?: boolean
          last_active_at?: string
          platform?: string | null
          player_id?: string
          subscribed_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      order_dispatch_attempts: {
        Row: {
          attempt_no: number
          attempted_at: string
          created_at: string
          created_by: string
          error_code: string | null
          error_message: string | null
          http_status: number | null
          id: string
          normalized_error_code: string | null
          order_id: string
          request_payload: Json | null
          response_text: string | null
          retry_of_attempt_id: string | null
          success: boolean
          supplier_key: string | null
        }
        Insert: {
          attempt_no?: number
          attempted_at?: string
          created_at?: string
          created_by?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          normalized_error_code?: string | null
          order_id: string
          request_payload?: Json | null
          response_text?: string | null
          retry_of_attempt_id?: string | null
          success?: boolean
          supplier_key?: string | null
        }
        Update: {
          attempt_no?: number
          attempted_at?: string
          created_at?: string
          created_by?: string
          error_code?: string | null
          error_message?: string | null
          http_status?: number | null
          id?: string
          normalized_error_code?: string | null
          order_id?: string
          request_payload?: Json | null
          response_text?: string | null
          retry_of_attempt_id?: string | null
          success?: boolean
          supplier_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_dispatch_attempts_retry_of_attempt_id_fkey"
            columns: ["retry_of_attempt_id"]
            isOneToOne: false
            referencedRelation: "order_dispatch_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      order_dispatch_locks: {
        Row: {
          locked_at: string
          locked_by: string
          order_id: string
        }
        Insert: {
          locked_at?: string
          locked_by: string
          order_id: string
        }
        Update: {
          locked_at?: string
          locked_by?: string
          order_id?: string
        }
        Relationships: []
      }
      order_retry_audit_logs: {
        Row: {
          admin_id: string
          created_at: string
          id: string
          new_attempt_id: string | null
          order_id: string
          previous_attempt_id: string | null
          reason: string | null
          result: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          id?: string
          new_attempt_id?: string | null
          order_id: string
          previous_attempt_id?: string | null
          reason?: string | null
          result: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          id?: string
          new_attempt_id?: string | null
          order_id?: string
          previous_attempt_id?: string | null
          reason?: string | null
          result?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          admin_notes: string | null
          agent_note: string | null
          amount_ghs: number
          batch_id: string | null
          batched_at: string | null
          bundle_size_gb: number
          cost_price_ghs: number | null
          created_at: string
          customer_name: string | null
          delivery_note: string | null
          failure_reason: string | null
          id: string
          is_checkpoint: boolean
          is_wholesale: boolean
          last_supplier_status: string | null
          last_supplier_sync_at: string | null
          markup_percent: number | null
          network: string
          order_channel: string | null
          order_id: string
          order_source: string
          order_type: string
          payment_method: string
          payment_status: string | null
          paystack_reference: string | null
          processing_fee: number | null
          product_id: string | null
          profit_ghs: number | null
          queue_state: string | null
          recipient_number: string
          reward_claim_id: string | null
          status: string
          status_updated_at: string
          supplier_amount: number | null
          supplier_attempts: number
          supplier_failed_at: string | null
          supplier_id: string | null
          supplier_message: string | null
          supplier_order_id: string | null
          supplier_raw_response: string | null
          supplier_reference: string | null
          supplier_remaining_balance: number | null
          supplier_status: string | null
          supplier_status_watch_until: string | null
          supplier_timestamp: string | null
          telegram_chat_id: number | null
          total_paid: number | null
          updated_at: string
          user_id: string | null
          wholesale_total_price: number | null
          wholesale_unit_price: number | null
        }
        Insert: {
          admin_notes?: string | null
          agent_note?: string | null
          amount_ghs: number
          batch_id?: string | null
          batched_at?: string | null
          bundle_size_gb: number
          cost_price_ghs?: number | null
          created_at?: string
          customer_name?: string | null
          delivery_note?: string | null
          failure_reason?: string | null
          id?: string
          is_checkpoint?: boolean
          is_wholesale?: boolean
          last_supplier_status?: string | null
          last_supplier_sync_at?: string | null
          markup_percent?: number | null
          network: string
          order_channel?: string | null
          order_id: string
          order_source?: string
          order_type?: string
          payment_method?: string
          payment_status?: string | null
          paystack_reference?: string | null
          processing_fee?: number | null
          product_id?: string | null
          profit_ghs?: number | null
          queue_state?: string | null
          recipient_number: string
          reward_claim_id?: string | null
          status?: string
          status_updated_at?: string
          supplier_amount?: number | null
          supplier_attempts?: number
          supplier_failed_at?: string | null
          supplier_id?: string | null
          supplier_message?: string | null
          supplier_order_id?: string | null
          supplier_raw_response?: string | null
          supplier_reference?: string | null
          supplier_remaining_balance?: number | null
          supplier_status?: string | null
          supplier_status_watch_until?: string | null
          supplier_timestamp?: string | null
          telegram_chat_id?: number | null
          total_paid?: number | null
          updated_at?: string
          user_id?: string | null
          wholesale_total_price?: number | null
          wholesale_unit_price?: number | null
        }
        Update: {
          admin_notes?: string | null
          agent_note?: string | null
          amount_ghs?: number
          batch_id?: string | null
          batched_at?: string | null
          bundle_size_gb?: number
          cost_price_ghs?: number | null
          created_at?: string
          customer_name?: string | null
          delivery_note?: string | null
          failure_reason?: string | null
          id?: string
          is_checkpoint?: boolean
          is_wholesale?: boolean
          last_supplier_status?: string | null
          last_supplier_sync_at?: string | null
          markup_percent?: number | null
          network?: string
          order_channel?: string | null
          order_id?: string
          order_source?: string
          order_type?: string
          payment_method?: string
          payment_status?: string | null
          paystack_reference?: string | null
          processing_fee?: number | null
          product_id?: string | null
          profit_ghs?: number | null
          queue_state?: string | null
          recipient_number?: string
          reward_claim_id?: string | null
          status?: string
          status_updated_at?: string
          supplier_amount?: number | null
          supplier_attempts?: number
          supplier_failed_at?: string | null
          supplier_id?: string | null
          supplier_message?: string | null
          supplier_order_id?: string | null
          supplier_raw_response?: string | null
          supplier_reference?: string | null
          supplier_remaining_balance?: number | null
          supplier_status?: string | null
          supplier_status_watch_until?: string | null
          supplier_timestamp?: string | null
          telegram_chat_id?: number | null
          total_paid?: number | null
          updated_at?: string
          user_id?: string | null
          wholesale_total_price?: number | null
          wholesale_unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_reward_claim_id_fkey"
            columns: ["reward_claim_id"]
            isOneToOne: false
            referencedRelation: "reward_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      page_views: {
        Row: {
          browser: string | null
          country: string | null
          created_at: string
          device_type: string | null
          id: string
          page_path: string
          referrer: string | null
          session_id: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          browser?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          page_path: string
          referrer?: string | null
          session_id: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          browser?: string | null
          country?: string | null
          created_at?: string
          device_type?: string | null
          id?: string
          page_path?: string
          referrer?: string | null
          session_id?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          agent_id: string | null
          amount: number
          created_at: string
          currency: string
          customer_email: string | null
          customer_phone: string | null
          id: string
          metadata_json: Json | null
          provider: string
          provider_reference: string
          provider_transaction_id: string | null
          status: string
          store_id: string | null
          updated_at: string
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          agent_id?: string | null
          amount: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_phone?: string | null
          id?: string
          metadata_json?: Json | null
          provider?: string
          provider_reference: string
          provider_transaction_id?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          agent_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_phone?: string | null
          id?: string
          metadata_json?: Json | null
          provider?: string
          provider_reference?: string
          provider_transaction_id?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          agent_id: string | null
          bundle_id: string | null
          bundle_size_gb: number
          created_at: string
          created_device: string | null
          created_ip: string | null
          expected_amount: number
          fulfilled_at: string | null
          fulfilled_by: string | null
          fulfillment_error: string | null
          guest_email: string | null
          id: string
          network: string
          order_created: boolean
          order_id: string | null
          order_type: string
          payment_status: string
          paystack_reference: string
          recipient_number: string
          store_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          bundle_id?: string | null
          bundle_size_gb: number
          created_at?: string
          created_device?: string | null
          created_ip?: string | null
          expected_amount: number
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_error?: string | null
          guest_email?: string | null
          id?: string
          network: string
          order_created?: boolean
          order_id?: string | null
          order_type?: string
          payment_status?: string
          paystack_reference: string
          recipient_number: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          bundle_id?: string | null
          bundle_size_gb?: number
          created_at?: string
          created_device?: string | null
          created_ip?: string | null
          expected_amount?: number
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          fulfillment_error?: string | null
          guest_email?: string | null
          id?: string
          network?: string
          order_created?: boolean
          order_id?: string | null
          order_type?: string
          payment_status?: string
          paystack_reference?: string
          recipient_number?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      payment_reconciliation_cases: {
        Row: {
          admin_note: string | null
          agent_id: string | null
          amount: number
          created_at: string
          currency: string
          id: string
          metadata: Json | null
          payment_id: string | null
          paystack_reference: string
          reason: string
          resolved_at: string | null
          severity: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string | null
          agent_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          payment_id?: string | null
          paystack_reference: string
          reason?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string | null
          agent_id?: string | null
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          metadata?: Json | null
          payment_id?: string | null
          paystack_reference?: string
          reason?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      paystack_init_error_logs: {
        Row: {
          agent_id: string | null
          amount_expected: number | null
          context: string
          created_at: string
          error_message: string | null
          id: string
          intent_type: string | null
          plan: string | null
          raw_response: string | null
        }
        Insert: {
          agent_id?: string | null
          amount_expected?: number | null
          context?: string
          created_at?: string
          error_message?: string | null
          id?: string
          intent_type?: string | null
          plan?: string | null
          raw_response?: string | null
        }
        Update: {
          agent_id?: string | null
          amount_expected?: number | null
          context?: string
          created_at?: string
          error_message?: string | null
          id?: string
          intent_type?: string | null
          plan?: string | null
          raw_response?: string | null
        }
        Relationships: []
      }
      paystack_payments: {
        Row: {
          amount_ghs: number
          channel: string | null
          checkout_meta: Json | null
          created_at: string
          currency: string
          customer_email: string | null
          id: string
          linked_order_id: string | null
          linked_wallet_txn_id: string | null
          paid_at: string | null
          processing_fee: number | null
          purpose: string
          raw_response: Json | null
          reference: string
          status: string
          total_paid: number | null
          user_id: string | null
          verified_at: string | null
        }
        Insert: {
          amount_ghs: number
          channel?: string | null
          checkout_meta?: Json | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          id?: string
          linked_order_id?: string | null
          linked_wallet_txn_id?: string | null
          paid_at?: string | null
          processing_fee?: number | null
          purpose: string
          raw_response?: Json | null
          reference: string
          status?: string
          total_paid?: number | null
          user_id?: string | null
          verified_at?: string | null
        }
        Update: {
          amount_ghs?: number
          channel?: string | null
          checkout_meta?: Json | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          id?: string
          linked_order_id?: string | null
          linked_wallet_txn_id?: string | null
          paid_at?: string | null
          processing_fee?: number | null
          purpose?: string
          raw_response?: Json | null
          reference?: string
          status?: string
          total_paid?: number | null
          user_id?: string | null
          verified_at?: string | null
        }
        Relationships: []
      }
      paystack_sync_runs: {
        Row: {
          already_existed_count: number | null
          debug: Json | null
          ended_at: string | null
          errors: Json | null
          fetched_count: number | null
          id: string
          range: string | null
          started_at: string
          status: string
          triggered_by: string | null
          upserted_count: number | null
        }
        Insert: {
          already_existed_count?: number | null
          debug?: Json | null
          ended_at?: string | null
          errors?: Json | null
          fetched_count?: number | null
          id?: string
          range?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
          upserted_count?: number | null
        }
        Update: {
          already_existed_count?: number | null
          debug?: Json | null
          ended_at?: string | null
          errors?: Json | null
          fetched_count?: number | null
          id?: string
          range?: string | null
          started_at?: string
          status?: string
          triggered_by?: string | null
          upserted_count?: number | null
        }
        Relationships: []
      }
      paystack_transactions: {
        Row: {
          amount: number
          authorization_brand: string | null
          authorization_last4: string | null
          channel: string | null
          created_at: string
          currency: string
          customer_email: string | null
          customer_name: string | null
          customer_phone: string | null
          fees: number | null
          id: string
          ip_address: string | null
          last_checked_at: string | null
          linked_agent_subscription_id: string | null
          linked_deposit_id: string | null
          linked_order_id: string | null
          linked_user_id: string | null
          metadata: Json
          paid_at: string | null
          paystack_id: number | null
          purpose: string | null
          raw: Json
          reconciliation_reason: string | null
          reconciliation_status: string
          reference: string
          status: string
        }
        Insert: {
          amount: number
          authorization_brand?: string | null
          authorization_last4?: string | null
          channel?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fees?: number | null
          id?: string
          ip_address?: string | null
          last_checked_at?: string | null
          linked_agent_subscription_id?: string | null
          linked_deposit_id?: string | null
          linked_order_id?: string | null
          linked_user_id?: string | null
          metadata?: Json
          paid_at?: string | null
          paystack_id?: number | null
          purpose?: string | null
          raw?: Json
          reconciliation_reason?: string | null
          reconciliation_status?: string
          reference: string
          status?: string
        }
        Update: {
          amount?: number
          authorization_brand?: string | null
          authorization_last4?: string | null
          channel?: string | null
          created_at?: string
          currency?: string
          customer_email?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          fees?: number | null
          id?: string
          ip_address?: string | null
          last_checked_at?: string | null
          linked_agent_subscription_id?: string | null
          linked_deposit_id?: string | null
          linked_order_id?: string | null
          linked_user_id?: string | null
          metadata?: Json
          paid_at?: string | null
          paystack_id?: number | null
          purpose?: string | null
          raw?: Json
          reconciliation_reason?: string | null
          reconciliation_status?: string
          reference?: string
          status?: string
        }
        Relationships: []
      }
      paystack_transfer_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          paystack_event_id: string | null
          processed: boolean
          processing_notes: string | null
          raw_payload: Json
          status: string | null
          transfer_code: string | null
          transfer_reference: string | null
          withdrawal_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          paystack_event_id?: string | null
          processed?: boolean
          processing_notes?: string | null
          raw_payload: Json
          status?: string | null
          transfer_code?: string | null
          transfer_reference?: string | null
          withdrawal_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          paystack_event_id?: string | null
          processed?: boolean
          processing_notes?: string | null
          raw_payload?: Json
          status?: string | null
          transfer_code?: string | null
          transfer_reference?: string | null
          withdrawal_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "paystack_transfer_events_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "agent_withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
      point_transactions: {
        Row: {
          admin_user_id: string | null
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          metadata: Json
          reference_id: string | null
          source: string
          type: string
          user_id: string
        }
        Insert: {
          admin_user_id?: string | null
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          reference_id?: string | null
          source: string
          type: string
          user_id: string
        }
        Update: {
          admin_user_id?: string | null
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          metadata?: Json
          reference_id?: string | null
          source?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_overrides: {
        Row: {
          created_at: string
          customer_type: string
          id: string
          manual_price: number | null
          markup_percent_override: number | null
          pricing_mode: string
          product_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          customer_type?: string
          id?: string
          manual_price?: number | null
          markup_percent_override?: number | null
          pricing_mode?: string
          product_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          customer_type?: string
          id?: string
          manual_price?: number | null
          markup_percent_override?: number | null
          pricing_mode?: string
          product_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_overrides_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          agent_price_ghs: number | null
          bundle_size_gb: number
          cost_price_ghs: number | null
          created_at: string
          delivery_type: string
          description: string
          display_order: number
          expiry_type: string
          id: string
          markup_percent: number | null
          network: string
          popular: boolean
          price_ghs: number
          supplier_last_updated: string | null
          validity_days: number
        }
        Insert: {
          active?: boolean
          agent_price_ghs?: number | null
          bundle_size_gb: number
          cost_price_ghs?: number | null
          created_at?: string
          delivery_type?: string
          description?: string
          display_order?: number
          expiry_type?: string
          id?: string
          markup_percent?: number | null
          network: string
          popular?: boolean
          price_ghs: number
          supplier_last_updated?: string | null
          validity_days?: number
        }
        Update: {
          active?: boolean
          agent_price_ghs?: number | null
          bundle_size_gb?: number
          cost_price_ghs?: number | null
          created_at?: string
          delivery_type?: string
          description?: string
          display_order?: number
          expiry_type?: string
          id?: string
          markup_percent?: number | null
          network?: string
          popular?: boolean
          price_ghs?: number
          supplier_last_updated?: string | null
          validity_days?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          accepted_disclaimer: boolean
          accepted_disclaimer_at: string | null
          accepted_disclaimer_version: string | null
          accepted_privacy: boolean
          accepted_privacy_at: string | null
          accepted_privacy_version: string | null
          accepted_terms: boolean
          accepted_terms_at: string | null
          accepted_terms_version: string | null
          admin_notes: string | null
          avatar_url: string | null
          banned_by: string | null
          created_at: string
          device_hash: string | null
          email: string | null
          first_order_qualified_at: string | null
          full_name: string | null
          id: string
          is_pwa_user: boolean
          manual_deposit_enabled: boolean
          orders_last_seen_at: string | null
          phone: string | null
          phone_e164: string | null
          pwa_first_detected_at: string | null
          pwa_last_seen_at: string | null
          qualified_first_order_id: string | null
          referral_code: string
          referral_frozen: boolean
          referral_frozen_at: string | null
          referral_frozen_reason: string | null
          referral_qualified: boolean
          referral_signup_count: number
          referral_source: string | null
          referral_success_count: number
          referral_terms_accepted: boolean
          referral_terms_accepted_at: string | null
          referred_by: string | null
          registration_ip: string | null
          reward_activated: boolean
          suspended: boolean
          suspended_at: string | null
          suspended_reason: string | null
          updated_at: string
          username: string | null
        }
        Insert: {
          accepted_disclaimer?: boolean
          accepted_disclaimer_at?: string | null
          accepted_disclaimer_version?: string | null
          accepted_privacy?: boolean
          accepted_privacy_at?: string | null
          accepted_privacy_version?: string | null
          accepted_terms?: boolean
          accepted_terms_at?: string | null
          accepted_terms_version?: string | null
          admin_notes?: string | null
          avatar_url?: string | null
          banned_by?: string | null
          created_at?: string
          device_hash?: string | null
          email?: string | null
          first_order_qualified_at?: string | null
          full_name?: string | null
          id: string
          is_pwa_user?: boolean
          manual_deposit_enabled?: boolean
          orders_last_seen_at?: string | null
          phone?: string | null
          phone_e164?: string | null
          pwa_first_detected_at?: string | null
          pwa_last_seen_at?: string | null
          qualified_first_order_id?: string | null
          referral_code: string
          referral_frozen?: boolean
          referral_frozen_at?: string | null
          referral_frozen_reason?: string | null
          referral_qualified?: boolean
          referral_signup_count?: number
          referral_source?: string | null
          referral_success_count?: number
          referral_terms_accepted?: boolean
          referral_terms_accepted_at?: string | null
          referred_by?: string | null
          registration_ip?: string | null
          reward_activated?: boolean
          suspended?: boolean
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          username?: string | null
        }
        Update: {
          accepted_disclaimer?: boolean
          accepted_disclaimer_at?: string | null
          accepted_disclaimer_version?: string | null
          accepted_privacy?: boolean
          accepted_privacy_at?: string | null
          accepted_privacy_version?: string | null
          accepted_terms?: boolean
          accepted_terms_at?: string | null
          accepted_terms_version?: string | null
          admin_notes?: string | null
          avatar_url?: string | null
          banned_by?: string | null
          created_at?: string
          device_hash?: string | null
          email?: string | null
          first_order_qualified_at?: string | null
          full_name?: string | null
          id?: string
          is_pwa_user?: boolean
          manual_deposit_enabled?: boolean
          orders_last_seen_at?: string | null
          phone?: string | null
          phone_e164?: string | null
          pwa_first_detected_at?: string | null
          pwa_last_seen_at?: string | null
          qualified_first_order_id?: string | null
          referral_code?: string
          referral_frozen?: boolean
          referral_frozen_at?: string | null
          referral_frozen_reason?: string | null
          referral_qualified?: boolean
          referral_signup_count?: number
          referral_source?: string | null
          referral_success_count?: number
          referral_terms_accepted?: boolean
          referral_terms_accepted_at?: string | null
          referred_by?: string | null
          registration_ip?: string | null
          reward_activated?: boolean
          suspended?: boolean
          suspended_at?: string | null
          suspended_reason?: string | null
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      push_notification_logs: {
        Row: {
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          message: string
          onesignal_notification_id: string | null
          recipients: number | null
          segment: string | null
          sent_at: string
          status: string | null
          title: string
          triggered_by: string | null
          url: string | null
        }
        Insert: {
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          message: string
          onesignal_notification_id?: string | null
          recipients?: number | null
          segment?: string | null
          sent_at?: string
          status?: string | null
          title: string
          triggered_by?: string | null
          url?: string | null
        }
        Update: {
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          message?: string
          onesignal_notification_id?: string | null
          recipients?: number | null
          segment?: string | null
          sent_at?: string
          status?: string | null
          title?: string
          triggered_by?: string | null
          url?: string | null
        }
        Relationships: []
      }
      pwa_devices: {
        Row: {
          created_at: string
          device_fingerprint: string
          first_pwa_detected_at: string | null
          first_seen_at: string
          id: string
          is_pwa: boolean
          last_pwa_seen_at: string | null
          last_seen_at: string
          platform: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          device_fingerprint: string
          first_pwa_detected_at?: string | null
          first_seen_at?: string
          id?: string
          is_pwa?: boolean
          last_pwa_seen_at?: string | null
          last_seen_at?: string
          platform?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          device_fingerprint?: string
          first_pwa_detected_at?: string | null
          first_seen_at?: string
          id?: string
          is_pwa?: boolean
          last_pwa_seen_at?: string | null
          last_seen_at?: string
          platform?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      reconciliation_actions: {
        Row: {
          action_payload_json: Json | null
          action_type: string
          admin_id: string
          case_id: string
          created_at: string
          error_message: string | null
          id: string
        }
        Insert: {
          action_payload_json?: Json | null
          action_type: string
          admin_id: string
          case_id: string
          created_at?: string
          error_message?: string | null
          id?: string
        }
        Update: {
          action_payload_json?: Json | null
          action_type?: string
          admin_id?: string
          case_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_actions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_cases: {
        Row: {
          case_type: string
          created_at: string
          expected_order_amount: number | null
          id: string
          intended_agent_id: string | null
          intended_channel: string | null
          intended_product: Json | null
          intended_recipient: string | null
          intended_store_id: string | null
          intended_user_id: string | null
          linked_order_id: string | null
          lock_version: number
          locked_at: string | null
          locked_by: string | null
          payment_event_id: string
          processing_lock: boolean
          reason_code: string | null
          reason_detail: string | null
          resolution_type: string | null
          resolved_at: string | null
          resolved_by_admin_id: string | null
          severity: string
          state: string
          updated_at: string
        }
        Insert: {
          case_type?: string
          created_at?: string
          expected_order_amount?: number | null
          id?: string
          intended_agent_id?: string | null
          intended_channel?: string | null
          intended_product?: Json | null
          intended_recipient?: string | null
          intended_store_id?: string | null
          intended_user_id?: string | null
          linked_order_id?: string | null
          lock_version?: number
          locked_at?: string | null
          locked_by?: string | null
          payment_event_id: string
          processing_lock?: boolean
          reason_code?: string | null
          reason_detail?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by_admin_id?: string | null
          severity?: string
          state?: string
          updated_at?: string
        }
        Update: {
          case_type?: string
          created_at?: string
          expected_order_amount?: number | null
          id?: string
          intended_agent_id?: string | null
          intended_channel?: string | null
          intended_product?: Json | null
          intended_recipient?: string | null
          intended_store_id?: string | null
          intended_user_id?: string | null
          linked_order_id?: string | null
          lock_version?: number
          locked_at?: string | null
          locked_by?: string | null
          payment_event_id?: string
          processing_lock?: boolean
          reason_code?: string | null
          reason_detail?: string | null
          resolution_type?: string | null
          resolved_at?: string | null
          resolved_by_admin_id?: string | null
          severity?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_cases_payment_event_id_fkey"
            columns: ["payment_event_id"]
            isOneToOne: false
            referencedRelation: "payment_events"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_notes: {
        Row: {
          admin_id: string
          case_id: string
          created_at: string
          id: string
          note_text: string
        }
        Insert: {
          admin_id: string
          case_id: string
          created_at?: string
          id?: string
          note_text: string
        }
        Update: {
          admin_id?: string
          case_id?: string
          created_at?: string
          id?: string
          note_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_notes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "reconciliation_cases"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_activity: {
        Row: {
          admin_decision: string | null
          admin_reviewed: boolean
          admin_reviewed_at: string | null
          admin_reviewed_by: string | null
          created_at: string
          first_success_order_id: string | null
          flag_type: string | null
          flagged: boolean
          id: string
          referee_device_hash: string | null
          referee_id: string
          referee_phone: string | null
          referee_registration_ip: string | null
          referrer_id: string
          rejected_reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_decision?: string | null
          admin_reviewed?: boolean
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          created_at?: string
          first_success_order_id?: string | null
          flag_type?: string | null
          flagged?: boolean
          id?: string
          referee_device_hash?: string | null
          referee_id: string
          referee_phone?: string | null
          referee_registration_ip?: string | null
          referrer_id: string
          rejected_reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_decision?: string | null
          admin_reviewed?: boolean
          admin_reviewed_at?: string | null
          admin_reviewed_by?: string | null
          created_at?: string
          first_success_order_id?: string | null
          flag_type?: string | null
          flagged?: boolean
          id?: string
          referee_device_hash?: string | null
          referee_id?: string
          referee_phone?: string | null
          referee_registration_ip?: string | null
          referrer_id?: string
          rejected_reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      referral_campaign_settings: {
        Row: {
          active: boolean
          id: string
          required_referrals: number
          reward_type: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          id?: string
          required_referrals?: number
          reward_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          id?: string
          required_referrals?: number
          reward_type?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      referral_flags: {
        Row: {
          admin_decision: string | null
          admin_notes: string | null
          auto_flagged: boolean
          created_at: string
          details: Json | null
          flag_type: string
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewed_by_admin: boolean
          severity_level: string
          user_id: string
        }
        Insert: {
          admin_decision?: string | null
          admin_notes?: string | null
          auto_flagged?: boolean
          created_at?: string
          details?: Json | null
          flag_type: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_admin?: boolean
          severity_level?: string
          user_id: string
        }
        Update: {
          admin_decision?: string | null
          admin_notes?: string | null
          auto_flagged?: boolean
          created_at?: string
          details?: Json | null
          flag_type?: string
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewed_by_admin?: boolean
          severity_level?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_qualifications: {
        Row: {
          amount: number | null
          bundle: string | null
          first_order_id: string
          id: string
          network: string | null
          order_source: string | null
          qualified_at: string
          referee_id: string
          referrer_id: string
        }
        Insert: {
          amount?: number | null
          bundle?: string | null
          first_order_id: string
          id?: string
          network?: string | null
          order_source?: string | null
          qualified_at?: string
          referee_id: string
          referrer_id: string
        }
        Update: {
          amount?: number | null
          bundle?: string | null
          first_order_id?: string
          id?: string
          network?: string | null
          order_source?: string | null
          qualified_at?: string
          referee_id?: string
          referrer_id?: string
        }
        Relationships: []
      }
      referral_qualified_events: {
        Row: {
          created_at: string
          first_order_id: string | null
          id: string
          qualified_at: string
          referred_user_id: string
          referrer_user_id: string
          week_key: string
        }
        Insert: {
          created_at?: string
          first_order_id?: string | null
          id?: string
          qualified_at?: string
          referred_user_id: string
          referrer_user_id: string
          week_key: string
        }
        Update: {
          created_at?: string
          first_order_id?: string | null
          id?: string
          qualified_at?: string
          referred_user_id?: string
          referrer_user_id?: string
          week_key?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          claimed_at: string | null
          created_at: string
          id: string
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          status: string
          type: string
          user_id: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          type?: string
          user_id: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          id?: string
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          status?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      reward_claims: {
        Row: {
          created_at: string
          id: string
          linked_order_id: string | null
          milestone_id: string
          network: string
          payout_gb: number | null
          phone: string
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          linked_order_id?: string | null
          milestone_id: string
          network: string
          payout_gb?: number | null
          phone: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          linked_order_id?: string | null
          milestone_id?: string
          network?: string
          payout_gb?: number | null
          phone?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reward_claims_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "reward_milestones"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_milestones: {
        Row: {
          created_at: string
          gb_amount: number
          id: string
          required_referrals: number
          sort_order: number
        }
        Insert: {
          created_at?: string
          gb_amount: number
          id?: string
          required_referrals: number
          sort_order?: number
        }
        Update: {
          created_at?: string
          gb_amount?: number
          id?: string
          required_referrals?: number
          sort_order?: number
        }
        Relationships: []
      }
      routing_rules: {
        Row: {
          created_at: string
          id: string
          product_id: string
          status: string
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          status?: string
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          status?: string
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_rules_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_rules_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      security_blocks: {
        Row: {
          block_type: string
          block_value: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          notes: string | null
          reason: string
          severity: string
          status: string
        }
        Insert: {
          block_type: string
          block_value: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          reason?: string
          severity?: string
          status?: string
        }
        Update: {
          block_type?: string
          block_value?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          notes?: string | null
          reason?: string
          severity?: string
          status?: string
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          device_hash: string | null
          event_type: string
          id: string
          ip: string | null
          meta: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_hash?: string | null
          event_type: string
          id?: string
          ip?: string | null
          meta?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_hash?: string | null
          event_type?: string
          id?: string
          ip?: string | null
          meta?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      site_notices: {
        Row: {
          affected_network: string
          enabled: boolean
          end_time: string | null
          id: string
          message: string
          severity: string
          start_time: string | null
          title: string
          updated_at: string
        }
        Insert: {
          affected_network?: string
          enabled?: boolean
          end_time?: string | null
          id?: string
          message?: string
          severity?: string
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          affected_network?: string
          enabled?: boolean
          end_time?: string | null
          id?: string
          message?: string
          severity?: string
          start_time?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          agent_id: string | null
          attempts: number
          created_at: string
          error_message: string | null
          event_type: string
          http_status: number | null
          id: string
          message: string
          order_id: string | null
          provider_message_id: string | null
          provider_response: string | null
          provider_response_code: string | null
          reference: string | null
          request_method: string | null
          request_payload: string | null
          request_url: string | null
          status: string
          to_number: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          attempts?: number
          created_at?: string
          error_message?: string | null
          event_type: string
          http_status?: number | null
          id?: string
          message: string
          order_id?: string | null
          provider_message_id?: string | null
          provider_response?: string | null
          provider_response_code?: string | null
          reference?: string | null
          request_method?: string | null
          request_payload?: string | null
          request_url?: string | null
          status?: string
          to_number: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          attempts?: number
          created_at?: string
          error_message?: string | null
          event_type?: string
          http_status?: number | null
          id?: string
          message?: string
          order_id?: string | null
          provider_message_id?: string | null
          provider_response?: string | null
          provider_response_code?: string | null
          reference?: string | null
          request_method?: string | null
          request_payload?: string | null
          request_url?: string | null
          status?: string
          to_number?: string
          user_id?: string | null
        }
        Relationships: []
      }
      sms_queue: {
        Row: {
          agent_id: string | null
          attempts: number
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          last_http_status: number | null
          last_response: string | null
          max_retries: number
          message: string
          next_retry_at: string
          order_id: string | null
          reference: string | null
          status: string
          to_number: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          attempts?: number
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          last_http_status?: number | null
          last_response?: string | null
          max_retries?: number
          message: string
          next_retry_at?: string
          order_id?: string | null
          reference?: string | null
          status?: string
          to_number: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          attempts?: number
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          last_http_status?: number | null
          last_response?: string | null
          max_retries?: number
          message?: string
          next_retry_at?: string
          order_id?: string | null
          reference?: string | null
          status?: string
          to_number?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      supplier_api_logs: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          order_id: string
          request_payload: Json | null
          response_body: Json | null
          response_status: string | null
          response_time_ms: number | null
          success: boolean
          supplier_balance: number | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id: string
          request_payload?: Json | null
          response_body?: Json | null
          response_status?: string | null
          response_time_ms?: number | null
          success?: boolean
          supplier_balance?: number | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          order_id?: string
          request_payload?: Json | null
          response_body?: Json | null
          response_status?: string | null
          response_time_ms?: number | null
          success?: boolean
          supplier_balance?: number | null
        }
        Relationships: []
      }
      supplier_balance_snapshots: {
        Row: {
          balance: number
          created_at: string
          id: string
          source: string
          supplier_id: string
        }
        Insert: {
          balance: number
          created_at?: string
          id?: string
          source?: string
          supplier_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          source?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_balance_snapshots_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_c_pricing: {
        Row: {
          agent_base_price: number
          bundle_size_gb: number
          created_at: string
          id: string
          network: string
          normal_selling_price: number
          plan_label: string
          supplier_cost: number
          updated_at: string
        }
        Insert: {
          agent_base_price?: number
          bundle_size_gb: number
          created_at?: string
          id?: string
          network: string
          normal_selling_price?: number
          plan_label?: string
          supplier_cost?: number
          updated_at?: string
        }
        Update: {
          agent_base_price?: number
          bundle_size_gb?: number
          created_at?: string
          id?: string
          network?: string
          normal_selling_price?: number
          plan_label?: string
          supplier_cost?: number
          updated_at?: string
        }
        Relationships: []
      }
      supplier_ledger: {
        Row: {
          amount_ghs: number
          created_at: string
          created_by: string | null
          direction: string
          evidence_url: string | null
          id: string
          note: string | null
          order_id: string | null
          reconciliation_status: string
          supplier_reference: string | null
          type: string
        }
        Insert: {
          amount_ghs: number
          created_at?: string
          created_by?: string | null
          direction: string
          evidence_url?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          reconciliation_status?: string
          supplier_reference?: string | null
          type: string
        }
        Update: {
          amount_ghs?: number
          created_at?: string
          created_by?: string | null
          direction?: string
          evidence_url?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          reconciliation_status?: string
          supplier_reference?: string | null
          type?: string
        }
        Relationships: []
      }
      supplier_plan_mappings: {
        Row: {
          created_at: string | null
          id: string
          internal_network: string
          is_active: boolean | null
          provider_network_id: string
          provider_network_name: string | null
          provider_plan_id: string
          provider_plan_name: string | null
          provider_price: number | null
          size_gb: number
          supplier_code: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          internal_network: string
          is_active?: boolean | null
          provider_network_id: string
          provider_network_name?: string | null
          provider_plan_id: string
          provider_plan_name?: string | null
          provider_price?: number | null
          size_gb: number
          supplier_code: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          internal_network?: string
          is_active?: boolean | null
          provider_network_id?: string
          provider_network_name?: string | null
          provider_plan_id?: string
          provider_plan_name?: string | null
          provider_price?: number | null
          size_gb?: number
          supplier_code?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      supplier_shadow_wallet: {
        Row: {
          current_balance_ghs: number
          id: boolean
          last_computed_at: string | null
          starting_balance_ghs: number
          starting_balance_set_at: string | null
          starting_balance_set_by: string | null
          updated_at: string
        }
        Insert: {
          current_balance_ghs?: number
          id?: boolean
          last_computed_at?: string | null
          starting_balance_ghs?: number
          starting_balance_set_at?: string | null
          starting_balance_set_by?: string | null
          updated_at?: string
        }
        Update: {
          current_balance_ghs?: number
          id?: boolean
          last_computed_at?: string | null
          starting_balance_ghs?: number
          starting_balance_set_at?: string | null
          starting_balance_set_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      supplier_status_sync_logs: {
        Row: {
          applied: boolean
          created_at: string
          id: string
          local_order_id: string
          local_order_table: string
          mapped_platform_status: string | null
          previous_local_status: string | null
          raw_meta: Json | null
          reason: string | null
          source: string
          supplier_reference: string | null
          supplier_status: string | null
        }
        Insert: {
          applied?: boolean
          created_at?: string
          id?: string
          local_order_id: string
          local_order_table: string
          mapped_platform_status?: string | null
          previous_local_status?: string | null
          raw_meta?: Json | null
          reason?: string | null
          source?: string
          supplier_reference?: string | null
          supplier_status?: string | null
        }
        Update: {
          applied?: boolean
          created_at?: string
          id?: string
          local_order_id?: string
          local_order_table?: string
          mapped_platform_status?: string | null
          previous_local_status?: string | null
          raw_meta?: Json | null
          reason?: string | null
          source?: string
          supplier_reference?: string | null
          supplier_status?: string | null
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          api_base_url: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          last_balance: number | null
          last_balance_updated_at: string | null
          name: string
          supports_webhooks: boolean
          updated_at: string
        }
        Insert: {
          api_base_url?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_balance?: number | null
          last_balance_updated_at?: string | null
          name: string
          supports_webhooks?: boolean
          updated_at?: string
        }
        Update: {
          api_base_url?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_balance?: number | null
          last_balance_updated_at?: string | null
          name?: string
          supports_webhooks?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          category: string
          created_at: string
          description: string
          id: string
          order_id: string | null
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          order_id?: string | null
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      support_tickets_v2: {
        Row: {
          agent_id: string | null
          assigned_agent_name: string | null
          assigned_agent_telegram_id: number | null
          category: string
          close_reason: string | null
          created_at: string
          created_by: string | null
          customer_phone: string | null
          id: string
          last_user_message_at: string | null
          related_order_id: string | null
          satisfaction_rating: number | null
          source: string
          status: string
          subject: string
          telegram_chat_id: number | null
          telegram_user_id: number | null
          telegram_username: string | null
          ticket_code: string | null
          ticket_type: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          assigned_agent_name?: string | null
          assigned_agent_telegram_id?: number | null
          category?: string
          close_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_phone?: string | null
          id?: string
          last_user_message_at?: string | null
          related_order_id?: string | null
          satisfaction_rating?: number | null
          source?: string
          status?: string
          subject: string
          telegram_chat_id?: number | null
          telegram_user_id?: number | null
          telegram_username?: string | null
          ticket_code?: string | null
          ticket_type?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          assigned_agent_name?: string | null
          assigned_agent_telegram_id?: number | null
          category?: string
          close_reason?: string | null
          created_at?: string
          created_by?: string | null
          customer_phone?: string | null
          id?: string
          last_user_message_at?: string | null
          related_order_id?: string | null
          satisfaction_rating?: number | null
          source?: string
          status?: string
          subject?: string
          telegram_chat_id?: number | null
          telegram_user_id?: number | null
          telegram_username?: string | null
          ticket_code?: string | null
          ticket_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_v2_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_admin_command_log: {
        Row: {
          args: string | null
          command: string
          created_at: string
          id: string
          result: string | null
          telegram_chat_id: number | null
          telegram_user_id: number
          telegram_username: string | null
          ticket_code: string | null
          ticket_id: string | null
        }
        Insert: {
          args?: string | null
          command: string
          created_at?: string
          id?: string
          result?: string | null
          telegram_chat_id?: number | null
          telegram_user_id: number
          telegram_username?: string | null
          ticket_code?: string | null
          ticket_id?: string | null
        }
        Update: {
          args?: string | null
          command?: string
          created_at?: string
          id?: string
          result?: string | null
          telegram_chat_id?: number | null
          telegram_user_id?: number
          telegram_username?: string | null
          ticket_code?: string | null
          ticket_id?: string | null
        }
        Relationships: []
      }
      telegram_bot_state: {
        Row: {
          id: number
          last_polled_at: string
          update_offset: number
        }
        Insert: {
          id: number
          last_polled_at?: string
          update_offset?: number
        }
        Update: {
          id?: number
          last_polled_at?: string
          update_offset?: number
        }
        Relationships: []
      }
      telegram_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          id: string
          streak_count: number
          telegram_user_id: number | null
          user_id: string | null
        }
        Insert: {
          checkin_date: string
          created_at?: string
          id?: string
          streak_count?: number
          telegram_user_id?: number | null
          user_id?: string | null
        }
        Update: {
          checkin_date?: string
          created_at?: string
          id?: string
          streak_count?: number
          telegram_user_id?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      telegram_known_users: {
        Row: {
          first_name: string | null
          first_referrer_telegram_user_id: number | null
          first_seen_at: string
          last_seen_at: string
          telegram_user_id: number
        }
        Insert: {
          first_name?: string | null
          first_referrer_telegram_user_id?: number | null
          first_seen_at?: string
          last_seen_at?: string
          telegram_user_id: number
        }
        Update: {
          first_name?: string | null
          first_referrer_telegram_user_id?: number | null
          first_seen_at?: string
          last_seen_at?: string
          telegram_user_id?: number
        }
        Relationships: []
      }
      telegram_link_otps: {
        Row: {
          attempts: number
          chat_id: number
          consumed_at: string | null
          created_at: string
          expires_at: string
          id: string
          otp_code: string
          phone: string
        }
        Insert: {
          attempts?: number
          chat_id: number
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          id?: string
          otp_code: string
          phone: string
        }
        Update: {
          attempts?: number
          chat_id?: number
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          otp_code?: string
          phone?: string
        }
        Relationships: []
      }
      telegram_link_tokens: {
        Row: {
          channel: string
          consumed_at: string | null
          consumed_by_chat_id: number | null
          created_at: string
          expires_at: string
          id: string
          token: string
          user_id: string
        }
        Insert: {
          channel?: string
          consumed_at?: string | null
          consumed_by_chat_id?: number | null
          created_at?: string
          expires_at: string
          id?: string
          token: string
          user_id: string
        }
        Update: {
          channel?: string
          consumed_at?: string | null
          consumed_by_chat_id?: number | null
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      telegram_links: {
        Row: {
          chat_id: number
          created_at: string
          first_name: string | null
          id: string
          last_active_at: string
          linked_at: string
          phone: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          first_name?: string | null
          id?: string
          last_active_at?: string
          linked_at?: string
          phone?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          first_name?: string | null
          id?: string
          last_active_at?: string
          linked_at?: string
          phone?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      telegram_payment_intents: {
        Row: {
          base_amount: number | null
          bundle_size_gb: number | null
          chat_id: number
          created_at: string
          id: string
          network: string | null
          notified_at: string | null
          outcome: string | null
          paystack_reference: string
          product_id: string | null
          purpose: string
          recipient_phone: string | null
          status: string
          total_payable: number | null
          user_id: string | null
        }
        Insert: {
          base_amount?: number | null
          bundle_size_gb?: number | null
          chat_id: number
          created_at?: string
          id?: string
          network?: string | null
          notified_at?: string | null
          outcome?: string | null
          paystack_reference: string
          product_id?: string | null
          purpose: string
          recipient_phone?: string | null
          status?: string
          total_payable?: number | null
          user_id?: string | null
        }
        Update: {
          base_amount?: number | null
          bundle_size_gb?: number | null
          chat_id?: number
          created_at?: string
          id?: string
          network?: string | null
          notified_at?: string | null
          outcome?: string | null
          paystack_reference?: string
          product_id?: string | null
          purpose?: string
          recipient_phone?: string | null
          status?: string
          total_payable?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      telegram_points_balances: {
        Row: {
          balance: number
          banned_at: string | null
          banned_from_points: boolean
          banned_reason: string | null
          expiry_warning_sent_at: string | null
          id: string
          last_activity_at: string
          telegram_user_id: number | null
          tier_notified_max_gb: number
          updated_at: string
          user_id: string | null
        }
        Insert: {
          balance?: number
          banned_at?: string | null
          banned_from_points?: boolean
          banned_reason?: string | null
          expiry_warning_sent_at?: string | null
          id?: string
          last_activity_at?: string
          telegram_user_id?: number | null
          tier_notified_max_gb?: number
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          balance?: number
          banned_at?: string | null
          banned_from_points?: boolean
          banned_reason?: string | null
          expiry_warning_sent_at?: string | null
          id?: string
          last_activity_at?: string
          telegram_user_id?: number | null
          tier_notified_max_gb?: number
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      telegram_points_config: {
        Row: {
          id: boolean
          points_system_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          points_system_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          points_system_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      telegram_points_ledger: {
        Row: {
          balance_after: number
          created_at: string
          delta: number
          id: string
          reason: string
          reference_id: string | null
          telegram_user_id: number | null
          user_id: string | null
        }
        Insert: {
          balance_after: number
          created_at?: string
          delta: number
          id?: string
          reason: string
          reference_id?: string | null
          telegram_user_id?: number | null
          user_id?: string | null
        }
        Update: {
          balance_after?: number
          created_at?: string
          delta?: number
          id?: string
          reason?: string
          reference_id?: string | null
          telegram_user_id?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      telegram_referrals: {
        Row: {
          created_at: string
          id: string
          qualified_at: string | null
          qualifying_order_id: string | null
          referee_chat_id: number
          referee_telegram_user_id: number | null
          referee_user_id: string | null
          referrer_chat_id: number
          referrer_telegram_user_id: number | null
          referrer_user_id: string | null
          rewarded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          qualified_at?: string | null
          qualifying_order_id?: string | null
          referee_chat_id: number
          referee_telegram_user_id?: number | null
          referee_user_id?: string | null
          referrer_chat_id: number
          referrer_telegram_user_id?: number | null
          referrer_user_id?: string | null
          rewarded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          qualified_at?: string | null
          qualifying_order_id?: string | null
          referee_chat_id?: number
          referee_telegram_user_id?: number | null
          referee_user_id?: string | null
          referrer_chat_id?: number
          referrer_telegram_user_id?: number | null
          referrer_user_id?: string | null
          rewarded_at?: string | null
          status?: string
        }
        Relationships: []
      }
      telegram_sessions: {
        Row: {
          chat_id: number
          data: Json
          state: string | null
          updated_at: string
        }
        Insert: {
          chat_id: number
          data?: Json
          state?: string | null
          updated_at?: string
        }
        Update: {
          chat_id?: number
          data?: Json
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      telegram_transient_menus: {
        Row: {
          chat_id: number
          message_id: number
          prefixes: string[]
          updated_at: string
        }
        Insert: {
          chat_id: number
          message_id: number
          prefixes?: string[]
          updated_at?: string
        }
        Update: {
          chat_id?: number
          message_id?: number
          prefixes?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      tg_admin_audit_log: {
        Row: {
          action: string
          admin_user_id: string
          created_at: string
          details: Json
          id: string
          ip_address: unknown
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_user_id: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_user_id?: string
          created_at?: string
          details?: Json
          id?: string
          ip_address?: unknown
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      tg_admin_bans: {
        Row: {
          banned_at: string
          banned_by: string
          chat_id: number
          reason: string | null
        }
        Insert: {
          banned_at?: string
          banned_by: string
          chat_id: number
          reason?: string | null
        }
        Update: {
          banned_at?: string
          banned_by?: string
          chat_id?: number
          reason?: string | null
        }
        Relationships: []
      }
      tg_admin_broadcast_recipients: {
        Row: {
          broadcast_id: string
          chat_id: number
          error: string | null
          id: string
          sent_at: string | null
          status: string
        }
        Insert: {
          broadcast_id: string
          chat_id: number
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          broadcast_id?: string
          chat_id?: number
          error?: string | null
          id?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "tg_admin_broadcast_recipients_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "tg_admin_broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      tg_admin_broadcasts: {
        Row: {
          button_label: string | null
          button_url: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          failed_count: number
          id: string
          message: string
          scheduled_for: string | null
          segment: Json
          sent_count: number
          started_at: string | null
          status: string
          total_count: number
        }
        Insert: {
          button_label?: string | null
          button_url?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          failed_count?: number
          id?: string
          message: string
          scheduled_for?: string | null
          segment?: Json
          sent_count?: number
          started_at?: string | null
          status?: string
          total_count?: number
        }
        Update: {
          button_label?: string | null
          button_url?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          failed_count?: number
          id?: string
          message?: string
          scheduled_for?: string | null
          segment?: Json
          sent_count?: number
          started_at?: string | null
          status?: string
          total_count?: number
        }
        Relationships: []
      }
      tg_admin_message_templates: {
        Row: {
          body: string
          button_label: string | null
          button_url: string | null
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          body: string
          button_label?: string | null
          button_url?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          body?: string
          button_label?: string | null
          button_url?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      tg_admin_promo_codes: {
        Row: {
          active: boolean
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          type: string
          usage_limit: number | null
          used_count: number
          value: Json
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          type: string
          usage_limit?: number | null
          used_count?: number
          value?: Json
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          type?: string
          usage_limit?: number | null
          used_count?: number
          value?: Json
        }
        Relationships: []
      }
      tg_admin_promo_redemptions: {
        Row: {
          chat_id: number
          id: string
          promo_id: string
          redeemed_at: string
        }
        Insert: {
          chat_id: number
          id?: string
          promo_id: string
          redeemed_at?: string
        }
        Update: {
          chat_id?: number
          id?: string
          promo_id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tg_admin_promo_redemptions_promo_id_fkey"
            columns: ["promo_id"]
            isOneToOne: false
            referencedRelation: "tg_admin_promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      tg_admin_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      tg_miniapps: {
        Row: {
          app_name: string
          description: string | null
          enabled: boolean
          id: string
          registered_at: string
          route: string
          telegram_app_short_name: string
          updated_at: string
        }
        Insert: {
          app_name: string
          description?: string | null
          enabled?: boolean
          id?: string
          registered_at?: string
          route: string
          telegram_app_short_name: string
          updated_at?: string
        }
        Update: {
          app_name?: string
          description?: string | null
          enabled?: boolean
          id?: string
          registered_at?: string
          route?: string
          telegram_app_short_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          attachment_url: string | null
          created_at: string
          id: string
          message_text: string
          read_by_admin: boolean
          read_by_agent: boolean
          read_by_user: boolean
          sender_id: string | null
          sender_name: string | null
          sender_telegram_id: number | null
          sender_type: string
          ticket_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message_text: string
          read_by_admin?: boolean
          read_by_agent?: boolean
          read_by_user?: boolean
          sender_id?: string | null
          sender_name?: string | null
          sender_telegram_id?: number | null
          sender_type: string
          ticket_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message_text?: string
          read_by_admin?: boolean
          read_by_agent?: boolean
          read_by_user?: boolean
          sender_id?: string | null
          sender_name?: string | null
          sender_telegram_id?: number | null
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets_v2"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wallet_transactions: {
        Row: {
          amount_ghs: number
          created_at: string
          description: string | null
          id: string
          paystack_reference: string | null
          processing_fee: number | null
          provider: string | null
          reference: string | null
          status: string
          total_paid: number | null
          type: string
          user_id: string
          user_txn_id: string | null
        }
        Insert: {
          amount_ghs: number
          created_at?: string
          description?: string | null
          id?: string
          paystack_reference?: string | null
          processing_fee?: number | null
          provider?: string | null
          reference?: string | null
          status?: string
          total_paid?: number | null
          type: string
          user_id: string
          user_txn_id?: string | null
        }
        Update: {
          amount_ghs?: number
          created_at?: string
          description?: string | null
          id?: string
          paystack_reference?: string | null
          processing_fee?: number | null
          provider?: string | null
          reference?: string | null
          status?: string
          total_paid?: number | null
          type?: string
          user_id?: string
          user_txn_id?: string | null
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance_ghs: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance_ghs?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance_ghs?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_events: {
        Row: {
          error_message: string | null
          event_name: string | null
          id: string
          payload_raw: Json | null
          processed_at: string | null
          processing_status: string
          received_at: string
          signature_valid: boolean | null
          supplier_id: string | null
        }
        Insert: {
          error_message?: string | null
          event_name?: string | null
          id?: string
          payload_raw?: Json | null
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          signature_valid?: boolean | null
          supplier_id?: string | null
        }
        Update: {
          error_message?: string | null
          event_name?: string | null
          id?: string
          payload_raw?: Json | null
          processed_at?: string | null
          processing_status?: string
          received_at?: string
          signature_valid?: boolean | null
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_leaderboard_rewards: {
        Row: {
          created_at: string
          id: string
          meta: Json | null
          processed_at: string | null
          rank: number
          reward_mb: number
          status: string
          user_id: string
          week_key: string
        }
        Insert: {
          created_at?: string
          id?: string
          meta?: Json | null
          processed_at?: string | null
          rank: number
          reward_mb: number
          status?: string
          user_id: string
          week_key: string
        }
        Update: {
          created_at?: string
          id?: string
          meta?: Json | null
          processed_at?: string | null
          rank?: number
          reward_mb?: number
          status?: string
          user_id?: string
          week_key?: string
        }
        Relationships: []
      }
      wholesale_batch_items: {
        Row: {
          batch_id: string
          bundle: string
          id: string
          line_number: number
          network: string
          recipient: string
          validation_error: string | null
          validation_status: string
        }
        Insert: {
          batch_id: string
          bundle?: string
          id?: string
          line_number?: number
          network?: string
          recipient?: string
          validation_error?: string | null
          validation_status?: string
        }
        Update: {
          batch_id?: string
          bundle?: string
          id?: string
          line_number?: number
          network?: string
          recipient?: string
          validation_error?: string | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "wholesale_batch_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "wholesale_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      wholesale_batches: {
        Row: {
          agent_user_id: string
          created_at: string
          id: string
          invalid_count: number
          parsed_count: number
          raw_input_text: string
          status: string
          total_cost: number
          valid_count: number
        }
        Insert: {
          agent_user_id: string
          created_at?: string
          id?: string
          invalid_count?: number
          parsed_count?: number
          raw_input_text?: string
          status?: string
          total_cost?: number
          valid_count?: number
        }
        Update: {
          agent_user_id?: string
          created_at?: string
          id?: string
          invalid_count?: number
          parsed_count?: number
          raw_input_text?: string
          status?: string
          total_cost?: number
          valid_count?: number
        }
        Relationships: []
      }
      withdrawal_audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          details: Json | null
          id: string
          withdrawal_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          details?: Json | null
          id?: string
          withdrawal_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          details?: Json | null
          id?: string
          withdrawal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "withdrawal_audit_logs_withdrawal_id_fkey"
            columns: ["withdrawal_id"]
            isOneToOne: false
            referencedRelation: "agent_withdrawals"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      admin_orders_view: {
        Row: {
          admin_notes: string | null
          agent_base_price: number | null
          agent_id: string | null
          agent_profit: number | null
          agent_store_name: string | null
          agent_store_price: number | null
          amount_ghs: number | null
          bundle_size_gb: number | null
          cost_price_ghs: number | null
          created_at: string | null
          customer_name: string | null
          yiego_profit: number | null
          delivery_note: string | null
          failure_reason: string | null
          id: string | null
          is_agent_order: boolean | null
          markup_percent: number | null
          network: string | null
          order_id: string | null
          order_source: string | null
          order_type: string | null
          payment_method: string | null
          profit_credited: boolean | null
          profit_ghs: number | null
          queue_state: string | null
          recipient_number: string | null
          status: string | null
          supplier_amount: number | null
          supplier_cost_snapshot: number | null
          supplier_message: string | null
          supplier_order_id: string | null
          supplier_raw_response: string | null
          supplier_reference: string | null
          supplier_remaining_balance: number | null
          supplier_status: string | null
          supplier_timestamp: string | null
          updated_at: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      _fire_notify_event: { Args: { payload: Json }; Returns: undefined }
      admin_adjust_loyalty_points: {
        Args: { p_delta: number; p_reason: string; p_target_user_id: string }
        Returns: Json
      }
      admin_adjust_telegram_points: {
        Args: { p_delta: number; p_reason: string; p_target_user_id: string }
        Returns: Json
      }
      admin_agent_order_stats: {
        Args: never
        Returns: {
          agent_id: string
          last_order_at: string
          order_count: number
          total_profit: number
          total_revenue: number
        }[]
      }
      admin_bulk_orders_summary: { Args: never; Returns: Json }
      admin_bulk_void_orders: {
        Args: { p_items: Json; p_reason?: string }
        Returns: Json
      }
      admin_dashboard_period_totals: {
        Args: { p_end?: string; p_start?: string }
        Returns: {
          agent_delivered: number
          agent_failed: number
          agent_processing: number
          agent_profit: number
          agent_revenue: number
          agent_total: number
          agent_withdrawals_pending_amount: number
          agent_withdrawals_pending_count: number
          deposits_confirmed_amount: number
          deposits_confirmed_count: number
          deposits_pending_amount: number
          deposits_pending_count: number
          deposits_rejected_count: number
          new_users: number
          normal_at: number
          normal_delivered: number
          normal_failed: number
          normal_gb_delivered: number
          normal_mtn: number
          normal_pending: number
          normal_pending_payment: number
          normal_processing: number
          normal_profit: number
          normal_revenue: number
          normal_telecel: number
          normal_total: number
        }[]
      }
      admin_dashboard_totals: {
        Args: never
        Returns: {
          agent_paid_count: number
          agent_profit: number
          agent_revenue: number
          normal_paid_count: number
          normal_profit: number
          normal_revenue: number
        }[]
      }
      admin_orders_summary: {
        Args: never
        Returns: {
          delivered_count: number
          failed_count: number
          processing_count: number
          total_profit: number
          total_revenue: number
        }[]
      }
      admin_set_telegram_points_ban: {
        Args: { p_banned: boolean; p_reason?: string; p_target_user_id: string }
        Returns: Json
      }
      approve_manual_deposit: {
        Args: { p_admin_note?: string; p_txn_id: string }
        Returns: Json
      }
      check_security_access: {
        Args: {
          p_device_hash?: string
          p_email?: string
          p_ip?: string
          p_phone?: string
          p_user_id?: string
        }
        Returns: Json
      }
      check_username_available: {
        Args: { p_username: string }
        Returns: boolean
      }
      claim_telegram_referral: {
        Args: {
          p_qualifying_order_id: string
          p_referee_user_id: string
          p_referral_id: string
        }
        Returns: {
          id: string
          referee_chat_id: number
          referee_user_id: string
          referrer_chat_id: number
          referrer_user_id: string
        }[]
      }
      claim_telegram_referral_v2: {
        Args: {
          p_qualifying_order_id: string
          p_referee_telegram_user_id?: number
          p_referee_user_id?: string
          p_referral_id: string
        }
        Returns: {
          referee_telegram_user_id: number
          referee_user_id: string
          referrer_telegram_user_id: number
          referrer_user_id: string
        }[]
      }
      compute_loyalty_tier: {
        Args: { p_lifetime_spend: number }
        Returns: string
      }
      create_dispatch_batch_from_orders: {
        Args: { p_order_ids: string[] }
        Returns: Json
      }
      expire_telegram_inactive_points: {
        Args: { p_days?: number; p_max?: number }
        Returns: Json
      }
      finance_create_monthly_snapshot: {
        Args: { p_month: string }
        Returns: string
      }
      finance_cron_snapshot_previous_month: { Args: never; Returns: undefined }
      finance_mark_pending_as_paid: {
        Args: { p_actual_date?: string; p_entry_id: string }
        Returns: undefined
      }
      finance_recompute_monthly_snapshot: {
        Args: { p_month: string }
        Returns: string
      }
      finance_record_agent_payout: {
        Args: {
          p_agent_id?: string
          p_agent_name?: string
          p_amount: number
          p_bucket?: string
          p_entry_date?: string
          p_note?: string
          p_reference?: string
        }
        Returns: string
      }
      finance_transfer_buckets: {
        Args: {
          p_amount: number
          p_direction: string
          p_entry_date?: string
          p_note?: string
        }
        Returns: string
      }
      finance_undo_transfer: {
        Args: { p_transfer_group_id: string }
        Returns: number
      }
      gen_loyalty_referral_code: { Args: never; Returns: string }
      generate_bulk_dispatch_batches: {
        Args: { p_network: string }
        Returns: Json
      }
      generate_dsa_ticket_code: { Args: never; Returns: string }
      get_agent_effective_state: {
        Args: { p_agent_id: string }
        Returns: {
          can_store_accept_orders: boolean
          can_use_bulk_orders: boolean
          days_remaining: number
          effective_state: string
          expiry_date: string
          grace_end: string
          has_agent_pricing: boolean
          hours_remaining: number
          promo_end: string
        }[]
      }
      get_agent_store_pricing: {
        Args: { p_agent_id: string }
        Returns: {
          agent_id: string
          custom_price: number
          id: string
          markup_percent: number
          network: string
          product_id: string
        }[]
      }
      get_agent_store_subscription_expiry: {
        Args: { p_agent_id: string }
        Returns: {
          expiry_date: string
        }[]
      }
      get_banner_user_eligibility_summary: { Args: never; Returns: Json }
      get_campaign_banner_analytics: {
        Args: never
        Returns: {
          banner_id: string
          clicks: number
          clicks_7d: number
          clicks_today: number
          ctr: number
          dismissal_rate: number
          dismissals: number
          last_clicked_at: string
          last_viewed_at: string
          unique_views: number
          views: number
          views_7d: number
          views_today: number
        }[]
      }
      get_finance_bucket_balances: {
        Args: never
        Returns: {
          available: number
          master: number
          savings: number
        }[]
      }
      get_loyalty_tier_multiplier: { Args: { p_tier: string }; Returns: number }
      get_my_agent_id: { Args: never; Returns: string }
      get_public_agent_store: {
        Args: { p_slug: string }
        Returns: {
          id: string
          status: string
          store_description: string
          store_logo_url: string
          store_name: string
          store_slug: string
          whatsapp_number: string
        }[]
      }
      get_referral_usernames: {
        Args: { p_user_ids: string[] }
        Returns: {
          user_id: string
          username: string
        }[]
      }
      get_tg_setting: {
        Args: { p_fallback?: Json; p_key: string }
        Returns: Json
      }
      get_user_weekly_rank: {
        Args: { p_user_id: string; p_week_key: string }
        Returns: {
          qualified_count: number
          tenth_place_count: number
          user_rank: number
        }[]
      }
      get_weekly_leaderboard: {
        Args: { p_week_key: string }
        Returns: {
          qualified_count: number
          rank: number
          user_id: string
          username: string
        }[]
      }
      grant_telegram_points: {
        Args: {
          p_delta: number
          p_reason: string
          p_reference_id?: string
          p_user_id: string
        }
        Returns: Json
      }
      grant_telegram_points_v2: {
        Args: {
          p_delta: number
          p_reason: string
          p_reference_id?: string
          p_telegram_user_id: number
          p_user_id?: string
        }
        Returns: Json
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_agent: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_admin_or_staff: { Args: never; Returns: boolean }
      log_tg_admin_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip?: string
          p_target_id?: string
          p_target_type?: string
        }
        Returns: string
      }
      mark_batch_delivered: {
        Args: { p_batch_id: string; p_marked_by?: string }
        Returns: Json
      }
      mark_batch_sent: {
        Args: { p_batch_id: string; p_sent_by?: string }
        Returns: Json
      }
      mark_order_in_batch_failed: {
        Args: { p_item_id: string; p_reason: string }
        Returns: Json
      }
      mark_telegram_expiry_warning_sent: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      mark_telegram_referral_rewarded: {
        Args: { p_referral_id: string }
        Returns: boolean
      }
      normalize_phone_e164: { Args: { raw_phone: string }; Returns: string }
      redeem_loyalty_points: {
        Args: { p_bundle_amount?: number; p_points: number; p_type: string }
        Returns: Json
      }
      reject_manual_deposit: {
        Args: { p_reason?: string; p_txn_id: string }
        Returns: Json
      }
      request_agent_withdrawal: {
        Args: {
          p_amount: number
          p_created_from_flow?: string
          p_momo_network: string
          p_momo_number: string
          p_payout_momo_name?: string
          p_payout_network?: string
          p_payout_profile_id?: string
        }
        Returns: Json
      }
      reset_campaign_banner_frequency: {
        Args: { p_banner_id: string }
        Returns: undefined
      }
      resolve_failed_batch_order: {
        Args: {
          p_action: string
          p_actor?: string
          p_item_id: string
          p_notes?: string
        }
        Returns: Json
      }
      resolve_loyalty_referral_code: {
        Args: { p_code: string }
        Returns: {
          referrer_user_id: string
          valid: boolean
        }[]
      }
      resolve_referral_code: {
        Args: { p_code: string }
        Returns: {
          user_id: string
          username: string
        }[]
      }
      resolve_username_login: {
        Args: { p_username: string }
        Returns: {
          email: string
          is_suspended: boolean
          suspended_reason: string
        }[]
      }
      run_loyalty_birthday_bonus: { Args: never; Returns: Json }
      run_loyalty_points_expiry: { Args: never; Returns: Json }
      set_tg_admin_setting: {
        Args: { p_key: string; p_reason?: string; p_value: Json }
        Returns: Json
      }
      submit_manual_deposit_request: {
        Args: { p_amount: number; p_note?: string; p_user_txn_id: string }
        Returns: Json
      }
      sweep_stuck_paystack_withdrawals: { Args: never; Returns: Json }
      telegram_points_expiry_warnings: {
        Args: { p_days?: number; p_max?: number; p_warn_days?: number }
        Returns: {
          balance: number
          chat_id: number
          last_activity_at: string
          user_id: string
        }[]
      }
      telegram_points_overview: { Args: never; Returns: Json }
      telegram_points_top_earners: {
        Args: { p_limit?: number }
        Returns: {
          balance: number
          banned: boolean
          chat_id: number
          first_name: string
          last_activity_at: string
          lifetime_earned: number
          lifetime_redeemed: number
          phone: string
          user_id: string
          username: string
        }[]
      }
      telegram_points_weekly_leaderboard: {
        Args: { p_limit?: number }
        Returns: {
          chat_id: number
          first_name: string
          leader_user_id: string
          points_earned: number
          rank: number
          telegram_user_id: number
          username: string
        }[]
      }
      tg_admin_audit_list: {
        Args: {
          p_action?: string
          p_from?: string
          p_page?: number
          p_size?: number
          p_target_type?: string
          p_to?: string
        }
        Returns: Json
      }
      tg_admin_cancel_broadcast: {
        Args: { p_id: string; p_reason: string }
        Returns: Json
      }
      tg_admin_checkins_overview: { Args: { p_days?: number }; Returns: Json }
      tg_admin_checkins_summary: { Args: { p_days?: number }; Returns: Json }
      tg_admin_claim_broadcast: { Args: never; Returns: string }
      tg_admin_create_broadcast: {
        Args: {
          p_button_label?: string
          p_button_url?: string
          p_message: string
          p_scheduled_for?: string
          p_segment: Json
        }
        Returns: Json
      }
      tg_admin_dashboard_kpis: { Args: never; Returns: Json }
      tg_admin_delete_user: {
        Args: { p_chat_id: number; p_reason: string }
        Returns: Json
      }
      tg_admin_deposits_list: {
        Args: {
          p_from?: string
          p_page?: number
          p_search?: string
          p_size?: number
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      tg_admin_force_qualify_referral: {
        Args: { p_id: string; p_reason: string }
        Returns: Json
      }
      tg_admin_force_unlink: {
        Args: { p_chat_id: number; p_reason: string }
        Returns: Json
      }
      tg_admin_invalidate_referral: {
        Args: { p_id: string; p_reason: string }
        Returns: Json
      }
      tg_admin_orders_list: {
        Args: {
          p_from?: string
          p_network?: string
          p_page?: number
          p_search?: string
          p_size?: number
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      tg_admin_points_ledger: {
        Args: {
          p_chat_id?: number
          p_from?: string
          p_page?: number
          p_reason?: string
          p_size?: number
          p_to?: string
        }
        Returns: Json
      }
      tg_admin_points_overview: { Args: never; Returns: Json }
      tg_admin_recent_activity: {
        Args: { p_limit?: number }
        Returns: {
          chat_id: number
          kind: string
          occurred_at: string
          ref_id: string
          summary: string
        }[]
      }
      tg_admin_redemptions_list: {
        Args: {
          p_from?: string
          p_network?: string
          p_page?: number
          p_size?: number
          p_status?: string
          p_to?: string
        }
        Returns: Json
      }
      tg_admin_referrals_list: {
        Args: { p_page?: number; p_size?: number; p_status?: string }
        Returns: Json
      }
      tg_admin_referrals_overview: { Args: never; Returns: Json }
      tg_admin_report_daily_revenue: {
        Args: { p_days?: number }
        Returns: Json
      }
      tg_admin_report_network_split: {
        Args: { p_days?: number }
        Returns: Json
      }
      tg_admin_report_payment_mix: { Args: { p_days?: number }; Returns: Json }
      tg_admin_report_top_customers: {
        Args: { p_days?: number; p_limit?: number }
        Returns: Json
      }
      tg_admin_reset_points: {
        Args: { p_chat_id: number; p_reason: string }
        Returns: Json
      }
      tg_admin_reset_session: {
        Args: { p_chat_id: number; p_reason: string }
        Returns: Json
      }
      tg_admin_send_now_broadcast: { Args: { p_id: string }; Returns: Json }
      tg_admin_set_full_ban: {
        Args: { p_banned: boolean; p_chat_id: number; p_reason: string }
        Returns: Json
      }
      tg_admin_set_kill_switch: {
        Args: { p_enabled: boolean; p_reason?: string }
        Returns: Json
      }
      tg_admin_support_tickets_list: {
        Args: { p_page?: number; p_size?: number; p_status?: string }
        Returns: Json
      }
      tg_admin_user_detail: { Args: { p_chat_id: number }; Returns: Json }
      tg_admin_users_list: {
        Args: {
          p_active?: string
          p_linked?: string
          p_page?: number
          p_search?: string
          p_size?: number
        }
        Returns: Json
      }
      verify_notify_trigger_secret: {
        Args: { p_secret: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user" | "staff" | "agent"
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
      app_role: ["admin", "user", "staff", "agent"],
    },
  },
} as const
