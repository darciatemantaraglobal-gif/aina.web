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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_tracker_items: {
        Row: {
          category: string
          checklist_steps: Json | null
          created_at: string
          due_date: string | null
          id: string
          is_urgent: boolean
          notes: string | null
          reminder_enabled: boolean
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          checklist_steps?: Json | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_urgent?: boolean
          notes?: string | null
          reminder_enabled?: boolean
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          checklist_steps?: Json | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_urgent?: boolean
          notes?: string | null
          reminder_enabled?: boolean
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      answer_feedback: {
        Row: {
          confidence: string | null
          created_at: string
          feedback_type: string
          id: string
          intent: string | null
          message_id: string
          note: string | null
          sources: Json | null
          user_id: string
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          feedback_type: string
          id?: string
          intent?: string | null
          message_id: string
          note?: string | null
          sources?: Json | null
          user_id: string
        }
        Update: {
          confidence?: string | null
          created_at?: string
          feedback_type?: string
          id?: string
          intent?: string | null
          message_id?: string
          note?: string | null
          sources?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      app_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      app_users: {
        Row: {
          created_at: string | null
          password_hash: string
          username: string
        }
        Insert: {
          created_at?: string | null
          password_hash: string
          username: string
        }
        Update: {
          created_at?: string | null
          password_hash?: string
          username?: string
        }
        Relationships: []
      }
      article_votes: {
        Row: {
          article_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      beta_feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      chat_usage: {
        Row: {
          created_at: string
          id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          user_id?: string
        }
        Relationships: []
      }
      chats: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contributor_requests: {
        Row: {
          article_content: string | null
          article_file_url: string | null
          article_image_url: string | null
          created_at: string
          education: string
          enrollment_year: number
          expertise: string
          full_name: string
          id: string
          portfolio_link: string | null
          reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          article_content?: string | null
          article_file_url?: string | null
          article_image_url?: string | null
          created_at?: string
          education: string
          enrollment_year: number
          expertise: string
          full_name: string
          id?: string
          portfolio_link?: string | null
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          article_content?: string | null
          article_file_url?: string | null
          article_image_url?: string | null
          created_at?: string
          education?: string
          enrollment_year?: number
          expertise?: string
          full_name?: string
          id?: string
          portfolio_link?: string | null
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      cron_logs: {
        Row: {
          articles_scraped: number
          error_message: string | null
          id: string
          ran_at: string
          status: string
        }
        Insert: {
          articles_scraped?: number
          error_message?: string | null
          id?: string
          ran_at?: string
          status: string
        }
        Update: {
          articles_scraped?: number
          error_message?: string | null
          id?: string
          ran_at?: string
          status?: string
        }
        Relationships: []
      }
      cron_settings: {
        Row: {
          enabled: boolean
          id: number
          run_at: string
          target_urls: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          run_at?: string
          target_urls?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          run_at?: string
          target_urls?: string
        }
        Relationships: []
      }
      daily_focus_items: {
        Row: {
          created_at: string
          description: string | null
          focus_date: string
          id: string
          original_input: string | null
          priority: number | null
          source_type: string
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          focus_date: string
          id?: string
          original_input?: string | null
          priority?: number | null
          source_type?: string
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          focus_date?: string
          id?: string
          original_input?: string | null
          priority?: number | null
          source_type?: string
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_missions: {
        Row: {
          created_at: string | null
          id: number
          mission_date: string
          template_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: number
          mission_date: string
          template_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: number
          mission_date?: string
          template_id?: number | null
        }
        Relationships: []
      }
      demo_access_requests: {
        Row: {
          access_code: string
          ai_importance: number
          ai_importance_reason: string | null
          created_at: string
          email: string
          faculty: string | null
          full_name: string
          id: string
          origin_city: string | null
          study_field: string | null
          user_id: string | null
        }
        Insert: {
          access_code: string
          ai_importance: number
          ai_importance_reason?: string | null
          created_at?: string
          email: string
          faculty?: string | null
          full_name: string
          id?: string
          origin_city?: string | null
          study_field?: string | null
          user_id?: string | null
        }
        Update: {
          access_code?: string
          ai_importance?: number
          ai_importance_reason?: string | null
          created_at?: string
          email?: string
          faculty?: string | null
          full_name?: string
          id?: string
          origin_city?: string | null
          study_field?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      eval_benchmarks: {
        Row: {
          active: boolean
          category: string
          created_at: string
          edge_note: string | null
          expected_behavior: string | null
          id: string
          is_edge_case: boolean
          question: string
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          edge_note?: string | null
          expected_behavior?: string | null
          id?: string
          is_edge_case?: boolean
          question: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          edge_note?: string | null
          expected_behavior?: string | null
          id?: string
          is_edge_case?: boolean
          question?: string
        }
        Relationships: []
      }
      eval_edge_cases: {
        Row: {
          created_at: string
          description: string | null
          example_bad_answer: string | null
          id: string
          question: string
          resolved: boolean
          risk_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          example_bad_answer?: string | null
          id?: string
          question: string
          resolved?: boolean
          risk_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          example_bad_answer?: string | null
          id?: string
          question?: string
          resolved?: boolean
          risk_type?: string
        }
        Relationships: []
      }
      eval_results: {
        Row: {
          answer: string
          benchmark_id: string | null
          category: string
          created_at: string
          eval_mode: string
          id: string
          notes: string | null
          question: string
          run_id: string
          score_accuracy: number | null
          score_human_feel: number | null
          score_relevance: number | null
          score_structure: number | null
          score_trustworthiness: number | null
          total_score: number | null
          version_tag: string
        }
        Insert: {
          answer: string
          benchmark_id?: string | null
          category: string
          created_at?: string
          eval_mode?: string
          id?: string
          notes?: string | null
          question: string
          run_id?: string
          score_accuracy?: number | null
          score_human_feel?: number | null
          score_relevance?: number | null
          score_structure?: number | null
          score_trustworthiness?: number | null
          total_score?: number | null
          version_tag: string
        }
        Update: {
          answer?: string
          benchmark_id?: string | null
          category?: string
          created_at?: string
          eval_mode?: string
          id?: string
          notes?: string | null
          question?: string
          run_id?: string
          score_accuracy?: number | null
          score_human_feel?: number | null
          score_relevance?: number | null
          score_structure?: number | null
          score_trustworthiness?: number | null
          total_score?: number | null
          version_tag?: string
        }
        Relationships: []
      }
      flashcard_sets: {
        Row: {
          bilingual: boolean
          cards: Json
          created_at: string
          id: string
          name: string
          source: string | null
          user_id: string
        }
        Insert: {
          bilingual?: boolean
          cards?: Json
          created_at?: string
          id?: string
          name: string
          source?: string | null
          user_id: string
        }
        Update: {
          bilingual?: boolean
          cards?: Json
          created_at?: string
          id?: string
          name?: string
          source?: string | null
          user_id?: string
        }
        Relationships: []
      }
      harvester_runs: {
        Row: {
          chunk_count: number | null
          created_at: string | null
          duration_sec: number | null
          error_message: string | null
          finished_at: string
          id: string
          inserted: number | null
          rejected: number | null
          scraped_count: number | null
          skipped: number | null
          started_at: string
          status: string
          updated: number | null
          url: string | null
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string | null
          duration_sec?: number | null
          error_message?: string | null
          finished_at: string
          id?: string
          inserted?: number | null
          rejected?: number | null
          scraped_count?: number | null
          skipped?: number | null
          started_at: string
          status?: string
          updated?: number | null
          url?: string | null
        }
        Update: {
          chunk_count?: number | null
          created_at?: string | null
          duration_sec?: number | null
          error_message?: string | null
          finished_at?: string
          id?: string
          inserted?: number | null
          rejected?: number | null
          scraped_count?: number | null
          skipped?: number | null
          started_at?: string
          status?: string
          updated?: number | null
          url?: string | null
        }
        Relationships: []
      }
      intel_edge_cases: {
        Row: {
          created_at: string
          frequency: number
          id: string
          last_seen_at: string
          pattern_type: string
          topic_hint: string
        }
        Insert: {
          created_at?: string
          frequency?: number
          id?: string
          last_seen_at?: string
          pattern_type: string
          topic_hint?: string
        }
        Update: {
          created_at?: string
          frequency?: number
          id?: string
          last_seen_at?: string
          pattern_type?: string
          topic_hint?: string
        }
        Relationships: []
      }
      intel_message_ratings: {
        Row: {
          confidence: string | null
          created_at: string
          id: string
          intent: string | null
          message_hash: string
          rating: number
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          message_hash: string
          rating: number
        }
        Update: {
          confidence?: string | null
          created_at?: string
          id?: string
          intent?: string | null
          message_hash?: string
          rating?: number
        }
        Relationships: []
      }
      intel_query_patterns: {
        Row: {
          created_at: string
          frequency: number
          id: string
          last_seen_at: string
          query_hash: string
          sample_query: string | null
          topic_cluster: string | null
        }
        Insert: {
          created_at?: string
          frequency?: number
          id?: string
          last_seen_at?: string
          query_hash: string
          sample_query?: string | null
          topic_cluster?: string | null
        }
        Update: {
          created_at?: string
          frequency?: number
          id?: string
          last_seen_at?: string
          query_hash?: string
          sample_query?: string | null
          topic_cluster?: string | null
        }
        Relationships: []
      }
      intel_retrieval_stats: {
        Row: {
          confidence_level: string | null
          created_at: string
          external_tier: string | null
          had_ddg: boolean | null
          had_kb: boolean | null
          had_perplexity: boolean
          had_pinned: boolean | null
          had_wiki: boolean | null
          id: string
          intent: string | null
          kb_strength: string | null
        }
        Insert: {
          confidence_level?: string | null
          created_at?: string
          external_tier?: string | null
          had_ddg?: boolean | null
          had_kb?: boolean | null
          had_perplexity?: boolean
          had_pinned?: boolean | null
          had_wiki?: boolean | null
          id?: string
          intent?: string | null
          kb_strength?: string | null
        }
        Update: {
          confidence_level?: string | null
          created_at?: string
          external_tier?: string | null
          had_ddg?: boolean | null
          had_kb?: boolean | null
          had_perplexity?: boolean
          had_pinned?: boolean | null
          had_wiki?: boolean | null
          id?: string
          intent?: string | null
          kb_strength?: string | null
        }
        Relationships: []
      }
      kb_articles: {
        Row: {
          ai_summary: string | null
          approval_status: string | null
          content: string | null
          created_at: string | null
          id: string
          last_updated: string | null
          notes: string | null
          published_date: string | null
          scrape_status: string | null
          slug: string | null
          source_url: string | null
          summary: string | null
          tags: string[] | null
          title: string | null
        }
        Insert: {
          ai_summary?: string | null
          approval_status?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          last_updated?: string | null
          notes?: string | null
          published_date?: string | null
          scrape_status?: string | null
          slug?: string | null
          source_url?: string | null
          summary?: string | null
          tags?: string[] | null
          title?: string | null
        }
        Update: {
          ai_summary?: string | null
          approval_status?: string | null
          content?: string | null
          created_at?: string | null
          id?: string
          last_updated?: string | null
          notes?: string | null
          published_date?: string | null
          scrape_status?: string | null
          slug?: string | null
          source_url?: string | null
          summary?: string | null
          tags?: string[] | null
          title?: string | null
        }
        Relationships: []
      }
      kb_articles_draft: {
        Row: {
          article_id: string
          created_at: string
          data: Json
        }
        Insert: {
          article_id: string
          created_at?: string
          data: Json
        }
        Update: {
          article_id?: string
          created_at?: string
          data?: Json
        }
        Relationships: []
      }
      kb_drafts: {
        Row: {
          content: string
          created_at: string
          id: string
          source: string | null
          status: string | null
          tags: string[] | null
          title: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          source?: string | null
          status?: string | null
          tags?: string[] | null
          title: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          source?: string | null
          status?: string | null
          tags?: string[] | null
          title?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          article_type: string
          author_id: string
          category: string
          contact_number: string | null
          content: string
          content_ar: string | null
          created_at: string
          embedding: string | null
          embedding_model: string | null
          hidden: boolean
          id: string
          image_url: string | null
          important_notes: string | null
          keywords: string | null
          last_updated: string | null
          maps_url: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
          vote_count: number
        }
        Insert: {
          article_type?: string
          author_id: string
          category: string
          contact_number?: string | null
          content: string
          content_ar?: string | null
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          hidden?: boolean
          id?: string
          image_url?: string | null
          important_notes?: string | null
          keywords?: string | null
          last_updated?: string | null
          maps_url?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
          vote_count?: number
        }
        Update: {
          article_type?: string
          author_id?: string
          category?: string
          contact_number?: string | null
          content?: string
          content_ar?: string | null
          created_at?: string
          embedding?: string | null
          embedding_model?: string | null
          hidden?: boolean
          id?: string
          image_url?: string | null
          important_notes?: string | null
          keywords?: string | null
          last_updated?: string | null
          maps_url?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
          vote_count?: number
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          chunk_summary: string | null
          chunk_text: string
          created_at: string
          id: string
          metadata_json: Json | null
          source_id: string
          topic: string | null
        }
        Insert: {
          chunk_index: number
          chunk_summary?: string | null
          chunk_text: string
          created_at?: string
          id?: string
          metadata_json?: Json | null
          source_id: string
          topic?: string | null
        }
        Update: {
          chunk_index?: number
          chunk_summary?: string | null
          chunk_text?: string
          created_at?: string
          id?: string
          metadata_json?: Json | null
          source_id?: string
          topic?: string | null
        }
        Relationships: []
      }
      knowledge_sources: {
        Row: {
          cleaned_content: string | null
          created_at: string
          id: string
          published_at: string | null
          scraped_at: string
          source_category: string
          source_name: string | null
          source_trust_hint: string
          source_type: string
          source_url: string | null
          status: string
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          cleaned_content?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          scraped_at?: string
          source_category?: string
          source_name?: string | null
          source_trust_hint?: string
          source_type?: string
          source_url?: string | null
          status?: string
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          cleaned_content?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          scraped_at?: string
          source_category?: string
          source_name?: string | null
          source_trust_hint?: string
          source_type?: string
          source_url?: string | null
          status?: string
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      library_items: {
        Row: {
          ai_description: string | null
          category: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          drive_url: string
          faculty: string | null
          file_type: string
          id: string
          is_published: boolean
          tags: string | null
          title: string
          updated_at: string
          year_level: string | null
        }
        Insert: {
          ai_description?: string | null
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          drive_url: string
          faculty?: string | null
          file_type?: string
          id?: string
          is_published?: boolean
          tags?: string | null
          title: string
          updated_at?: string
          year_level?: string | null
        }
        Update: {
          ai_description?: string | null
          category?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          drive_url?: string
          faculty?: string | null
          file_type?: string
          id?: string
          is_published?: boolean
          tags?: string | null
          title?: string
          updated_at?: string
          year_level?: string | null
        }
        Relationships: []
      }
      masisir_news: {
        Row: {
          author_id: string | null
          category: string
          content: string
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          is_pinned: boolean
          published_at: string
          share_caption: string | null
          source_name: string | null
          source_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          category?: string
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_pinned?: boolean
          published_at?: string
          share_caption?: string | null
          source_name?: string | null
          source_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          is_pinned?: boolean
          published_at?: string
          share_caption?: string | null
          source_name?: string | null
          source_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      masisir_news_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          news_id: string
          user_id: string
          user_name: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          news_id: string
          user_id: string
          user_name?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          news_id?: string
          user_id?: string
          user_name?: string
        }
        Relationships: []
      }
      masisir_procedures: {
        Row: {
          color: string
          created_at: string
          display_order: number
          icon_name: string
          id: string
          is_active: boolean
          steps: Json
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          display_order?: number
          icon_name?: string
          id: string
          is_active?: boolean
          steps?: Json
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          display_order?: number
          icon_name?: string
          id?: string
          is_active?: boolean
          steps?: Json
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_reports: {
        Row: {
          additional_note: string | null
          admin_note: string | null
          created_at: string
          id: string
          message_content: string | null
          message_id: string | null
          reason: string
          status: string
          user_id: string | null
          user_question: string | null
        }
        Insert: {
          additional_note?: string | null
          admin_note?: string | null
          created_at?: string
          id?: string
          message_content?: string | null
          message_id?: string | null
          reason: string
          status?: string
          user_id?: string | null
          user_question?: string | null
        }
        Update: {
          additional_note?: string | null
          admin_note?: string | null
          created_at?: string
          id?: string
          message_content?: string | null
          message_id?: string | null
          reason?: string
          status?: string
          user_id?: string | null
          user_question?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          chat_id: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          user_id: string
        }
        Insert: {
          chat_id: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          user_id: string
        }
        Update: {
          chat_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          user_id?: string
        }
        Relationships: []
      }
      missing_topics: {
        Row: {
          created_at: string
          id: string
          intent_type: string | null
          query: string
        }
        Insert: {
          created_at?: string
          id?: string
          intent_type?: string | null
          query: string
        }
        Update: {
          created_at?: string
          id?: string
          intent_type?: string | null
          query?: string
        }
        Relationships: []
      }
      mission_submissions: {
        Row: {
          contributor_id: string
          daily_mission_id: number | null
          form_data: Json
          id: string
          kb_article_id: string | null
          points_awarded: number | null
          rejection_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          submitted_at: string | null
        }
        Insert: {
          contributor_id: string
          daily_mission_id?: number | null
          form_data: Json
          id?: string
          kb_article_id?: string | null
          points_awarded?: number | null
          rejection_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
        }
        Update: {
          contributor_id?: string
          daily_mission_id?: number | null
          form_data?: Json
          id?: string
          kb_article_id?: string | null
          points_awarded?: number | null
          rejection_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          submitted_at?: string | null
        }
        Relationships: []
      }
      mission_templates: {
        Row: {
          base_points: number
          category: string
          created_at: string | null
          description: string
          difficulty: string
          form_schema: Json
          id: number
          is_active: boolean
          is_flash_mission: boolean | null
          kb_category: string
          point_multiplier: number | null
          title: string
        }
        Insert: {
          base_points?: number
          category: string
          created_at?: string | null
          description: string
          difficulty?: string
          form_schema: Json
          id?: number
          is_active?: boolean
          is_flash_mission?: boolean | null
          kb_category?: string
          point_multiplier?: number | null
          title: string
        }
        Update: {
          base_points?: number
          category?: string
          created_at?: string | null
          description?: string
          difficulty?: string
          form_schema?: Json
          id?: number
          is_active?: boolean
          is_flash_mission?: boolean | null
          kb_category?: string
          point_multiplier?: number | null
          title?: string
        }
        Relationships: []
      }
      muqarrar_chunks: {
        Row: {
          author: string | null
          chapter: string | null
          content: string
          created_at: string | null
          description: string | null
          embedding: Json | null
          embedding_vec: string | null
          id: string
          is_ocr: boolean | null
          kitab_id: string
          kitab_name: string
          page_number: number
          word_count: number | null
        }
        Insert: {
          author?: string | null
          chapter?: string | null
          content: string
          created_at?: string | null
          description?: string | null
          embedding?: Json | null
          embedding_vec?: string | null
          id: string
          is_ocr?: boolean | null
          kitab_id: string
          kitab_name: string
          page_number: number
          word_count?: number | null
        }
        Update: {
          author?: string | null
          chapter?: string | null
          content?: string
          created_at?: string | null
          description?: string | null
          embedding?: Json | null
          embedding_vec?: string | null
          id?: string
          is_ocr?: boolean | null
          kitab_id?: string
          kitab_name?: string
          page_number?: number
          word_count?: number | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          read?: boolean
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_orders: {
        Row: {
          created_at: string
          order_id: string
          plan: string
          user_id: string
        }
        Insert: {
          created_at?: string
          order_id: string
          plan: string
          user_id: string
        }
        Update: {
          created_at?: string
          order_id?: string
          plan?: string
          user_id?: string
        }
        Relationships: []
      }
      pinned_updates: {
        Row: {
          active: boolean
          content: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          topic: string
        }
        Insert: {
          active?: boolean
          content: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          topic: string
        }
        Update: {
          active?: boolean
          content?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          topic?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          alias: string | null
          arrival_year: number | null
          avatar_url: string | null
          contribution_count: number
          created_at: string
          custom_about: string | null
          custom_instructions: string | null
          email: string | null
          faculty: string | null
          full_name: string | null
          hidden_from_leaderboard: boolean
          id: string
          is_banned: boolean | null
          last_mission_date: string | null
          leaderboard_display: string
          level: string
          mission_points: number | null
          mission_streak: number | null
          origin_city: string | null
          study_field: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alias?: string | null
          arrival_year?: number | null
          avatar_url?: string | null
          contribution_count?: number
          created_at?: string
          custom_about?: string | null
          custom_instructions?: string | null
          email?: string | null
          faculty?: string | null
          full_name?: string | null
          hidden_from_leaderboard?: boolean
          id?: string
          is_banned?: boolean | null
          last_mission_date?: string | null
          leaderboard_display?: string
          level?: string
          mission_points?: number | null
          mission_streak?: number | null
          origin_city?: string | null
          study_field?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alias?: string | null
          arrival_year?: number | null
          avatar_url?: string | null
          contribution_count?: number
          created_at?: string
          custom_about?: string | null
          custom_instructions?: string | null
          email?: string | null
          faculty?: string | null
          full_name?: string | null
          hidden_from_leaderboard?: boolean
          id?: string
          is_banned?: boolean | null
          last_mission_date?: string | null
          leaderboard_display?: string
          level?: string
          mission_points?: number | null
          mission_streak?: number | null
          origin_city?: string | null
          study_field?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_logs: {
        Row: {
          count: number | null
          created_at: string | null
          id: string
          skipped: number | null
          source: string | null
          timestamp: string | null
          titles: Json | null
          username: string | null
        }
        Insert: {
          count?: number | null
          created_at?: string | null
          id: string
          skipped?: number | null
          source?: string | null
          timestamp?: string | null
          titles?: Json | null
          username?: string | null
        }
        Update: {
          count?: number | null
          created_at?: string | null
          id?: string
          skipped?: number | null
          source?: string | null
          timestamp?: string | null
          titles?: Json | null
          username?: string | null
        }
        Relationships: []
      }
      query_analytics: {
        Row: {
          created_at: string
          final_count: number | null
          id: string
          intent_class: string | null
          kb_strength: string | null
          legacy_count: number | null
          news_count: number | null
          query_text: string | null
          response_status: string | null
          retrieval_mode: string | null
          top_origin: string | null
          used_external_fallback: boolean | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          final_count?: number | null
          id?: string
          intent_class?: string | null
          kb_strength?: string | null
          legacy_count?: number | null
          news_count?: number | null
          query_text?: string | null
          response_status?: string | null
          retrieval_mode?: string | null
          top_origin?: string | null
          used_external_fallback?: boolean | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          final_count?: number | null
          id?: string
          intent_class?: string | null
          kb_strength?: string | null
          legacy_count?: number | null
          news_count?: number | null
          query_text?: string | null
          response_status?: string | null
          retrieval_mode?: string | null
          top_origin?: string | null
          used_external_fallback?: boolean | null
          user_id?: string | null
        }
        Relationships: []
      }
      query_feedback: {
        Row: {
          created_at: string
          feedback_type: string
          id: string
          notes: string | null
          query_analytics_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          feedback_type: string
          id?: string
          notes?: string | null
          query_analytics_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          feedback_type?: string
          id?: string
          notes?: string | null
          query_analytics_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      query_log: {
        Row: {
          confidence: string | null
          created_at: string
          has_kb_result: boolean | null
          id: number
          intent_type: string | null
          is_transport: boolean | null
          query_text: string
          rating: number | null
          source_used: string | null
          user_id: string | null
        }
        Insert: {
          confidence?: string | null
          created_at?: string
          has_kb_result?: boolean | null
          id?: number
          intent_type?: string | null
          is_transport?: boolean | null
          query_text: string
          rating?: number | null
          source_used?: string | null
          user_id?: string | null
        }
        Update: {
          confidence?: string | null
          created_at?: string
          has_kb_result?: boolean | null
          id?: number
          intent_type?: string | null
          is_transport?: boolean | null
          query_text?: string
          rating?: number | null
          source_used?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      reminder_logs: {
        Row: {
          channel: string
          id: string
          metadata: Json | null
          reminder_date: string
          sent_at: string
          target_id: string | null
          target_type: string
          user_id: string
        }
        Insert: {
          channel?: string
          id?: string
          metadata?: Json | null
          reminder_date: string
          sent_at?: string
          target_id?: string | null
          target_type: string
          user_id: string
        }
        Update: {
          channel?: string
          id?: string
          metadata?: Json | null
          reminder_date?: string
          sent_at?: string
          target_id?: string | null
          target_type?: string
          user_id?: string
        }
        Relationships: []
      }
      saved_answers: {
        Row: {
          content: string
          created_at: string
          id: string
          intent: string | null
          message_id: string
          promoted_to_kb: boolean
          source_summary: string | null
          sources: Json | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          intent?: string | null
          message_id: string
          promoted_to_kb?: boolean
          source_summary?: string | null
          sources?: Json | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          intent?: string | null
          message_id?: string
          promoted_to_kb?: boolean
          source_summary?: string | null
          sources?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      scrape_jobs: {
        Row: {
          created_at: string
          current: number
          duplicate: number
          error: string | null
          failed: number
          job_id: string
          logs: Json
          partial: number
          phase: string
          status: string
          success: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          current?: number
          duplicate?: number
          error?: string | null
          failed?: number
          job_id: string
          logs?: Json
          partial?: number
          phase?: string
          status?: string
          success?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          current?: number
          duplicate?: number
          error?: string | null
          failed?: number
          job_id?: string
          logs?: Json
          partial?: number
          phase?: string
          status?: string
          success?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      scraped_articles_draft: {
        Row: {
          data: Json
          scraped_at: string
          url: string
        }
        Insert: {
          data: Json
          scraped_at?: string
          url: string
        }
        Update: {
          data?: Json
          scraped_at?: string
          url?: string
        }
        Relationships: []
      }
      scraper_drafts: {
        Row: {
          ai_formatted: boolean
          category: string | null
          content: string
          created_at: string
          id: string
          raw_content: string | null
          rejection_reason: string | null
          relevance_score: number
          source_type: string
          source_url: string | null
          status: string
          submitted_by: string
          summary: string | null
          tags: string | null
          title: string
        }
        Insert: {
          ai_formatted?: boolean
          category?: string | null
          content: string
          created_at?: string
          id?: string
          raw_content?: string | null
          rejection_reason?: string | null
          relevance_score?: number
          source_type: string
          source_url?: string | null
          status?: string
          submitted_by: string
          summary?: string | null
          tags?: string | null
          title: string
        }
        Update: {
          ai_formatted?: boolean
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          raw_content?: string | null
          rejection_reason?: string | null
          relevance_score?: number
          source_type?: string
          source_url?: string | null
          status?: string
          submitted_by?: string
          summary?: string | null
          tags?: string | null
          title?: string
        }
        Relationships: []
      }
      scraper_sessions: {
        Row: {
          expire: string
          sess: Json
          sid: string
        }
        Insert: {
          expire: string
          sess: Json
          sid: string
        }
        Update: {
          expire?: string
          sess?: Json
          sid?: string
        }
        Relationships: []
      }
      scraper_users: {
        Row: {
          daily_target: number
          password_hash: string
          role: string
          username: string
        }
        Insert: {
          daily_target?: number
          password_hash: string
          role: string
          username: string
        }
        Update: {
          daily_target?: number
          password_hash?: string
          role?: string
          username?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          activated_at: string
          amount: number
          expires_at: string
          id: string
          order_id: string
          plan: string
          user_id: string
        }
        Insert: {
          activated_at?: string
          amount: number
          expires_at: string
          id?: string
          order_id: string
          plan: string
          user_id: string
        }
        Update: {
          activated_at?: string
          amount?: number
          expires_at?: string
          id?: string
          order_id?: string
          plan?: string
          user_id?: string
        }
        Relationships: []
      }
      system_announcements: {
        Row: {
          button_link: string | null
          button_text: string | null
          created_at: string
          created_by: string | null
          delay_seconds: number
          dismissible: boolean
          end_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          message: string
          selected_user_ids: string[] | null
          show_once_per_user: boolean
          start_at: string | null
          target_audience: string
          title: string
          trigger_type: string
          type: string
          updated_at: string
        }
        Insert: {
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          dismissible?: boolean
          end_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          message: string
          selected_user_ids?: string[] | null
          show_once_per_user?: boolean
          start_at?: string | null
          target_audience?: string
          title: string
          trigger_type?: string
          type?: string
          updated_at?: string
        }
        Update: {
          button_link?: string | null
          button_text?: string | null
          created_at?: string
          created_by?: string | null
          delay_seconds?: number
          dismissible?: boolean
          end_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          message?: string
          selected_user_ids?: string[] | null
          show_once_per_user?: boolean
          start_at?: string | null
          target_audience?: string
          title?: string
          trigger_type?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value?: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed: boolean
          content: string | null
          created_at: string
          id: string
          task_type: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          content?: string | null
          created_at?: string
          id?: string
          task_type?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          content?: string | null
          created_at?: string
          id?: string
          task_type?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      thread_replies: {
        Row: {
          content: string
          created_at: string
          id: string
          image_url: string | null
          thread_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          thread_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      thread_votes: {
        Row: {
          created_at: string
          id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          best_reply_id: string | null
          category: string
          content: string
          created_at: string
          id: string
          image_url: string | null
          promoted_to_kb: boolean
          reply_count: number
          title: string
          updated_at: string
          user_id: string
          vote_count: number
        }
        Insert: {
          best_reply_id?: string | null
          category: string
          content: string
          created_at?: string
          id?: string
          image_url?: string | null
          promoted_to_kb?: boolean
          reply_count?: number
          title: string
          updated_at?: string
          user_id: string
          vote_count?: number
        }
        Update: {
          best_reply_id?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          image_url?: string | null
          promoted_to_kb?: boolean
          reply_count?: number
          title?: string
          updated_at?: string
          user_id?: string
          vote_count?: number
        }
        Relationships: []
      }
      user_activity: {
        Row: {
          last_login: string | null
          last_seen: string | null
          updated_at: string | null
          username: string
        }
        Insert: {
          last_login?: string | null
          last_seen?: string | null
          updated_at?: string | null
          username: string
        }
        Update: {
          last_login?: string | null
          last_seen?: string | null
          updated_at?: string | null
          username?: string
        }
        Relationships: []
      }
      user_announcement_views: {
        Row: {
          announcement_id: string
          dismissed_at: string | null
          id: string
          seen_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          dismissed_at?: string | null
          id?: string
          seen_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          dismissed_at?: string | null
          id?: string
          seen_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_badges: {
        Row: {
          awarded_at: string
          awarded_by: string | null
          badge_type: string
          id: string
          user_id: string
        }
        Insert: {
          awarded_at?: string
          awarded_by?: string | null
          badge_type: string
          id?: string
          user_id: string
        }
        Update: {
          awarded_at?: string
          awarded_by?: string | null
          badge_type?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_memories: {
        Row: {
          created_at: string
          id: string
          is_long_term: boolean
          memory: string
          memory_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_long_term?: boolean
          memory: string
          memory_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_long_term?: boolean
          memory?: string
          memory_type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_notes: {
        Row: {
          content: string | null
          created_at: string
          format: string
          id: string
          items: Json | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          format?: string
          id?: string
          items?: Json | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          format?: string
          id?: string
          items?: Json | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "user" | "contributor" | "senior_contributor" | "admin"
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
      app_role: ["user", "contributor", "senior_contributor", "admin"],
    },
  },
} as const
