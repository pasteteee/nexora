// Generated from Supabase project gattldfwkbvkxodshzwb. Do not edit by hand.
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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_requests: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          provider: string | null
          request_id: string
          request_type: string
          status: string
          updated_at: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          provider?: string | null
          request_id?: string
          request_type: string
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          provider?: string | null
          request_id?: string
          request_type?: string
          status?: string
          updated_at?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_snapshots: {
        Row: {
          canvas_id: string
          created_at: string
          created_by: string | null
          data_json: Json
          id: string
          workspace_id: string
        }
        Insert: {
          canvas_id: string
          created_at?: string
          created_by?: string | null
          data_json: Json
          id?: string
          workspace_id: string
        }
        Update: {
          canvas_id?: string
          created_at?: string
          created_by?: string | null
          data_json?: Json
          id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_snapshots_canvas_id_workspace_id_fkey"
            columns: ["canvas_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "canvas_snapshots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      canvases: {
        Row: {
          background_spacing: number
          background_type: string
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          background_spacing?: number
          background_type?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          background_spacing?: number
          background_type?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      elements: {
        Row: {
          canvas_id: string
          content_json: Json
          created_at: string
          created_by: string | null
          group_id: string | null
          height: number
          id: string
          rotation: number
          source_id: string | null
          style_json: Json
          type: string
          updated_at: string
          width: number
          workspace_id: string
          x: number
          y: number
          z_index: number
        }
        Insert: {
          canvas_id: string
          content_json?: Json
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          height?: number
          id?: string
          rotation?: number
          source_id?: string | null
          style_json?: Json
          type: string
          updated_at?: string
          width?: number
          workspace_id: string
          x?: number
          y?: number
          z_index?: number
        }
        Update: {
          canvas_id?: string
          content_json?: Json
          created_at?: string
          created_by?: string | null
          group_id?: string | null
          height?: number
          id?: string
          rotation?: number
          source_id?: string | null
          style_json?: Json
          type?: string
          updated_at?: string
          width?: number
          workspace_id?: string
          x?: number
          y?: number
          z_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "elements_canvas_id_workspace_id_fkey"
            columns: ["canvas_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id", "workspace_id"]
          },
          {
            foreignKeyName: "elements_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "elements_group_id_canvas_id_fkey"
            columns: ["group_id", "canvas_id"]
            isOneToOne: false
            referencedRelation: "elements"
            referencedColumns: ["id", "canvas_id"]
          },
          {
            foreignKeyName: "elements_source_id_workspace_id_fkey"
            columns: ["source_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          preferences_json: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id: string
          preferences_json?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          preferences_json?: Json
          updated_at?: string
        }
        Relationships: []
      }
      publications: {
        Row: {
          canvas_id: string
          id: string
          is_active: boolean
          published_at: string
          slug: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          canvas_id: string
          id?: string
          is_active?: boolean
          published_at?: string
          slug?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          canvas_id?: string
          id?: string
          is_active?: boolean
          published_at?: string
          slug?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "publications_canvas_id_workspace_id_fkey"
            columns: ["canvas_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "canvases"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      source_chunks: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata_json: Json
          page_ref: string | null
          position: number
          source_id: string
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata_json?: Json
          page_ref?: string | null
          position: number
          source_id: string
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata_json?: Json
          page_ref?: string | null
          position?: number
          source_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_chunks_source_id_workspace_id_fkey"
            columns: ["source_id", "workspace_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id", "workspace_id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          created_by: string | null
          error_message: string | null
          file_path: string
          id: string
          metadata_json: Json
          mime_type: string
          original_name: string
          size: number
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_path: string
          id?: string
          metadata_json?: Json
          mime_type: string
          original_name: string
          size: number
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          error_message?: string | null
          file_path?: string
          id?: string
          metadata_json?: Json
          mime_type?: string
          original_name?: string
          size?: number
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: string
          token_hash: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role: string
          token_hash: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: string
          token_hash?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name: string
          owner_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { p_token: string }
        Returns: string
      }
      create_workspace_invitation: {
        Args: { p_email: string; p_role: string; p_workspace_id: string }
        Returns: {
          expires_at: string
          invitation_id: string
          token: string
        }[]
      }
      get_published_canvas: { Args: { p_slug: string }; Returns: Json }
      match_source_chunks: {
        Args: { p_embedding: string; p_limit?: number; p_workspace_id: string }
        Returns: {
          content: string
          id: string
          page_ref: string
          position: number
          similarity: number
          source_id: string
        }[]
      }
      restore_workspace: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      revoke_workspace_invitation: {
        Args: { p_invitation_id: string }
        Returns: undefined
      }
      soft_delete_workspace: {
        Args: { p_workspace_id: string }
        Returns: undefined
      }
      transfer_workspace_ownership: {
        Args: { p_new_owner_id: string; p_workspace_id: string }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
