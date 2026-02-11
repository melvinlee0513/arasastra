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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      classes: {
        Row: {
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_live: boolean | null
          is_published: boolean | null
          live_url: string | null
          scheduled_at: string
          subject_id: string | null
          title: string
          tutor_id: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_live?: boolean | null
          is_published?: boolean | null
          live_url?: string | null
          scheduled_at: string
          subject_id?: string | null
          title: string
          tutor_id?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_live?: boolean | null
          is_published?: boolean | null
          live_url?: string | null
          scheduled_at?: string
          subject_id?: string | null
          title?: string
          tutor_id?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      content_sections: {
        Row: {
          content: Json | null
          display_order: number | null
          id: string
          is_visible: boolean | null
          section_key: string
          subtitle: string | null
          title: string | null
          updated_at: string | null
        }
        Insert: {
          content?: Json | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          section_key: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          content?: Json | null
          display_order?: number | null
          id?: string
          is_visible?: boolean | null
          section_key?: string
          subtitle?: string | null
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          enrolled_at: string | null
          id: string
          is_active: boolean | null
          student_id: string
          subject_id: string
        }
        Insert: {
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          student_id: string
          subject_id: string
        }
        Update: {
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          student_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          created_at: string | null
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          subject_id: string | null
          title: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          subject_id?: string | null
          title: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          subject_id?: string | null
          title?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_submissions: {
        Row: {
          amount: number
          created_at: string
          id: string
          receipt_url: string
          rejection_reason: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          receipt_url: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          receipt_url?: string
          rejection_reason?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_plans: {
        Row: {
          button_text: string
          created_at: string
          features: Json
          id: string
          interval: string
          is_active: boolean
          is_popular: boolean
          name: string
          price: string
          sort_order: number
          subtitle: string | null
          updated_at: string
        }
        Insert: {
          button_text?: string
          created_at?: string
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          price: string
          sort_order?: number
          subtitle?: string | null
          updated_at?: string
        }
        Update: {
          button_text?: string
          created_at?: string
          features?: Json
          id?: string
          interval?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          price?: string
          sort_order?: number
          subtitle?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          form_year: string | null
          full_name: string
          id: string
          is_registered: boolean
          parent_name: string | null
          phone: string | null
          plan_id: string | null
          updated_at: string | null
          user_id: string
          xp_points: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          form_year?: string | null
          full_name: string
          id?: string
          is_registered?: boolean
          parent_name?: string | null
          phone?: string | null
          plan_id?: string | null
          updated_at?: string | null
          user_id: string
          xp_points?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          form_year?: string | null
          full_name?: string
          id?: string
          is_registered?: boolean
          parent_name?: string | null
          phone?: string | null
          plan_id?: string | null
          updated_at?: string | null
          user_id?: string
          xp_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "pricing_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      progress: {
        Row: {
          class_id: string
          completed: boolean | null
          id: string
          last_watched_at: string | null
          student_id: string
          watched_seconds: number | null
        }
        Insert: {
          class_id: string
          completed?: boolean | null
          id?: string
          last_watched_at?: string | null
          student_id: string
          watched_seconds?: number | null
        }
        Update: {
          class_id?: string
          completed?: boolean | null
          id?: string
          last_watched_at?: string | null
          student_id?: string
          watched_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "progress_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          plan_name: string
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          plan_name?: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          plan_name?: string
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tutors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          rating: number | null
          specialization: string | null
          student_count: number | null
          user_id: string | null
          years_experience: number | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          rating?: number | null
          specialization?: string | null
          student_count?: number | null
          user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          rating?: number | null
          specialization?: string | null
          student_count?: number | null
          user_id?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
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
      get_profile_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "student"
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
      app_role: ["admin", "student"],
    },
  },
} as const
