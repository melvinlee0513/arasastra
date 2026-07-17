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
      admin_audit_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          is_pwa: boolean
          metadata: Json | null
          platform: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          is_pwa?: boolean
          metadata?: Json | null
          platform?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          is_pwa?: boolean
          metadata?: Json | null
          platform?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          class_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          file_url: string | null
          id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          file_url?: string | null
          id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          file_url?: string | null
          id?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assignments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          created_at: string | null
          date: string
          id: string
          status: string
          user_id: string
        }
        Insert: {
          class_id: string
          created_at?: string | null
          date?: string
          id?: string
          status?: string
          user_id: string
        }
        Update: {
          class_id?: string
          created_at?: string | null
          date?: string
          id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          record_id: string
          table_name: string
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id: string
          table_name: string
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      class_enrollments: {
        Row: {
          center_id: string
          class_id: string
          enrolled_at: string
          enrolled_by: string | null
          id: string
          status: string
          student_user_id: string
        }
        Insert: {
          center_id: string
          class_id: string
          enrolled_at?: string
          enrolled_by?: string | null
          id?: string
          status?: string
          student_user_id: string
        }
        Update: {
          center_id?: string
          class_id?: string
          enrolled_at?: string
          enrolled_by?: string | null
          id?: string
          status?: string
          student_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_resources: {
        Row: {
          center_id: string
          class_id: string
          created_at: string
          description: string | null
          display_order: number
          embed_url: string | null
          external_url: string | null
          file_path: string | null
          file_url: string | null
          id: string
          published_at: string | null
          resource_type: string
          source_type: string
          status: string
          subject_id: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          center_id: string
          class_id: string
          created_at?: string
          description?: string | null
          display_order?: number
          embed_url?: string | null
          external_url?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          published_at?: string | null
          resource_type?: string
          source_type?: string
          status?: string
          subject_id?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          center_id?: string
          class_id?: string
          created_at?: string
          description?: string | null
          display_order?: number
          embed_url?: string | null
          external_url?: string | null
          file_path?: string | null
          file_url?: string | null
          id?: string
          published_at?: string | null
          resource_type?: string
          source_type?: string
          status?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_resources_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      class_tutors: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          center_id: string
          class_id: string
          id: string
          tutor_user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          center_id: string
          class_id: string
          id?: string
          tutor_user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          center_id?: string
          class_id?: string
          id?: string
          tutor_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_tutors_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year: string | null
          center_id: string | null
          class_name: string | null
          class_tag: string | null
          cohort_label: string | null
          cohort_name: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_live: boolean | null
          is_published: boolean | null
          live_url: string | null
          schedule_label: string | null
          scheduled_at: string
          standard_id: string | null
          status: string
          subject_id: string | null
          title: string
          tutor_id: string | null
          video_url: string | null
          zoom_link: string | null
        }
        Insert: {
          academic_year?: string | null
          center_id?: string | null
          class_name?: string | null
          class_tag?: string | null
          cohort_label?: string | null
          cohort_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_live?: boolean | null
          is_published?: boolean | null
          live_url?: string | null
          schedule_label?: string | null
          scheduled_at: string
          standard_id?: string | null
          status?: string
          subject_id?: string | null
          title: string
          tutor_id?: string | null
          video_url?: string | null
          zoom_link?: string | null
        }
        Update: {
          academic_year?: string | null
          center_id?: string | null
          class_name?: string | null
          class_tag?: string | null
          cohort_label?: string | null
          cohort_name?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_live?: boolean | null
          is_published?: boolean | null
          live_url?: string | null
          schedule_label?: string | null
          scheduled_at?: string
          standard_id?: string | null
          status?: string
          subject_id?: string | null
          title?: string
          tutor_id?: string | null
          video_url?: string | null
          zoom_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classes_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
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
      content_versions: {
        Row: {
          created_at: string
          draft_data: Json
          draft_subtitle: string | null
          draft_title: string | null
          id: string
          published_data: Json
          section_id: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          draft_data?: Json
          draft_subtitle?: string | null
          draft_title?: string | null
          id?: string
          published_data?: Json
          section_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          draft_data?: Json
          draft_subtitle?: string | null
          draft_title?: string | null
          id?: string
          published_data?: Json
          section_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_versions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "content_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          class_id: string | null
          enrolled_at: string | null
          id: string
          is_active: boolean | null
          student_id: string
          subject_id: string | null
        }
        Insert: {
          class_id?: string | null
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          student_id: string
          subject_id?: string | null
        }
        Update: {
          class_id?: string | null
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          student_id?: string
          subject_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
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
      flashcard_decks: {
        Row: {
          access_level: Database["public"]["Enums"]["material_access_level"]
          center_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          subject_id: string | null
          title: string
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["material_access_level"]
          center_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          subject_id?: string | null
          title: string
        }
        Update: {
          access_level?: Database["public"]["Enums"]["material_access_level"]
          center_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          subject_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_flashcards_center"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flashcard_decks_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcard_progress: {
        Row: {
          flashcard_id: string
          id: string
          reviewed_at: string
          status: string
          user_id: string
        }
        Insert: {
          flashcard_id: string
          id?: string
          reviewed_at?: string
          status?: string
          user_id: string
        }
        Update: {
          flashcard_id?: string
          id?: string
          reviewed_at?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flashcard_progress_flashcard_id_fkey"
            columns: ["flashcard_id"]
            isOneToOne: false
            referencedRelation: "flashcards"
            referencedColumns: ["id"]
          },
        ]
      }
      flashcards: {
        Row: {
          back_text: string
          created_at: string
          deck_id: string
          front_text: string
          id: string
          sort_order: number | null
        }
        Insert: {
          back_text: string
          created_at?: string
          deck_id: string
          front_text: string
          id?: string
          sort_order?: number | null
        }
        Update: {
          back_text?: string
          created_at?: string
          deck_id?: string
          front_text?: string
          id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "flashcards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "flashcard_decks"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          center_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: string
          status: string
          used_at: string | null
        }
        Insert: {
          center_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: string
          status?: string
          used_at?: string | null
        }
        Update: {
          center_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: string
          status?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          access_level: Database["public"]["Enums"]["material_access_level"]
          center_id: string
          class_id: string | null
          created_at: string | null
          description: string | null
          file_name: string
          file_size: number | null
          file_type: string | null
          file_url: string
          id: string
          standard_id: string | null
          subject_id: string | null
          title: string
          updated_at: string | null
          uploaded_by: string | null
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["material_access_level"]
          center_id: string
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          file_name: string
          file_size?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          standard_id?: string | null
          subject_id?: string | null
          title: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Update: {
          access_level?: Database["public"]["Enums"]["material_access_level"]
          center_id?: string
          class_id?: string | null
          created_at?: string | null
          description?: string | null
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          standard_id?: string | null
          subject_id?: string | null
          title?: string
          updated_at?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_notes_center"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
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
      parent_student_links: {
        Row: {
          created_at: string
          id: string
          parent_user_id: string
          student_profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_user_id: string
          student_profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_user_id?: string
          student_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_student_links_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
          admin_remarks: string | null
          assigned_tutor_id: string | null
          avatar_url: string | null
          center_id: string
          created_at: string | null
          email: string | null
          form_year: string | null
          full_name: string
          id: string
          is_registered: boolean
          last_contacted_at: string | null
          lead_status: string
          parent_name: string | null
          phone: string | null
          plan_id: string | null
          updated_at: string | null
          user_id: string
          xp_points: number
        }
        Insert: {
          admin_remarks?: string | null
          assigned_tutor_id?: string | null
          avatar_url?: string | null
          center_id: string
          created_at?: string | null
          email?: string | null
          form_year?: string | null
          full_name: string
          id?: string
          is_registered?: boolean
          last_contacted_at?: string | null
          lead_status?: string
          parent_name?: string | null
          phone?: string | null
          plan_id?: string | null
          updated_at?: string | null
          user_id: string
          xp_points?: number
        }
        Update: {
          admin_remarks?: string | null
          assigned_tutor_id?: string | null
          avatar_url?: string | null
          center_id?: string
          created_at?: string | null
          email?: string | null
          form_year?: string | null
          full_name?: string
          id?: string
          is_registered?: boolean
          last_contacted_at?: string | null
          lead_status?: string
          parent_name?: string | null
          phone?: string | null
          plan_id?: string | null
          updated_at?: string | null
          user_id?: string
          xp_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_center"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_assigned_tutor_id_fkey"
            columns: ["assigned_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
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
      quiz_attempts: {
        Row: {
          created_at: string
          current_question_index: number
          id: string
          power_ups_used: Json
          quiz_id: string
          saved_answers: Json
          score: number
          status: string
          streak: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_question_index?: number
          id?: string
          power_ups_used?: Json
          quiz_id: string
          saved_answers?: Json
          score?: number
          status?: string
          streak?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_question_index?: number
          id?: string
          power_ups_used?: Json
          quiz_id?: string
          saved_answers?: Json
          score?: number
          status?: string
          streak?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_options: {
        Row: {
          center_id: string
          created_at: string
          id: string
          is_correct: boolean
          option_text: string
          order_index: number
          question_id: string
        }
        Insert: {
          center_id: string
          created_at?: string
          id?: string
          is_correct?: boolean
          option_text: string
          order_index?: number
          question_id: string
        }
        Update: {
          center_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean
          option_text?: string
          order_index?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          center_id: string | null
          correct_answer: string
          id: string
          options: Json
          order_index: number | null
          points: number
          question: string
          question_type: string
          quiz_id: string
          sort_order: number | null
        }
        Insert: {
          center_id?: string | null
          correct_answer: string
          id?: string
          options?: Json
          order_index?: number | null
          points?: number
          question: string
          question_type?: string
          quiz_id: string
          sort_order?: number | null
        }
        Update: {
          center_id?: string | null
          correct_answer?: string
          id?: string
          options?: Json
          order_index?: number | null
          points?: number
          question?: string
          question_type?: string
          quiz_id?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_results: {
        Row: {
          center_id: string | null
          class_id: string | null
          completed_at: string | null
          id: string
          percentage: number | null
          quiz_id: string
          score: number
          total_points: number | null
          total_questions: number
          user_id: string
        }
        Insert: {
          center_id?: string | null
          class_id?: string | null
          completed_at?: string | null
          id?: string
          percentage?: number | null
          quiz_id: string
          score?: number
          total_points?: number | null
          total_questions?: number
          user_id: string
        }
        Update: {
          center_id?: string | null
          class_id?: string | null
          completed_at?: string | null
          id?: string
          percentage?: number | null
          quiz_id?: string
          score?: number
          total_points?: number | null
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_results_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          access_level: Database["public"]["Enums"]["material_access_level"]
          center_id: string
          class_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          published_at: string | null
          sound_theme: string
          status: string
          subject_id: string | null
          title: string
          total_points: number
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["material_access_level"]
          center_id: string
          class_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          sound_theme?: string
          status?: string
          subject_id?: string | null
          title: string
          total_points?: number
        }
        Update: {
          access_level?: Database["public"]["Enums"]["material_access_level"]
          center_id?: string
          class_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          published_at?: string | null
          sound_theme?: string
          status?: string
          subject_id?: string | null
          title?: string
          total_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_quizzes_center"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      standards: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      student_quiz_answers: {
        Row: {
          center_id: string
          created_at: string
          id: string
          is_correct: boolean
          points_awarded: number
          question_id: string
          result_id: string
          selected_answer: string | null
          selected_option_id: string | null
        }
        Insert: {
          center_id: string
          created_at?: string
          id?: string
          is_correct?: boolean
          points_awarded?: number
          question_id: string
          result_id: string
          selected_answer?: string | null
          selected_option_id?: string | null
        }
        Update: {
          center_id?: string
          created_at?: string
          id?: string
          is_correct?: boolean
          points_awarded?: number
          question_id?: string
          result_id?: string
          selected_answer?: string | null
          selected_option_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_quiz_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_quiz_answers_result_id_fkey"
            columns: ["result_id"]
            isOneToOne: false
            referencedRelation: "quiz_results"
            referencedColumns: ["id"]
          },
        ]
      }
      student_streaks: {
        Row: {
          center_id: string
          created_at: string
          current_streak: number
          id: string
          last_activity_date: string | null
          longest_streak: number
          student_user_id: string
          updated_at: string
        }
        Insert: {
          center_id: string
          created_at?: string
          current_streak?: number
          id?: string
          last_activity_date?: string | null
          longest_streak?: number
          student_user_id: string
          updated_at?: string
        }
        Update: {
          center_id?: string
          created_at?: string
          current_streak?: number
          id?: string
          last_activity_date?: string | null
          longest_streak?: number
          student_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      student_xp_events: {
        Row: {
          center_id: string
          created_at: string
          event_type: string
          id: string
          source_id: string | null
          source_type: string | null
          student_user_id: string
          xp_amount: number
        }
        Insert: {
          center_id: string
          created_at?: string
          event_type: string
          id?: string
          source_id?: string | null
          source_type?: string | null
          student_user_id: string
          xp_amount?: number
        }
        Update: {
          center_id?: string
          created_at?: string
          event_type?: string
          id?: string
          source_id?: string | null
          source_type?: string | null
          student_user_id?: string
          xp_amount?: number
        }
        Relationships: []
      }
      subjects: {
        Row: {
          archived_at: string | null
          center_id: string | null
          color: string | null
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          status: string
        }
        Insert: {
          archived_at?: string | null
          center_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          status?: string
        }
        Update: {
          archived_at?: string | null
          center_id?: string | null
          color?: string | null
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      submissions: {
        Row: {
          assignment_id: string
          feedback: string | null
          file_url: string
          grade: string | null
          graded_at: string | null
          id: string
          submitted_at: string | null
          user_id: string
        }
        Insert: {
          assignment_id: string
          feedback?: string | null
          file_url: string
          grade?: string | null
          graded_at?: string | null
          id?: string
          submitted_at?: string | null
          user_id: string
        }
        Update: {
          assignment_id?: string
          feedback?: string | null
          file_url?: string
          grade?: string | null
          graded_at?: string | null
          id?: string
          submitted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["id"]
          },
        ]
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
      tuition_centers: {
        Row: {
          created_at: string
          created_by: string | null
          domain_status: string
          domain_verified_at: string | null
          feature_flags: Json
          id: string
          logo_url: string | null
          name: string
          subdomain_slug: string | null
          theme_config: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain_status?: string
          domain_verified_at?: string | null
          feature_flags?: Json
          id?: string
          logo_url?: string | null
          name: string
          subdomain_slug?: string | null
          theme_config?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain_status?: string
          domain_verified_at?: string | null
          feature_flags?: Json
          id?: string
          logo_url?: string | null
          name?: string
          subdomain_slug?: string | null
          theme_config?: Json
        }
        Relationships: []
      }
      tutor_assignments: {
        Row: {
          created_at: string
          id: string
          standard_id: string | null
          subject_id: string
          tutor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          standard_id?: string | null
          subject_id: string
          tutor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          standard_id?: string | null
          subject_id?: string
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_assignments_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tutor_assignments_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_connected_accounts: {
        Row: {
          account_email: string | null
          center_id: string
          connected_at: string
          disconnected_at: string | null
          id: string
          provider: string
          tutor_user_id: string
        }
        Insert: {
          account_email?: string | null
          center_id: string
          connected_at?: string
          disconnected_at?: string | null
          id?: string
          provider: string
          tutor_user_id: string
        }
        Update: {
          account_email?: string | null
          center_id?: string
          connected_at?: string
          disconnected_at?: string | null
          id?: string
          provider?: string
          tutor_user_id?: string
        }
        Relationships: []
      }
      tutors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          center_id: string | null
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
          center_id?: string | null
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
          center_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "tutors_center_id_fkey"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
        ]
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
      video_comments: {
        Row: {
          class_id: string
          comment_text: string
          created_at: string
          id: string
          timestamp_seconds: number
          user_id: string
        }
        Insert: {
          class_id: string
          comment_text: string
          created_at?: string
          id?: string
          timestamp_seconds?: number
          user_id: string
        }
        Update: {
          class_id?: string
          comment_text?: string
          created_at?: string
          id?: string
          timestamp_seconds?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_comments_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      video_resources: {
        Row: {
          access_level: Database["public"]["Enums"]["material_access_level"]
          center_id: string
          class_id: string | null
          course_module: string | null
          created_at: string
          created_by: string
          description: string | null
          duration_seconds: number | null
          file_size: number | null
          id: string
          is_published: boolean
          source_type: Database["public"]["Enums"]["video_source_type"]
          standard_id: string | null
          subject_id: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          video_url: string
          youtube_id: string | null
        }
        Insert: {
          access_level?: Database["public"]["Enums"]["material_access_level"]
          center_id: string
          class_id?: string | null
          course_module?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          id?: string
          is_published?: boolean
          source_type: Database["public"]["Enums"]["video_source_type"]
          standard_id?: string | null
          subject_id?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          video_url: string
          youtube_id?: string | null
        }
        Update: {
          access_level?: Database["public"]["Enums"]["material_access_level"]
          center_id?: string
          class_id?: string | null
          course_module?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          duration_seconds?: number | null
          file_size?: number | null
          id?: string
          is_published?: boolean
          source_type?: Database["public"]["Enums"]["video_source_type"]
          standard_id?: string | null
          subject_id?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          video_url?: string
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_videos_center"
            columns: ["center_id"]
            isOneToOne: false
            referencedRelation: "tuition_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_resources_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_resources_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_resources_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_tutor_role: { Args: { _target_user: string }; Returns: Json }
      get_invitation_by_token: {
        Args: { _token: string }
        Returns: {
          center_id: string
          email: string
          id: string
          role: string
          status: string
        }[]
      }
      get_invite_redirect: {
        Args: { _token: string }
        Returns: {
          subdomain_slug: string
        }[]
      }
      get_profile_id: { Args: never; Returns: string }
      get_signin_redirect_for_email: {
        Args: { _email: string }
        Returns: {
          destination: string
          subdomain_slug: string
        }[]
      }
      get_user_center: { Args: { _user_id?: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_enrolled_in_class: { Args: { _class_id: string }; Returns: boolean }
      is_enrolled_in_subject: {
        Args: { _subject_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: never; Returns: boolean }
      is_tutor_of_class: { Args: { _class_id: string }; Returns: boolean }
      list_assignable_tutors: {
        Args: { requested_center_id: string }
        Returns: {
          avatar_url: string
          email: string
          full_name: string
          user_id: string
        }[]
      }
      record_learning_activity: {
        Args: {
          _event_type: string
          _source_id?: string
          _source_type?: string
          _xp_amount: number
        }
        Returns: Json
      }
      reorder_class_resources: {
        Args: { ordered_resource_ids: string[]; requested_class_id: string }
        Returns: {
          new_display_order: number
          resource_id: string
        }[]
      }
      replace_tenant_member_role: {
        Args: { requested_role: string; target_user_id: string }
        Returns: Json
      }
      resolve_tenant_by_subdomain: {
        Args: { _slug: string }
        Returns: {
          domain_status: string
          feature_flags: Json
          id: string
          logo_url: string
          name: string
          subdomain_slug: string
          theme_config: Json
        }[]
      }
      revoke_invitation: { Args: { _invitation_id: string }; Returns: boolean }
      revoke_tutor_role: { Args: { _target_user: string }; Returns: Json }
      same_center_as_current_user: {
        Args: { _center_id: string }
        Returns: boolean
      }
      tutor_can_teach: {
        Args: { _standard_id: string; _subject_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "student" | "tutor" | "superadmin"
      material_access_level: "exclusive" | "demo"
      video_source_type: "upload" | "youtube" | "zoom"
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
      app_role: ["admin", "student", "tutor", "superadmin"],
      material_access_level: ["exclusive", "demo"],
      video_source_type: ["upload", "youtube", "zoom"],
    },
  },
} as const
