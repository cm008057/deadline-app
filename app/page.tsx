"use client";

import { useState, useEffect, useCallback } from 'react';
import { contactsApi, isSupabaseConfigured } from '../lib/supabase';

type ContactStatus = 'pending' | 'completed';
type ContactCategory = 'advisor' | 'agency' | 'customer' | 'other';

interface Contact {
  id: string;
  name: string;
  purpose: string;
  deadline: string;
  status: ContactStatus;
  category: ContactCategory;
  createdAt: string;
  completedAt?: string;
  recurring?: string; // 'daily' | 'weekly' | 'monthly' | 'custom'
}

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState<ContactCategory>('customer');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<ContactCategory | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useDatabase] = useState(() => isSupabaseConfigured());

  const loadContacts = useCallback(async () => {
    setLoading(true);

    if (useDatabase) {
      // Supabaseから読み込み
      const dbContacts = await contactsApi.getAll();
      const formattedContacts: Contact[] = dbContacts.map(dbContact => ({
        id: dbContact.id || '',
        name: dbContact.name,
        purpose: dbContact.purpose,
        deadline: dbContact.deadline,
        status: dbContact.status,
        category: dbContact.category || 'customer',
        createdAt: dbContact.created_at || '',
        completedAt: dbContact.completed_at || undefined,
        recurring: dbContact.recurring
      }));
      setContacts(formattedContacts);
    } else {
      // LocalStorageから読み込み
      const stored = localStorage.getItem('contacts');
      if (stored) {
        const parsedContacts = JSON.parse(stored).map((contact: Contact) => ({
          ...contact,
          category: contact.category || 'customer'
        }));
        setContacts(parsedContacts);
      }
    }

    setLoading(false);
  }, [useDatabase]);

  // データの読み込み
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // データの保存（LocalStorageのみ）
  useEffect(() => {
    if (!useDatabase && contacts.length > 0) {
      localStorage.setItem('contacts', JSON.stringify(contacts));
    }
  }, [contacts, useDatabase]);

  // 新規追加
  const handleAdd = async () => {
    if (!name || !purpose || !deadline) {
      alert('すべての項目を入力してください');
      return;
    }

    setLoading(true);

    if (useDatabase) {
      // Supabaseに保存
      const dbContact = await contactsApi.create({
        name,
        purpose,
        deadline,
        status: 'pending',
        category
      });

      if (dbContact) {
        const newContact: Contact = {
          id: dbContact.id || '',
          name: dbContact.name,
          purpose: dbContact.purpose,
          deadline: dbContact.deadline,
          status: dbContact.status,
          category: dbContact.category || 'customer',
          createdAt: dbContact.created_at || '',
          completedAt: dbContact.completed_at || undefined,
          recurring: dbContact.recurring
        };
        setContacts([...contacts, newContact]);
      }
    } else {
      // LocalStorageに保存
      const newContact: Contact = {
        id: Date.now().toString(),
        name,
        purpose,
        deadline,
        status: 'pending',
        category,
        createdAt: new Date().toISOString(),
      };
      setContacts([...contacts, newContact]);
    }

    setName('');
    setPurpose('');
    setDeadline('');
    setCategory('customer');
    setLoading(false);
  };

  // チェック/アンチェック
  const toggleComplete = async (id: string) => {
    const contact = contacts.find(c => c.id === id);
    if (!contact) return;

    const newStatus = contact.status === 'pending' ? 'completed' : 'pending';
    const completedAt = newStatus === 'completed' ? new Date().toISOString() : undefined;

    if (useDatabase) {
      // Supabaseを更新
      await contactsApi.update(id, {
        status: newStatus,
        completed_at: completedAt || null
      });
    }

    // ローカル状態を更新
    setContacts(contacts.map(contact => {
      if (contact.id === id) {
        if (newStatus === 'completed') {
          setEditingId(id);
          return { ...contact, status: 'completed', completedAt };
        } else {
          return { ...contact, status: 'pending', completedAt: undefined };
        }
      }
      return contact;
    }));
  };

  // 次のアクション選択
  const handleNextAction = async (id: string, action: 'schedule' | 'remove' | 'cancel') => {
    if (action === 'remove') {
      if (useDatabase) {
        // Supabaseから削除
        await contactsApi.delete(id);
      }
      setContacts(contacts.filter(c => c.id !== id));
    } else if (action === 'cancel') {
      if (useDatabase) {
        // Supabaseを更新
        await contactsApi.update(id, {
          status: 'pending',
          completed_at: null
        });
      }
      setContacts(contacts.map(c =>
        c.id === id ? { ...c, status: 'pending', completedAt: undefined } : c
      ));
    }
    setEditingId(null);
  };

  // 次回期日を設定
  const setNextDeadline = async (id: string, nextDeadline: string, recurring?: string) => {
    if (useDatabase) {
      // Supabaseを更新
      await contactsApi.update(id, {
        deadline: nextDeadline,
        status: 'pending',
        completed_at: null,
        recurring
      });
    }

    setContacts(contacts.map(contact => {
      if (contact.id === id) {
        return {
          ...contact,
          deadline: nextDeadline,
          status: 'pending',
          completedAt: undefined,
          recurring
        };
      }
      return contact;
    }));
    setEditingId(null);
  };

  // フィルタリングとソート
  const filteredAndSortedContacts = [...contacts]
    .filter(contact => {
      // 検索フィルタ
      const matchesSearch = !searchTerm ||
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.purpose.toLowerCase().includes(searchTerm.toLowerCase());

      // カテゴリフィルタ
      const matchesCategory = selectedCategory === 'all' || (contact.category || 'customer') === selectedCategory;

      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      const today = new Date().toDateString();
      const aDate = new Date(a.deadline).toDateString();
      const bDate = new Date(b.deadline).toDateString();

      // 完了済みは下位
      if (a.status === 'completed' && b.status === 'pending') return 1;
      if (a.status === 'pending' && b.status === 'completed') return -1;

      // 本日分を最上位
      if (aDate === today && bDate !== today) return -1;
      if (aDate !== today && bDate === today) return 1;

      // 期日順
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });

  // 期日表示フォーマット
  const formatDeadline = (deadline: string) => {
    const date = new Date(deadline);
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    const isPast = date < today && !isToday;

    const formatted = date.toLocaleDateString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      weekday: 'short'
    });

    if (isToday) return `🔴 本日 ${formatted}`;
    if (isPast) return `⚠️ 期限切れ ${formatted}`;
    return formatted;
  };

  // カテゴリ表示用
  const getCategoryDisplay = (category: ContactCategory | undefined) => {
    const categories = {
      advisor: { label: '👨‍💼 顧問', color: 'bg-blue-100 text-blue-800' },
      agency: { label: '🏢 代理店', color: 'bg-green-100 text-green-800' },
      customer: { label: '👥 顧客', color: 'bg-purple-100 text-purple-800' },
      other: { label: '📋 その他', color: 'bg-gray-100 text-gray-800' }
    };
    return categories[category || 'customer'];
  };

  // CSV エクスポート
  const exportToCSV = () => {
    if (filteredAndSortedContacts.length === 0) {
      alert('エクスポートするデータがありません');
      return;
    }

    const csvData = filteredAndSortedContacts.map(contact => ({
      名前: contact.name,
      目的: contact.purpose,
      期日: contact.deadline,
      カテゴリ: getCategoryDisplay(contact.category).label,
      ステータス: contact.status === 'completed' ? '完了' : '未完了',
      作成日: new Date(contact.createdAt).toLocaleDateString('ja-JP'),
      完了日: contact.completedAt ? new Date(contact.completedAt).toLocaleDateString('ja-JP') : '',
      リピート: contact.recurring || ''
    }));

    const csvContent = [
      Object.keys(csvData[0]).join(','),
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `contacts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 統計データ
  const getStats = () => {
    const total = contacts.length;
    const completed = contacts.filter(c => c.status === 'completed').length;
    const pending = total - completed;
    const today = contacts.filter(c => new Date(c.deadline).toDateString() === new Date().toDateString()).length;
    const overdue = contacts.filter(c =>
      c.status === 'pending' && new Date(c.deadline) < new Date() &&
      new Date(c.deadline).toDateString() !== new Date().toDateString()
    ).length;

    const byCategory = {
      advisor: contacts.filter(c => (c.category || 'customer') === 'advisor').length,
      agency: contacts.filter(c => (c.category || 'customer') === 'agency').length,
      customer: contacts.filter(c => (c.category || 'customer') === 'customer').length,
      other: contacts.filter(c => (c.category || 'customer') === 'other').length,
    };

    return { total, completed, pending, today, overdue, byCategory };
  };

  const stats = getStats();

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">期日管理システム</h1>

        {/* 入力フォーム */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">新規登録</h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <input
              type="text"
              placeholder="名前"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="連絡目的"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ContactCategory)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="customer">👥 顧客</option>
              <option value="advisor">👨‍💼 顧問</option>
              <option value="agency">🏢 代理店</option>
              <option value="other">📋 その他</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {loading ? '追加中...' : '追加'}
            </button>
          </div>
        </div>

        {/* 統計ダッシュボード */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
            <div className="text-sm text-gray-600">総件数</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
            <div className="text-sm text-gray-600">完了</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.pending}</div>
            <div className="text-sm text-gray-600">未完了</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{stats.today}</div>
            <div className="text-sm text-gray-600">本日</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <div className="text-2xl font-bold text-purple-600">{stats.overdue}</div>
            <div className="text-sm text-gray-600">期限切れ</div>
          </div>
        </div>

        {/* 検索・フィルタ・エクスポート */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <input
              type="text"
              placeholder="🔍 名前・目的で検索"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value as ContactCategory | 'all')}
              className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">📂 全カテゴリ</option>
              <option value="advisor">👨‍💼 顧問</option>
              <option value="agency">🏢 代理店</option>
              <option value="customer">👥 顧客</option>
              <option value="other">📋 その他</option>
            </select>
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
            >
              📊 CSV出力
            </button>
            <div className="text-sm text-gray-600 self-center">
              {filteredAndSortedContacts.length}件表示
            </div>
          </div>
        </div>

        {/* リスト */}
        <div className="space-y-4">
          {filteredAndSortedContacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {searchTerm || selectedCategory !== 'all' ? '条件に一致する連絡先がありません' : '連絡先がありません'}
            </div>
          ) : (
            filteredAndSortedContacts.map((contact) => (
              <div key={contact.id} className={`bg-white rounded-lg shadow p-6 ${
                contact.status === 'completed' ? 'opacity-60' : ''
              }`}>
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={contact.status === 'completed'}
                    onChange={() => toggleComplete(contact.id)}
                    className="mt-1 w-5 h-5 cursor-pointer"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg font-semibold">{contact.name}</h3>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryDisplay(contact.category).color}`}>
                        {getCategoryDisplay(contact.category).label}
                      </span>
                      <span className={`text-sm font-medium ${
                        new Date(contact.deadline).toDateString() === new Date().toDateString()
                          ? 'text-red-600'
                          : new Date(contact.deadline) < new Date()
                          ? 'text-orange-600'
                          : 'text-gray-600'
                      }`}>
                        {formatDeadline(contact.deadline)}
                      </span>
                    </div>
                    <p className="text-gray-700">{contact.purpose}</p>

                    {/* 完了後のアクション選択 */}
                    {contact.status === 'completed' && editingId === contact.id && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm font-medium mb-3">次のアクションを選択:</p>
                        <div className="space-y-3">
                          {/* 次回期日設定 */}
                          <div>
                            <p className="text-sm mb-2">次回期日を設定:</p>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => {
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  setNextDeadline(contact.id, tomorrow.toISOString().split('T')[0]);
                                }}
                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              >
                                明日
                              </button>
                              <button
                                onClick={() => {
                                  const nextWeek = new Date();
                                  nextWeek.setDate(nextWeek.getDate() + 7);
                                  setNextDeadline(contact.id, nextWeek.toISOString().split('T')[0]);
                                }}
                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              >
                                1週間後
                              </button>
                              <button
                                onClick={() => {
                                  const nextMonth = new Date();
                                  nextMonth.setMonth(nextMonth.getMonth() + 1);
                                  setNextDeadline(contact.id, nextMonth.toISOString().split('T')[0]);
                                }}
                                className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                              >
                                1ヶ月後
                              </button>
                              <input
                                type="date"
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setNextDeadline(contact.id, e.target.value);
                                  }
                                }}
                                className="px-3 py-1 border rounded"
                              />
                            </div>
                          </div>

                          {/* スケジューリング */}
                          <div>
                            <p className="text-sm mb-2">定期スケジュール:</p>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => {
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  setNextDeadline(contact.id, tomorrow.toISOString().split('T')[0], 'daily');
                                }}
                                className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                毎日
                              </button>
                              <button
                                onClick={() => {
                                  const nextWeek = new Date();
                                  nextWeek.setDate(nextWeek.getDate() + 7);
                                  setNextDeadline(contact.id, nextWeek.toISOString().split('T')[0], 'weekly');
                                }}
                                className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                毎週
                              </button>
                              <button
                                onClick={() => {
                                  const nextMonth = new Date();
                                  nextMonth.setMonth(nextMonth.getMonth() + 1);
                                  setNextDeadline(contact.id, nextMonth.toISOString().split('T')[0], 'monthly');
                                }}
                                className="px-3 py-1 bg-green-100 text-green-700 rounded hover:bg-green-200"
                              >
                                毎月
                              </button>
                            </div>
                          </div>

                          {/* その他アクション */}
                          <div className="flex gap-2 mt-3 pt-3 border-t">
                            <button
                              onClick={() => handleNextAction(contact.id, 'remove')}
                              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              削除
                            </button>
                            <button
                              onClick={() => handleNextAction(contact.id, 'cancel')}
                              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                            >
                              キャンセル
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {contact.recurring && contact.status === 'pending' && (
                      <div className="mt-2 text-sm text-blue-600">
                        🔄 {contact.recurring === 'daily' ? '毎日' :
                            contact.recurring === 'weekly' ? '毎週' :
                            contact.recurring === 'monthly' ? '毎月' : ''} リピート
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
