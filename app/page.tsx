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
  recurring?: string;
  recurringDays?: number; // X日おき
  recurringWeekday?: number; // 0-6 (日曜-土曜)
  order?: number; // 表示順序
}

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState<ContactCategory>('customer');
  const [selectedCategory, setSelectedCategory] = useState<ContactCategory | 'all'>('all');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useDatabase] = useState(() => isSupabaseConfigured());
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [editMode, setEditMode] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editCategory, setEditCategory] = useState<ContactCategory>('customer');
  const [sortMode, setSortMode] = useState<'auto' | 'manual'>('auto');

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

  // ブラウザ通知の初期化
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'granted') {
      setNotificationEnabled(true);
    }
  }, []);

  // 定期的な通知チェック（1分ごと）
  useEffect(() => {
    if (!notificationEnabled) return;

    const checkNotifications = () => {
      const now = new Date();
      const todayStr = now.toDateString();

      contacts
        .filter(c => c.status === 'pending')
        .forEach(contact => {
          const deadlineDate = new Date(contact.deadline);
          const deadlineStr = deadlineDate.toDateString();

          // 本日の期限
          if (deadlineStr === todayStr) {
            const notification = new Notification('期日管理システム - 本日の連絡', {
              body: `${contact.name}への連絡: ${contact.purpose}`,
              icon: '/favicon.ico',
              tag: `deadline-${contact.id}` // 同じ通知の重複を防ぐ
            });

            notification.onclick = () => {
              window.focus();
              notification.close();
            };
          }
        });
    };

    // 初回チェック
    checkNotifications();

    // 1分ごとにチェック
    const interval = setInterval(checkNotifications, 60000);

    return () => clearInterval(interval);
  }, [contacts, notificationEnabled]);

  // データの保存（LocalStorageのみ）
  useEffect(() => {
    if (!useDatabase && contacts.length > 0) {
      localStorage.setItem('contacts', JSON.stringify(contacts));
    }
  }, [contacts, useDatabase]);

  // 編集開始
  const startEdit = (contact: Contact) => {
    setEditMode(contact.id);
    setEditName(contact.name);
    setEditPurpose(contact.purpose);
    setEditDeadline(contact.deadline);
    setEditCategory(contact.category);
  };

  // 編集保存
  const saveEdit = async (id: string) => {
    if (!editName || !editPurpose || !editDeadline) {
      alert('すべての項目を入力してください');
      return;
    }

    if (useDatabase) {
      await contactsApi.update(id, {
        name: editName,
        purpose: editPurpose,
        deadline: editDeadline,
        category: editCategory
      });
    }

    setContacts(contacts.map(c =>
      c.id === id
        ? { ...c, name: editName, purpose: editPurpose, deadline: editDeadline, category: editCategory }
        : c
    ));
    setEditMode(null);
  };

  // 編集キャンセル
  const cancelEdit = () => {
    setEditMode(null);
    setEditName('');
    setEditPurpose('');
    setEditDeadline('');
    setEditCategory('customer');
  };

  // 削除
  const deleteContact = async (id: string) => {
    if (!confirm('この連絡先を削除してもよろしいですか？')) return;

    if (useDatabase) {
      await contactsApi.delete(id);
    }
    setContacts(contacts.filter(c => c.id !== id));
  };

  // 順序変更
  const moveContact = (id: string, direction: 'up' | 'down') => {
    const index = contacts.findIndex(c => c.id === id);
    if (index === -1) return;

    const newContacts = [...contacts];
    if (direction === 'up' && index > 0) {
      [newContacts[index], newContacts[index - 1]] = [newContacts[index - 1], newContacts[index]];
    } else if (direction === 'down' && index < contacts.length - 1) {
      [newContacts[index], newContacts[index + 1]] = [newContacts[index + 1], newContacts[index]];
    }

    // 順序を更新
    const updatedContacts = newContacts.map((c, i) => ({ ...c, order: i }));
    setContacts(updatedContacts);

    // データベースに保存
    if (useDatabase) {
      updatedContacts.forEach(async (c) => {
        await contactsApi.update(c.id, { order: c.order });
      });
    }
  };

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

  // 次回期日を設定（拡張版）
  const setNextDeadline = async (
    id: string,
    nextDeadline: string,
    recurring?: string,
    recurringDays?: number,
    recurringWeekday?: number
  ) => {
    if (useDatabase) {
      // Supabaseを更新
      await contactsApi.update(id, {
        deadline: nextDeadline,
        status: 'pending',
        completed_at: null,
        recurring,
        recurring_days: recurringDays,
        recurring_weekday: recurringWeekday
      });
    }

    setContacts(contacts.map(contact => {
      if (contact.id === id) {
        return {
          ...contact,
          deadline: nextDeadline,
          status: 'pending',
          completedAt: undefined,
          recurring,
          recurringDays,
          recurringWeekday
        };
      }
      return contact;
    }));
    setEditingId(null);
  };

  // フィルタリングとソート
  const filteredAndSortedContacts = [...contacts]
    .sort((a, b) => {
      // 手動ソートモードの場合
      if (sortMode === 'manual' && a.order !== undefined && b.order !== undefined) {
        return a.order - b.order;
      }
      return 0; // 自動ソートは後で適用
    })
    .filter(contact => {
      // カテゴリフィルタ
      const matchesCategory = selectedCategory === 'all' || (contact.category || 'customer') === selectedCategory;

      return matchesCategory;
    })
    .sort((a, b) => {
      // 手動ソートモードの場合はスキップ
      if (sortMode === 'manual') return 0;

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

  // 通知の有効化
  const enableNotifications = async () => {
    if (!('Notification' in window)) {
      alert('このブラウザは通知をサポートしていません');
      return;
    }

    if (Notification.permission === 'granted') {
      setNotificationEnabled(true);
      alert('通知が有効になりました');
    } else if (Notification.permission !== 'denied') {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setNotificationEnabled(true);
        alert('通知が有効になりました');
      } else {
        alert('通知の許可が拒否されました');
      }
    } else {
      alert('通知がブロックされています。ブラウザの設定から変更してください');
    }
  };

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

        {/* フィルタ・表示モード切替 */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <div className="flex flex-wrap gap-4 items-center">
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
              onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              {viewMode === 'list' ? '📋 カンバン' : '📝 リスト'}
            </button>
            <button
              onClick={() => setSortMode(sortMode === 'auto' ? 'manual' : 'auto')}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              {sortMode === 'auto' ? '🔄 手動並替' : '⚡ 自動並替'}
            </button>
            <button
              onClick={enableNotifications}
              className={`px-4 py-2 rounded-lg transition ${
                notificationEnabled
                  ? 'bg-gray-500 text-white cursor-not-allowed'
                  : 'bg-orange-600 text-white hover:bg-orange-700'
              }`}
              disabled={notificationEnabled}
            >
              {notificationEnabled ? '🔔 通知有効' : '🔔 通知を有効化'}
            </button>
          </div>
        </div>

        {/* リスト表示 */}
        {viewMode === 'list' ? (
          <div className="space-y-4">
            {filteredAndSortedContacts.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                {selectedCategory !== 'all' ? '条件に一致する連絡先がありません' : '連絡先がありません'}
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
                    {editMode === contact.id ? (
                      /* 編集モード */
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="名前"
                          />
                          <input
                            type="text"
                            value={editPurpose}
                            onChange={(e) => setEditPurpose(e.target.value)}
                            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            placeholder="目的"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            type="date"
                            value={editDeadline}
                            onChange={(e) => setEditDeadline(e.target.value)}
                            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as ContactCategory)}
                            className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="customer">👥 顧客</option>
                            <option value="advisor">👨‍💼 顧問</option>
                            <option value="agency">🏢 代理店</option>
                            <option value="other">📋 その他</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(contact.id)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                          >
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 表示モード */
                      <>
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

                        {/* アクションボタン */}
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => startEdit(contact)}
                            className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition"
                          >
                            ✂️ 編集
                          </button>
                          <button
                            onClick={() => deleteContact(contact.id)}
                            className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200 transition"
                          >
                            🗑️ 削除
                          </button>
                          {sortMode === 'manual' && (
                            <>
                              <button
                                onClick={() => moveContact(contact.id, 'up')}
                                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                              >
                                ⬆️
                              </button>
                              <button
                                onClick={() => moveContact(contact.id, 'down')}
                                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition"
                              >
                                ⬇️
                              </button>
                            </>
                          )}
                        </div>
                      </>
                    )}

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
                            <div className="space-y-2">
                              {/* 基本オプション */}
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

                              {/* カスタムオプション */}
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  placeholder="日数"
                                  className="w-20 px-2 py-1 border rounded"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      const days = parseInt((e.target as HTMLInputElement).value);
                                      if (days > 0) {
                                        const nextDate = new Date();
                                        nextDate.setDate(nextDate.getDate() + days);
                                        setNextDeadline(contact.id, nextDate.toISOString().split('T')[0], 'custom', days);
                                      }
                                    }
                                  }}
                                />
                                <span className="text-sm">日おき</span>
                              </div>

                              {/* 曜日指定 */}
                              <div className="flex items-center gap-2">
                                <select
                                  className="px-2 py-1 border rounded"
                                  onChange={(e) => {
                                    const weekday = parseInt(e.target.value);
                                    if (weekday >= 0) {
                                      const today = new Date();
                                      const currentDay = today.getDay();
                                      let daysToAdd = weekday - currentDay;
                                      if (daysToAdd <= 0) daysToAdd += 7;
                                      const nextDate = new Date();
                                      nextDate.setDate(nextDate.getDate() + daysToAdd);
                                      setNextDeadline(contact.id, nextDate.toISOString().split('T')[0], 'weekly', undefined, weekday);
                                    }
                                  }}
                                >
                                  <option value="">曜日を選択</option>
                                  <option value="0">毎週日曜日</option>
                                  <option value="1">毎週月曜日</option>
                                  <option value="2">毎週火曜日</option>
                                  <option value="3">毎週水曜日</option>
                                  <option value="4">毎週木曜日</option>
                                  <option value="5">毎週金曜日</option>
                                  <option value="6">毎週土曜日</option>
                                </select>
                              </div>
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
                        🔄 {
                          contact.recurring === 'daily' ? '毎日' :
                          contact.recurring === 'weekly' && contact.recurringWeekday !== undefined ?
                            `毎週${['日', '月', '火', '水', '木', '金', '土'][contact.recurringWeekday]}曜日` :
                          contact.recurring === 'weekly' ? '毎週' :
                          contact.recurring === 'monthly' ? '毎月' :
                          contact.recurring === 'custom' && contact.recurringDays ?
                            `${contact.recurringDays}日おき` : ''
                        } リピート
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        ) : (
          /* カンバンビュー */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 本日 */}
            <div className="bg-red-50 rounded-lg p-4">
              <h3 className="text-lg font-bold text-red-800 mb-4 sticky top-0 bg-red-50 py-2">🔴 本日の連絡</h3>
              <div className="space-y-3">
                {filteredAndSortedContacts
                  .filter(c => {
                    const today = new Date().toDateString();
                    return new Date(c.deadline).toDateString() === today && c.status === 'pending';
                  })
                  .map(contact => (
                    <div key={contact.id} className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{contact.name}</h4>
                          <p className="text-xs text-gray-600 mt-1">{contact.purpose}</p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-2 ${getCategoryDisplay(contact.category).color}`}>
                            {getCategoryDisplay(contact.category).label}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                {filteredAndSortedContacts.filter(c => {
                  const today = new Date().toDateString();
                  return new Date(c.deadline).toDateString() === today && c.status === 'pending';
                }).length === 0 && (
                  <p className="text-gray-400 text-center py-4">本日の連絡はありません</p>
                )}
              </div>
            </div>

            {/* 期限切れ */}
            <div className="bg-orange-50 rounded-lg p-4">
              <h3 className="text-lg font-bold text-orange-800 mb-4 sticky top-0 bg-orange-50 py-2">⚠️ 期限切れ</h3>
              <div className="space-y-3">
                {filteredAndSortedContacts
                  .filter(c => {
                    const today = new Date();
                    const deadline = new Date(c.deadline);
                    return deadline < today && deadline.toDateString() !== today.toDateString() && c.status === 'pending';
                  })
                  .map(contact => (
                    <div key={contact.id} className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{contact.name}</h4>
                          <p className="text-xs text-gray-600 mt-1">{contact.purpose}</p>
                          <p className="text-xs text-orange-600 font-medium mt-1">
                            {new Date(contact.deadline).toLocaleDateString('ja-JP')}
                          </p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-2 ${getCategoryDisplay(contact.category).color}`}>
                            {getCategoryDisplay(contact.category).label}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                {filteredAndSortedContacts.filter(c => {
                  const today = new Date();
                  const deadline = new Date(c.deadline);
                  return deadline < today && deadline.toDateString() !== today.toDateString() && c.status === 'pending';
                }).length === 0 && (
                  <p className="text-gray-400 text-center py-4">期限切れはありません</p>
                )}
              </div>
            </div>

            {/* 今後の予定 */}
            <div className="bg-blue-50 rounded-lg p-4">
              <h3 className="text-lg font-bold text-blue-800 mb-4 sticky top-0 bg-blue-50 py-2">📅 今後の予定</h3>
              <div className="space-y-3">
                {filteredAndSortedContacts
                  .filter(c => {
                    const today = new Date();
                    const deadline = new Date(c.deadline);
                    return deadline > today && c.status === 'pending';
                  })
                  .map(contact => (
                    <div key={contact.id} className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <h4 className="font-semibold text-sm">{contact.name}</h4>
                          <p className="text-xs text-gray-600 mt-1">{contact.purpose}</p>
                          <p className="text-xs text-blue-600 font-medium mt-1">
                            {new Date(contact.deadline).toLocaleDateString('ja-JP')}
                          </p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium mt-2 ${getCategoryDisplay(contact.category).color}`}>
                            {getCategoryDisplay(contact.category).label}
                          </span>
                          {contact.recurring && (
                            <span className="block text-xs text-blue-500 mt-1">
                              🔄 {contact.recurring === 'daily' ? '毎日' :
                                  contact.recurring === 'weekly' ? '毎週' :
                                  contact.recurring === 'monthly' ? '毎月' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                {filteredAndSortedContacts.filter(c => {
                  const today = new Date();
                  const deadline = new Date(c.deadline);
                  return deadline > today && c.status === 'pending';
                }).length === 0 && (
                  <p className="text-gray-400 text-center py-4">今後の予定はありません</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
