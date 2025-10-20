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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      insight_feedback: {
        Row: {
          action_taken: string | null
          context_after: string | null
          context_before: string | null
          created_at: string
          feedback_text: string | null
          followed_advice: boolean | null
          id: string
          insight_id: string | null
          outcome_30s: number | null
          outcome_60s: number | null
          rating: number
          streamer_id: string
          subsequent_delta: number | null
          time_to_feedback_ms: number | null
        }
        Insert: {
          action_taken?: string | null
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          feedback_text?: string | null
          followed_advice?: boolean | null
          id?: string
          insight_id?: string | null
          outcome_30s?: number | null
          outcome_60s?: number | null
          rating: number
          streamer_id: string
          subsequent_delta?: number | null
          time_to_feedback_ms?: number | null
        }
        Update: {
          action_taken?: string | null
          context_after?: string | null
          context_before?: string | null
          created_at?: string
          feedback_text?: string | null
          followed_advice?: boolean | null
          id?: string
          insight_id?: string | null
          outcome_30s?: number | null
          outcome_60s?: number | null
          rating?: number
          streamer_id?: string
          subsequent_delta?: number | null
          time_to_feedback_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "insight_feedback_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insight_history"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_history: {
        Row: {
          ai_latency_ms: number | null
          ai_source: string | null
          correlation_quality: string | null
          created_at: string
          emotion: string | null
          emotion_confidence: number | null
          emotion_score: number | null
          emotional_label: string | null
          id: string
          next_move: string | null
          platform: string | null
          prev_count: number
          session_id: string
          streamer_id: string
          topic: string | null
          transcript: string
          transcript_hash: string | null
          variant_id: string | null
          viewer_count: number
          viewer_delta: number
        }
        Insert: {
          ai_latency_ms?: number | null
          ai_source?: string | null
          correlation_quality?: string | null
          created_at?: string
          emotion?: string | null
          emotion_confidence?: number | null
          emotion_score?: number | null
          emotional_label?: string | null
          id?: string
          next_move?: string | null
          platform?: string | null
          prev_count: number
          session_id: string
          streamer_id: string
          topic?: string | null
          transcript: string
          transcript_hash?: string | null
          variant_id?: string | null
          viewer_count: number
          viewer_delta: number
        }
        Update: {
          ai_latency_ms?: number | null
          ai_source?: string | null
          correlation_quality?: string | null
          created_at?: string
          emotion?: string | null
          emotion_confidence?: number | null
          emotion_score?: number | null
          emotional_label?: string | null
          id?: string
          next_move?: string | null
          platform?: string | null
          prev_count?: number
          session_id?: string
          streamer_id?: string
          topic?: string | null
          transcript?: string
          transcript_hash?: string | null
          variant_id?: string | null
          viewer_count?: number
          viewer_delta?: number
        }
        Relationships: []
      }
      insight_variants: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          negative_feedback: number | null
          positive_feedback: number | null
          selection_weight: number | null
          success_rate: number | null
          system_prompt: string
          total_uses: number | null
          variant_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          negative_feedback?: number | null
          positive_feedback?: number | null
          selection_weight?: number | null
          success_rate?: number | null
          system_prompt: string
          total_uses?: number | null
          variant_name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          negative_feedback?: number | null
          positive_feedback?: number | null
          selection_weight?: number | null
          success_rate?: number | null
          system_prompt?: string
          total_uses?: number | null
          variant_name?: string
        }
        Relationships: []
      }
      live_transcripts: {
        Row: {
          confidence: number | null
          created_at: string
          id: string
          session_id: string
          timestamp: string
          transcript: string
          viewer_count: number | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          id?: string
          session_id: string
          timestamp?: string
          transcript: string
          viewer_count?: number | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          id?: string
          session_id?: string
          timestamp?: string
          transcript?: string
          viewer_count?: number | null
        }
        Relationships: []
      }
      streamer_patterns: {
        Row: {
          avg_viewer_impact: number
          confidence_score: number
          emotion: string | null
          id: string
          is_anti_pattern: boolean | null
          last_seen_at: string | null
          sample_count: number
          streamer_id: string
          success_rate: number
          topic: string
          updated_at: string
        }
        Insert: {
          avg_viewer_impact: number
          confidence_score: number
          emotion?: string | null
          id?: string
          is_anti_pattern?: boolean | null
          last_seen_at?: string | null
          sample_count: number
          streamer_id: string
          success_rate: number
          topic: string
          updated_at?: string
        }
        Update: {
          avg_viewer_impact?: number
          confidence_score?: number
          emotion?: string | null
          id?: string
          is_anti_pattern?: boolean | null
          last_seen_at?: string | null
          sample_count?: number
          streamer_id?: string
          success_rate?: number
          topic?: string
          updated_at?: string
        }
        Relationships: []
      }
      transcript_viewer_events: {
        Row: {
          created_at: string
          emotions: Json | null
          energy_level: number | null
          id: string
          session_id: string
          timestamp: string
          tone_label: string | null
          transcript_segment: string
          viewer_count: number
          viewer_trend: string
        }
        Insert: {
          created_at?: string
          emotions?: Json | null
          energy_level?: number | null
          id?: string
          session_id: string
          timestamp?: string
          tone_label?: string | null
          transcript_segment: string
          viewer_count: number
          viewer_trend: string
        }
        Update: {
          created_at?: string
          emotions?: Json | null
          energy_level?: number | null
          id?: string
          session_id?: string
          timestamp?: string
          tone_label?: string | null
          transcript_segment?: string
          viewer_count?: number
          viewer_trend?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      aggregate_streamer_patterns: {
        Args: Record<PropertyKey, never>
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
    Enums: {},
  },
} as const
