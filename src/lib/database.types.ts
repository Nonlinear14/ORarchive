/**
 * supabase/migrations/0001_init.sql 과 1:1로 맞춘 수동 타입.
 * (supabase gen types 형식을 따른다. 스키마를 바꾸면 이 파일도 함께 고친다.)
 * text + CHECK 제약 컬럼은 리터럴 유니온으로 좁혀 두었다.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type DocumentType = 'handout' | 'log' | 'character'
export type Visibility = 'private' | 'link' | 'public'

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12'
  }
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nickname: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          nickname?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          nickname?: string
          avatar_url?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          id: string
          owner_id: string
          name: string
          description: string
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          owner_id?: string
          name: string
          description?: string
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          name?: string
          description?: string
          deleted_at?: string | null
        }
        Relationships: []
      }
      documents: {
        Row: {
          id: string
          owner_id: string
          project_id: string | null
          type: DocumentType
          title: string
          content: { [key: string]: Json | undefined }
          visibility: Visibility
          version: number
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id?: string
          owner_id?: string
          project_id?: string | null
          type: DocumentType
          title?: string
          content?: { [key: string]: Json | undefined }
          visibility?: Visibility
          version?: number
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          project_id?: string | null
          title?: string
          content?: { [key: string]: Json | undefined }
          visibility?: Visibility
          deleted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'documents_project_id_fkey'
            columns: ['project_id']
            isOneToOne: false
            referencedRelation: 'projects'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      delete_my_account: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}

type PublicTables = Database['public']['Tables']
export type Tables<T extends keyof PublicTables> = PublicTables[T]['Row']
export type TablesInsert<T extends keyof PublicTables> = PublicTables[T]['Insert']
export type TablesUpdate<T extends keyof PublicTables> = PublicTables[T]['Update']
