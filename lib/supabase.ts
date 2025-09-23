import { createClient } from '@supabase/supabase-js';

// Supabaseクライアントの初期化
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Supabaseが設定されているかチェック
export const isSupabaseConfigured = () => {
  return supabaseUrl && supabaseAnonKey;
};

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// データベースの型定義
export interface DbContact {
  id?: string;
  name: string;
  purpose: string;
  deadline: string;
  status: 'pending' | 'completed';
  recurring?: string;
  created_at?: string;
  completed_at?: string | null;
  user_id?: string;
}

// Contacts テーブル操作用の関数
export const contactsApi = {
  // 全件取得
  async getAll(): Promise<DbContact[]> {
    if (!supabase) return [];

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .order('deadline', { ascending: true });

    if (error) {
      console.error('Error fetching contacts:', error);
      return [];
    }

    return data || [];
  },

  // 新規作成
  async create(contact: Omit<DbContact, 'id' | 'created_at'>): Promise<DbContact | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('contacts')
      .insert([contact])
      .select()
      .single();

    if (error) {
      console.error('Error creating contact:', error);
      return null;
    }

    return data;
  },

  // 更新
  async update(id: string, updates: Partial<DbContact>): Promise<DbContact | null> {
    if (!supabase) return null;

    const { data, error } = await supabase
      .from('contacts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating contact:', error);
      return null;
    }

    return data;
  },

  // 削除
  async delete(id: string): Promise<boolean> {
    if (!supabase) return false;

    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting contact:', error);
      return false;
    }

    return true;
  }
};