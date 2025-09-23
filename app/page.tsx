"use client";

import { useState, useEffect } from 'react';
import { contactsApi, isSupabaseConfigured, DbContact } from '../lib/supabase';

type ContactStatus = 'pending' | 'completed';
type NextAction = 'schedule' | 'remove' | null;

interface Contact {
  id: string;
  name: string;
  purpose: string;
  deadline: string;
  status: ContactStatus;
  createdAt: string;
  completedAt?: string;
  recurring?: string; // 'daily' | 'weekly' | 'monthly' | 'custom'
}

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [deadline, setDeadline] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useDatabase] = useState(() => isSupabaseConfigured());

  // データの読み込み
  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
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
        createdAt: dbContact.created_at || '',
        completedAt: dbContact.completed_at || undefined,
        recurring: dbContact.recurring
      }));
      setContacts(formattedContacts);
    } else {
      // LocalStorageから読み込み
      const stored = localStorage.getItem('contacts');
      if (stored) {
        setContacts(JSON.parse(stored));
      }
    }

    setLoading(false);
  };

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
        status: 'pending'
      });

      if (dbContact) {
        const newContact: Contact = {
          id: dbContact.id || '',
          name: dbContact.name,
          purpose: dbContact.purpose,
          deadline: dbContact.deadline,
          status: dbContact.status,
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
        createdAt: new Date().toISOString(),
      };
      setContacts([...contacts, newContact]);
    }

    setName('');
    setPurpose('');
    setDeadline('');
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

  // ソート（本日が上位）
  const sortedContacts = [...contacts].sort((a, b) => {
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

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4">
        <h1 className="text-3xl font-bold mb-8 text-gray-800">期日管理システム</h1>

        {/* 入力フォーム */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">新規登録</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
            <button
              onClick={handleAdd}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              追加
            </button>
          </div>
        </div>

        {/* リスト */}
        <div className="space-y-4">
          {sortedContacts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              連絡先がありません
            </div>
          ) : (
            sortedContacts.map((contact) => (
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
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold">{contact.name}</h3>
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
