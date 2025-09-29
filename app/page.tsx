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
      advisor: { label: '顧問', emoji: '🎯', color: 'bg-gradient-to-r from-violet-500 to-purple-500 text-white' },
      agency: { label: '代理店', emoji: '🏢', color: 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white' },
      customer: { label: '顧客', emoji: '👥', color: 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' },
      other: { label: 'その他', emoji: '📌', color: 'bg-gradient-to-r from-gray-500 to-slate-500 text-white' }
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-cyan-50">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-indigo-600 via-blue-600 to-purple-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="text-center">
            <div className="inline-flex items-center justify-center p-3 bg-white/10 backdrop-blur rounded-2xl mb-6">
              <span className="text-5xl">⏰</span>
            </div>
            <h1 className="text-5xl font-black tracking-tight mb-4">
              Deadline Manager
            </h1>
            <p className="text-xl text-indigo-100 font-light max-w-2xl mx-auto">
              スマートな期日管理で、大切な連絡を見逃さない
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">

        {/* 入力フォーム */}
        <div className="bg-white/95 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 p-8 mb-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-purple-200 to-pink-200 rounded-full blur-3xl opacity-20"></div>
          <h2 className="text-2xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-8">
            新しい予定を追加
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="お名前"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-gray-800 placeholder-gray-400"
              />
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="連絡の目的"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-gray-800 placeholder-gray-400"
              />
            </div>
            <div className="relative">
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-gray-800"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as ContactCategory)}
              className="px-5 py-4 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-gray-800 appearance-none cursor-pointer"
            >
              <option value="customer">👥 顧客</option>
              <option value="advisor">🎯 顧問</option>
              <option value="agency">🏢 代理店</option>
              <option value="other">📌 その他</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="relative px-8 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-lg rounded-2xl hover:from-indigo-700 hover:to-purple-700 transition-all duration-300 disabled:opacity-50 shadow-xl hover:shadow-2xl hover:scale-105 transform"
            >
              <span className="relative z-10">
                {loading ? '追加中...' : '予定を追加'}
              </span>
            </button>
          </div>
        </div>

        {/* フィルタ・表示モード切替 */}
        <div className="bg-white/80 backdrop-blur-lg rounded-3xl shadow-xl border border-white/20 p-6 mb-8">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as ContactCategory | 'all')}
                className="px-6 py-3 bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-gray-700 cursor-pointer hover:bg-gradient-to-r hover:from-gray-100 hover:to-gray-200"
              >
                <option value="all">🎨 全カテゴリ</option>
                <option value="advisor">🎯 顧問のみ</option>
                <option value="agency">🏢 代理店のみ</option>
                <option value="customer">👥 顧客のみ</option>
                <option value="other">📌 その他のみ</option>
              </select>
              <button
                onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
                className="px-6 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 font-semibold rounded-2xl hover:from-indigo-100 hover:to-purple-100 transition-all duration-200 border border-indigo-200/50"
              >
                {viewMode === 'list' ? '📊 ボード表示' : '📋 リスト表示'}
              </button>
              <button
                onClick={() => setSortMode(sortMode === 'auto' ? 'manual' : 'auto')}
                className="px-6 py-3 bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 font-semibold rounded-2xl hover:from-purple-100 hover:to-pink-100 transition-all duration-200 border border-purple-200/50"
              >
                {sortMode === 'auto' ? '🔄 手動ソート' : '⚡ 自動ソート'}
              </button>
            </div>
            <button
              onClick={enableNotifications}
              className={`px-6 py-3 font-semibold rounded-2xl transition-all duration-200 ${
                notificationEnabled
                  ? 'bg-green-100 text-green-700 cursor-not-allowed border border-green-200'
                  : 'bg-gradient-to-r from-amber-400 to-orange-400 text-white hover:from-amber-500 hover:to-orange-500 shadow-lg hover:shadow-xl'
              }`}
              disabled={notificationEnabled}
            >
              {notificationEnabled ? '✅ 通知ON' : '🔔 通知をON'}
            </button>
          </div>
        </div>

        {/* リスト表示 */}
        {viewMode === 'list' ? (
          <div className="space-y-4">
            {filteredAndSortedContacts.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-navy-300 text-6xl mb-4">📅</div>
                <h3 className="text-2xl font-bold text-navy-700 mb-2">連絡先がありません</h3>
                <p className="text-navy-500">
                  {selectedCategory !== 'all' ? '条件に一致する連絡先がありません' : '新しい連絡先を追加してみましょう'}
                </p>
              </div>
            ) : (
            filteredAndSortedContacts.map((contact) => (
              <div key={contact.id} className={`group bg-white rounded-3xl shadow-lg border border-gray-100 p-7 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1 ${
                contact.status === 'completed' ? 'opacity-50 bg-gray-50/50' : ''
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
                            className="px-3 py-2 border-2 border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-all"
                            placeholder="名前"
                          />
                          <input
                            type="text"
                            value={editPurpose}
                            onChange={(e) => setEditPurpose(e.target.value)}
                            className="px-3 py-2 border-2 border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-all"
                            placeholder="目的"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <input
                            type="date"
                            value={editDeadline}
                            onChange={(e) => setEditDeadline(e.target.value)}
                            className="px-3 py-2 border-2 border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-all"
                          />
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as ContactCategory)}
                            className="px-3 py-2 border-2 border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-all"
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
                            className="px-6 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-medium rounded-xl hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 shadow-md hover:shadow-lg"
                          >
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-6 py-2 bg-gradient-to-r from-slate-500 to-slate-600 text-white font-medium rounded-xl hover:from-slate-600 hover:to-slate-700 transition-all duration-200 shadow-md hover:shadow-lg"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* 表示モード */
                      <>
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-2xl font-black text-gray-800">{contact.name}</h3>
                          <span className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold ${getCategoryDisplay(contact.category).color} shadow-md`}>
                            <span>{getCategoryDisplay(contact.category).emoji}</span>
                            <span>{getCategoryDisplay(contact.category).label}</span>
                          </span>
                          <span className={`inline-flex items-center gap-1 text-sm font-bold px-3 py-1 rounded-lg ${
                            new Date(contact.deadline).toDateString() === new Date().toDateString()
                              ? 'bg-red-100 text-red-700'
                              : new Date(contact.deadline) < new Date()
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            📅 {formatDeadline(contact.deadline)}
                          </span>
                        </div>
                        <p className="text-gray-600 text-lg leading-relaxed mt-3">{contact.purpose}</p>

                        {/* アクションボタン */}
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => startEdit(contact)}
                            className="px-5 py-2.5 text-sm bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 font-bold rounded-2xl hover:from-indigo-100 hover:to-blue-100 transition-all duration-200 border border-indigo-200/50"
                          >
                            ✂️ 編集
                          </button>
                          <button
                            onClick={() => deleteContact(contact.id)}
                            className="px-5 py-2.5 text-sm bg-gradient-to-r from-red-50 to-pink-50 text-red-700 font-bold rounded-2xl hover:from-red-100 hover:to-pink-100 transition-all duration-200 border border-red-200/50"
                          >
                            🗑️ 削除
                          </button>
                          {sortMode === 'manual' && (
                            <>
                              <button
                                onClick={() => moveContact(contact.id, 'up')}
                                className="px-3 py-1 text-sm bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-all duration-200"
                              >
                                ⬆️
                              </button>
                              <button
                                onClick={() => moveContact(contact.id, 'down')}
                                className="px-3 py-1 text-sm bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-all duration-200"
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
                      <div className="mt-6 p-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl border border-indigo-200/50">
                        <p className="text-sm font-bold text-indigo-800 mb-4">🎆 完了おめでとう！次のアクションを選択:
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
                                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-600 shadow-md hover:shadow-lg transition-all"
                              >
                                明日
                              </button>
                              <button
                                onClick={() => {
                                  const nextWeek = new Date();
                                  nextWeek.setDate(nextWeek.getDate() + 7);
                                  setNextDeadline(contact.id, nextWeek.toISOString().split('T')[0]);
                                }}
                                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-600 shadow-md hover:shadow-lg transition-all"
                              >
                                1週間後
                              </button>
                              <button
                                onClick={() => {
                                  const nextMonth = new Date();
                                  nextMonth.setMonth(nextMonth.getMonth() + 1);
                                  setNextDeadline(contact.id, nextMonth.toISOString().split('T')[0]);
                                }}
                                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-xl hover:from-blue-600 hover:to-indigo-600 shadow-md hover:shadow-lg transition-all"
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
                                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all"
                                >
                                  毎日
                                </button>
                                <button
                                  onClick={() => {
                                    const nextWeek = new Date();
                                    nextWeek.setDate(nextWeek.getDate() + 7);
                                    setNextDeadline(contact.id, nextWeek.toISOString().split('T')[0], 'weekly');
                                  }}
                                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all"
                                >
                                  毎週
                                </button>
                                <button
                                  onClick={() => {
                                    const nextMonth = new Date();
                                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                                    setNextDeadline(contact.id, nextMonth.toISOString().split('T')[0], 'monthly');
                                  }}
                                  className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-xl hover:from-emerald-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all"
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
            <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-2xl p-6 border border-red-200">
              <h3 className="text-xl font-bold text-red-800 mb-6 sticky top-0 bg-gradient-to-r from-red-50 to-red-100 py-3 rounded-xl flex items-center gap-2">
                <span className="bg-red-200 p-2 rounded-lg">🔴</span>
                本日の連絡
              </h3>
              <div className="space-y-3">
                {filteredAndSortedContacts
                  .filter(c => {
                    const today = new Date().toDateString();
                    return new Date(c.deadline).toDateString() === today && c.status === 'pending';
                  })
                  .map(contact => (
                    <div key={contact.id} className="bg-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100 animate-fadeInUp">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-navy-800">{contact.name}</h4>
                          <p className="text-xs text-navy-600 mt-1">{contact.purpose}</p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2 ${getCategoryDisplay(contact.category).color}`}>
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
                  <div className="text-center py-8">
                  <div className="text-red-300 text-4xl mb-2">🎆</div>
                  <p className="text-red-400 font-medium">本日の連絡はありません</p>
                </div>
                )}
              </div>
            </div>

            {/* 期限切れ */}
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-2xl p-6 border border-orange-200">
              <h3 className="text-xl font-bold text-orange-800 mb-6 sticky top-0 bg-gradient-to-r from-orange-50 to-orange-100 py-3 rounded-xl flex items-center gap-2">
                <span className="bg-orange-200 p-2 rounded-lg">⚠️</span>
                期限切れ
              </h3>
              <div className="space-y-3">
                {filteredAndSortedContacts
                  .filter(c => {
                    const today = new Date();
                    const deadline = new Date(c.deadline);
                    return deadline < today && deadline.toDateString() !== today.toDateString() && c.status === 'pending';
                  })
                  .map(contact => (
                    <div key={contact.id} className="bg-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100 animate-fadeInUp">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-navy-800">{contact.name}</h4>
                          <p className="text-xs text-navy-600 mt-1">{contact.purpose}</p>
                          <p className="text-xs text-orange-700 font-bold mt-1">
                            {new Date(contact.deadline).toLocaleDateString('ja-JP')}
                          </p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2 ${getCategoryDisplay(contact.category).color}`}>
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
                  <div className="text-center py-8">
                  <div className="text-orange-300 text-4xl mb-2">🎉</div>
                  <p className="text-orange-400 font-medium">期限切れはありません</p>
                </div>
                )}
              </div>
            </div>

            {/* 今後の予定 */}
            <div className="bg-gradient-to-br from-navy-50 to-navy-100 rounded-2xl p-6 border border-navy-200">
              <h3 className="text-xl font-bold text-navy-800 mb-6 sticky top-0 bg-gradient-to-r from-navy-50 to-navy-100 py-3 rounded-xl flex items-center gap-2">
                <span className="bg-navy-200 p-2 rounded-lg">📅</span>
                今後の予定
              </h3>
              <div className="space-y-3">
                {filteredAndSortedContacts
                  .filter(c => {
                    const today = new Date();
                    const deadline = new Date(c.deadline);
                    return deadline > today && c.status === 'pending';
                  })
                  .map(contact => (
                    <div key={contact.id} className="bg-white rounded-xl p-4 shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100 animate-fadeInUp">
                      <div className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <h4 className="font-bold text-sm text-navy-800">{contact.name}</h4>
                          <p className="text-xs text-navy-600 mt-1">{contact.purpose}</p>
                          <p className="text-xs text-navy-700 font-bold mt-1">
                            {new Date(contact.deadline).toLocaleDateString('ja-JP')}
                          </p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2 ${getCategoryDisplay(contact.category).color}`}>
                            {getCategoryDisplay(contact.category).label}
                          </span>
                          {contact.recurring && (
                            <span className="block text-xs text-navy-500 font-medium mt-1">
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
                  <div className="text-center py-8">
                  <div className="text-navy-300 text-4xl mb-2">😌</div>
                  <p className="text-navy-400 font-medium">今後の予定はありません</p>
                </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
