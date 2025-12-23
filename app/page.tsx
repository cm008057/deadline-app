"use client";

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { contactsApi, isSupabaseConfigured, supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

type ContactStatus = 'pending' | 'completed';
type ContactCategory = string;

type ContactPriority = 'A' | 'B' | 'C';

interface Contact {
  id: string;
  name: string;
  purpose: string;
  deadline: string;
  status: ContactStatus;
  category: ContactCategory;
  priority?: ContactPriority; // 優先度 A > B > C
  customCategory?: string; // カスタムカテゴリー名
  createdAt: string;
  completedAt?: string;
  recurring?: string;
  recurringDays?: number; // X日おき
  recurringWeekday?: number; // 0-6 (日曜-土曜)
  order?: number; // 表示順序
  isOverdue?: boolean; // 期限切れフラグ
  originalDeadline?: string; // 元の期日（期限切れの場合）
}

export default function Home() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [name, setName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [deadline, setDeadline] = useState('');
  const [category, setCategory] = useState<ContactCategory>('customer');
  const [customCategory, setCustomCategory] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ContactCategory | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [useDatabase] = useState(() => isSupabaseConfigured());
  const [notificationEnabled, setNotificationEnabled] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('list');
  const [editMode, setEditMode] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPurpose, setEditPurpose] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editCategory, setEditCategory] = useState<string>('customer');
  const [editPriority, setEditPriority] = useState<ContactPriority>('C');
  const [priority, setPriority] = useState<ContactPriority>('C');
  const [sortMode, setSortMode] = useState<'auto' | 'manual' | 'created' | 'priority'>('priority');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [history, setHistory] = useState<Contact[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draggedContactId, setDraggedContactId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set()); // 一括選択用
  const [bulkSelectMode, setBulkSelectMode] = useState(false); // 一括選択モード
  const router = useRouter();

  // カスタムカテゴリを抽出する関数
  const extractCustomCategories = (contacts: Contact[]): string[] => {
    const standardCategories = ['advisor', 'agency', 'customer', 'other'];
    const allCategories = contacts.map(c => c.category).filter(Boolean);
    const customCats = [...new Set(allCategories.filter(cat => !standardCategories.includes(cat)))];
    return customCats;
  };

  // カテゴリ名から適切なアイコンを生成する関数
  const generateCategoryIcon = (categoryName: string): string => {
    const name = categoryName.toLowerCase();

    // キーワードベースでアイコンを選択
    if (name.includes('営業') || name.includes('セールス')) return '💼';
    if (name.includes('パートナー') || name.includes('提携')) return '🤝';
    if (name.includes('技術') || name.includes('エンジニア') || name.includes('開発')) return '⚙️';
    if (name.includes('マーケ') || name.includes('広告')) return '📢';
    if (name.includes('サポート') || name.includes('支援')) return '🛠️';
    if (name.includes('投資') || name.includes('ファンド')) return '💰';
    if (name.includes('法務') || name.includes('弁護士')) return '⚖️';
    if (name.includes('会計') || name.includes('税理士')) return '📊';
    if (name.includes('研究') || name.includes('学術')) return '🔬';
    if (name.includes('メディア') || name.includes('報道')) return '📺';
    if (name.includes('政府') || name.includes('行政')) return '🏛️';
    if (name.includes('病院') || name.includes('医療')) return '🏥';
    if (name.includes('学校') || name.includes('教育')) return '🎓';
    if (name.includes('金融') || name.includes('銀行')) return '🏦';
    if (name.includes('不動産')) return '🏘️';
    if (name.includes('製造') || name.includes('工場')) return '🏭';
    if (name.includes('物流') || name.includes('配送')) return '🚚';
    if (name.includes('小売') || name.includes('店舗')) return '🏪';
    if (name.includes('飲食') || name.includes('レストラン')) return '🍽️';
    if (name.includes('旅行') || name.includes('観光')) return '✈️';
    if (name.includes('イベント') || name.includes('企画')) return '🎪';
    if (name.includes('デザイン') || name.includes('クリエイティブ')) return '🎨';
    if (name.includes('コンサル')) return '📝';
    if (name.includes('人材') || name.includes('採用')) return '👔';

    // デフォルトアイコン（ランダム要素を加えて重複を避ける）
    const defaultIcons = ['🌟', '🚀', '💎', '🎯', '⭐', '🔥', '✨', '🎉', '🌈', '🎪'];
    const index = categoryName.length % defaultIcons.length;
    return defaultIcons[index];
  };

  // 期限切れチェックと自動修正
  const checkAndFixOverdueContacts = (contacts: Contact[]): Contact[] => {
    const today = new Date().toISOString().split('T')[0];

    return contacts.map(contact => {
      const contactDate = new Date(contact.deadline);
      const todayDate = new Date(today);

      // 期限切れかつ未完了の場合
      if (contactDate < todayDate && contact.status === 'pending') {
        return {
          ...contact,
          originalDeadline: contact.originalDeadline || contact.deadline, // 初回のみ元の期日を保存
          deadline: today, // 期日を今日に修正
          isOverdue: true // 期限切れフラグを設定
        };
      }

      return contact;
    });
  };

  // 履歴を保存する関数
  const saveToHistory = (newContacts: Contact[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push([...newContacts]);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Undo機能
  const undo = () => {
    if (historyIndex > 0) {
      const previousState = history[historyIndex - 1];
      setContacts(previousState);
      setHistoryIndex(historyIndex - 1);
    }
  };

  // Redo機能
  const redo = () => {
    if (historyIndex < history.length - 1) {
      const nextState = history[historyIndex + 1];
      setContacts(nextState);
      setHistoryIndex(historyIndex + 1);
    }
  };

  const loadContacts = useCallback(async () => {
    setLoading(true);

    if (useDatabase && user) {
      // Supabaseから読み込み（ユーザー固有のデータ + 移行前のデータ）
      const userContacts = await contactsApi.getAll(user.id);
      const legacyContacts = await contactsApi.getAll(undefined); // user_idがNULLのデータ
      const dbContacts = [...userContacts, ...legacyContacts];

      // 移行前のデータ（user_idがNULL）がある場合、現在のユーザーに紐付ける
      if (legacyContacts.length > 0) {
        console.log('移行前のデータを発見。ユーザーに紐付けています...');
        for (const contact of legacyContacts) {
          if (contact.id) {
            await contactsApi.update(contact.id, { user_id: user.id });
          }
        }
        // 更新後、再度読み込み
        const updatedContacts = await contactsApi.getAll(user.id);
        const formattedContacts: Contact[] = updatedContacts.map(dbContact => ({
          id: dbContact.id || '',
          name: dbContact.name,
          purpose: dbContact.purpose,
          deadline: dbContact.deadline,
          status: dbContact.status,
          category: dbContact.category || 'customer',
          priority: dbContact.priority || 'C',
          createdAt: dbContact.created_at || '',
          completedAt: dbContact.completed_at || undefined,
          recurring: dbContact.recurring
        }));

        // 期限切れチェックと修正
        const checkedContacts = checkAndFixOverdueContacts(formattedContacts);
        setContacts(checkedContacts);

        // カスタムカテゴリを抽出
        const customCats = extractCustomCategories(checkedContacts);
        setCustomCategories(customCats);

        setLoading(false);
        return;
      }

      // LocalStorageにデータがあり、Supabaseが空の場合、自動マイグレーション
      // 旧キー名もチェック
      const stored = localStorage.getItem('contacts') || localStorage.getItem('agent-details');
      if (stored && dbContacts.length === 0) {
        const localContacts = JSON.parse(stored);
        console.log('自動マイグレーション: LocalStorage → Supabase');

        // LocalStorageのデータをSupabaseに移行
        for (const contact of localContacts) {
          await contactsApi.create({
            name: contact.name,
            purpose: contact.purpose,
            deadline: contact.deadline,
            status: contact.status || 'pending',
            category: contact.category || 'customer',
            recurring: contact.recurring,
            recurring_days: contact.recurringDays,
            recurring_weekday: contact.recurringWeekday,
            order: contact.order || 0,
            user_id: user.id
          });
        }

        // マイグレーション完了後、LocalStorageをクリア
        localStorage.removeItem('contacts');
        localStorage.removeItem('agent-details');
        alert('以前のデータを正常に移行しました');

        // 再度Supabaseからデータを取得
        const migratedContacts = await contactsApi.getAll(user.id);
        const formattedContacts: Contact[] = migratedContacts.map(dbContact => ({
          id: dbContact.id || '',
          name: dbContact.name,
          purpose: dbContact.purpose,
          deadline: dbContact.deadline,
          status: dbContact.status,
          category: dbContact.category || 'customer',
          priority: dbContact.priority || 'C',
          createdAt: dbContact.created_at || '',
          completedAt: dbContact.completed_at || undefined,
          recurring: dbContact.recurring
        }));

        // 期限切れチェックと修正
        const checkedContacts = checkAndFixOverdueContacts(formattedContacts);
        setContacts(checkedContacts);

        // カスタムカテゴリを抽出
        const customCats = extractCustomCategories(checkedContacts);
        setCustomCategories(customCats);
      } else {
        // 通常のデータ読み込み
        const formattedContacts: Contact[] = dbContacts.map(dbContact => ({
          id: dbContact.id || '',
          name: dbContact.name,
          purpose: dbContact.purpose,
          deadline: dbContact.deadline,
          status: dbContact.status,
          category: dbContact.category || 'customer',
          priority: dbContact.priority || 'C',
          createdAt: dbContact.created_at || '',
          completedAt: dbContact.completed_at || undefined,
          recurring: dbContact.recurring
        }));

        // 期限切れチェックと修正
        const checkedContacts = checkAndFixOverdueContacts(formattedContacts);
        setContacts(checkedContacts);

        // カスタムカテゴリを抽出
        const customCats = extractCustomCategories(checkedContacts);
        setCustomCategories(customCats);
      }
    } else if (!useDatabase) {
      // LocalStorageから読み込み（ログインなしモード）
      const stored = localStorage.getItem('contacts') || localStorage.getItem('agent-details');
      if (stored) {
        const parsedContacts = JSON.parse(stored).map((contact: Contact) => ({
          ...contact,
          category: contact.category || 'customer'
        }));

        // 期限切れチェックと修正
        const checkedContacts = checkAndFixOverdueContacts(parsedContacts);
        setContacts(checkedContacts);

        // カスタムカテゴリを抽出
        const customCats = extractCustomCategories(checkedContacts);
        setCustomCategories(customCats);
      }

      // LocalStorageからカスタムカテゴリも読み込み（バックアップとして）
      const storedCategories = localStorage.getItem('customCategories');
      if (storedCategories) {
        const localCustomCats = JSON.parse(storedCategories);
        setCustomCategories(prev => [...new Set([...prev, ...localCustomCats])]);
      }
    }

    setLoading(false);
  }, [useDatabase, user]);

  // 認証状態の確認
  useEffect(() => {
    const checkAuth = async () => {
      if (!useDatabase) {
        setAuthLoading(false);
        return;
      }

      try {
        const { data: { session } } = await supabase!.auth.getSession();
        if (session?.user) {
          setUser(session.user);
        } else {
          router.push('/auth');
          return;
        }
      } catch (error) {
        console.error('Auth check failed:', error);
        router.push('/auth');
        return;
      }
      setAuthLoading(false);
    };

    checkAuth();

    // 認証状態の変更を監視
    if (useDatabase && supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if (session?.user) {
            setUser(session.user);
          } else {
            setUser(null);
            router.push('/auth');
          }
        }
      );

      return () => subscription.unsubscribe();
    }
  }, [router, useDatabase]);

  // データの読み込み
  useEffect(() => {
    if (user || !useDatabase) {
      loadContacts();
    }
  }, [loadContacts, user, useDatabase]);

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
    setEditPriority(contact.priority || 'C');
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
        category: editCategory,
        priority: editPriority
      });
    }

    const updatedContacts = contacts.map(c =>
      c.id === id
        ? { ...c, name: editName, purpose: editPurpose, deadline: editDeadline, category: editCategory, priority: editPriority, isOverdue: false, originalDeadline: undefined }
        : c
    );
    // 期限切れチェック
    const checkedContacts = checkAndFixOverdueContacts(updatedContacts);
    setContacts(checkedContacts);
    setEditMode(null);
  };

  // 編集キャンセル
  const cancelEdit = () => {
    setEditMode(null);
    setEditName('');
    setEditPurpose('');
    setEditDeadline('');
    setEditCategory('customer');
    setEditPriority('C');
  };

  // 削除
  const deleteContact = async (id: string) => {
    if (!confirm('この連絡先を削除してもよろしいですか？')) return;

    if (useDatabase) {
      await contactsApi.delete(id);
    }
    setContacts(contacts.filter(c => c.id !== id));
  };

  // 一括選択の切り替え
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // 全選択/全解除
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredAndSortedContacts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedContacts.map(c => c.id)));
    }
  };

  // 一括優先度設定
  const bulkSetPriority = async (newPriority: ContactPriority) => {
    if (selectedIds.size === 0) {
      alert('連絡先を選択してください');
      return;
    }

    setLoading(true);

    // 履歴を保存
    saveToHistory(contacts);

    const updatedContacts = contacts.map(contact => {
      if (selectedIds.has(contact.id)) {
        return { ...contact, priority: newPriority };
      }
      return contact;
    });

    // データベースを更新
    if (useDatabase) {
      for (const id of selectedIds) {
        await contactsApi.update(id, { priority: newPriority });
      }
    }

    setContacts(updatedContacts);
    setSelectedIds(new Set());
    setBulkSelectMode(false);
    setLoading(false);
    alert(`${selectedIds.size}件の優先度を ${newPriority} に設定しました`);
  };

  // 期限切れを一括で本日に更新
  const bulkUpdateOverdueToToday = async () => {
    const today = new Date().toISOString().split('T')[0];
    const overdueContacts = contacts.filter(c => c.isOverdue && c.status === 'pending');

    if (overdueContacts.length === 0) {
      alert('期限切れの連絡先はありません');
      return;
    }

    if (!confirm(`${overdueContacts.length}件の期限切れを本日(${today})に更新しますか？`)) {
      return;
    }

    setLoading(true);

    // 履歴を保存
    saveToHistory(contacts);

    const updatedContacts = contacts.map(contact => {
      if (contact.isOverdue && contact.status === 'pending') {
        return {
          ...contact,
          deadline: today,
          isOverdue: false,
          originalDeadline: undefined
        };
      }
      return contact;
    });

    // データベースを更新
    if (useDatabase) {
      for (const contact of overdueContacts) {
        await contactsApi.update(contact.id, {
          deadline: today
        });
      }
    }

    setContacts(updatedContacts);
    setLoading(false);
    alert(`${overdueContacts.length}件の期日を本日に更新しました`);
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

    // カスタムカテゴリの処理
    if (category === 'other' && customCategory && !customCategories.includes(customCategory)) {
      const newCategories = [...customCategories, customCategory];
      setCustomCategories(newCategories);
      localStorage.setItem('customCategories', JSON.stringify(newCategories));
    }

    const finalCategory = category === 'other' ? (customCategory || 'other') : category;

    setLoading(true);

    if (useDatabase) {
      // Supabaseに保存（ユーザーIDを含める）
      const dbContact = await contactsApi.create({
        name,
        purpose,
        deadline,
        status: 'pending',
        category: finalCategory,
        priority,
        user_id: user?.id
      });

      if (dbContact) {
        const newContact: Contact = {
          id: dbContact.id || '',
          name: dbContact.name,
          purpose: dbContact.purpose,
          deadline: dbContact.deadline,
          status: dbContact.status,
          category: dbContact.category || 'customer',
          priority: dbContact.priority || 'C',
          customCategory: category === 'other' ? customCategory : undefined,
          createdAt: dbContact.created_at || '',
          completedAt: dbContact.completed_at || undefined,
          recurring: dbContact.recurring
        };
        // 期限切れチェック
        const checkedContact = checkAndFixOverdueContacts([newContact])[0];
        setContacts([...contacts, checkedContact]);
      }
    } else {
      // LocalStorageに保存
      const newContact: Contact = {
        id: Date.now().toString(),
        name,
        purpose,
        deadline,
        status: 'pending',
        category: finalCategory,
        priority,
        customCategory: category === 'other' ? customCategory : undefined,
        createdAt: new Date().toISOString(),
      };
      // 期限切れチェック
      const checkedContact = checkAndFixOverdueContacts([newContact])[0];
      setContacts([...contacts, checkedContact]);
    }

    setName('');
    setPurpose('');
    setDeadline('');
    setCategory('customer');
    setPriority('C');
    setCustomCategory('');
    setShowCustomInput(false);
    setLoading(false);
  };

  // チェック/アンチェック
  const toggleComplete = async (id: string) => {
    const contact = contacts.find(c => c.id === id);
    if (!contact) return;

    // 現在の状態を履歴に保存
    saveToHistory(contacts);

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
    const updatedContacts: Contact[] = contacts.map(contact => {
      if (contact.id === id) {
        if (newStatus === 'completed') {
          setEditingId(id);
          return { ...contact, status: 'completed' as ContactStatus, completedAt };
        } else {
          return { ...contact, status: 'pending' as ContactStatus, completedAt: undefined };
        }
      }
      return contact;
    });
    setContacts(updatedContacts);
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

  // 優先度の数値変換（A=1, B=2, C=3）
  const getPriorityValue = (priority?: ContactPriority): number => {
    switch (priority) {
      case 'A': return 1;
      case 'B': return 2;
      case 'C': return 3;
      default: return 3; // 未設定はCと同じ
    }
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

      // 検索フィルタ（名前と目的で検索）
      const matchesSearch = searchQuery === '' ||
        contact.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        contact.purpose.toLowerCase().includes(searchQuery.toLowerCase());

      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      // 手動ソートモードの場合はスキップ
      if (sortMode === 'manual') return 0;

      // 追加順ソートモードの場合
      if (sortMode === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }

      // ソートに使用する期日（期限切れの場合は元の期日、そうでなければ現在の期日）
      const getSortDate = (contact: Contact) => {
        return contact.isOverdue && contact.originalDeadline
          ? contact.originalDeadline
          : contact.deadline;
      };

      const aSortDate = getSortDate(a);
      const bSortDate = getSortDate(b);

      // 優先度順モードの場合：優先度 > 期日
      if (sortMode === 'priority') {
        const priorityDiff = getPriorityValue(a.priority) - getPriorityValue(b.priority);
        if (priorityDiff !== 0) return priorityDiff;
        // 優先度が同じ場合は期日順
        return new Date(aSortDate).getTime() - new Date(bSortDate).getTime();
      }

      // 期日順（auto）：期限切れも元の期日で並ぶ、完了済みも同じ位置に残る
      return new Date(aSortDate).getTime() - new Date(bSortDate).getTime();
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

  // 追加日時フォーマット
  const formatCreatedAt = (createdAt: string) => {
    if (!createdAt) return '';
    const date = new Date(createdAt);
    return date.toLocaleDateString('ja-JP', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // ドラッグ&ドロップハンドラー
  const handleDragStart = (e: React.DragEvent, contactId: string) => {
    setDraggedContactId(contactId);
    e.dataTransfer.setData('text/plain', contactId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggedContactId(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetColumn: 'overdue' | 'today' | 'future') => {
    e.preventDefault();
    if (!draggedContactId) return;

    const contact = contacts.find(c => String(c.id) === String(draggedContactId));
    if (!contact) return;

    // 履歴を保存
    saveToHistory(contacts);

    let newDeadline: string;
    const today = new Date();

    // ローカルタイムゾーンで日付をフォーマット (YYYY-MM-DD)
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    if (targetColumn === 'today') {
      // 本日に移動 → 期日を今日に設定
      newDeadline = formatLocalDate(today);
    } else if (targetColumn === 'future') {
      // 今後に移動 → 期日を明日に設定
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      newDeadline = formatLocalDate(tomorrow);
    } else {
      // 期限切れには基本的にドロップしない（過去の日付は設定しない）
      setDraggedContactId(null);
      return;
    }

    // データベースを更新
    if (useDatabase) {
      await contactsApi.update(draggedContactId, {
        deadline: newDeadline
      });
    }

    // ローカル状態を更新
    const updatedContacts = contacts.map(c => {
      if (String(c.id) === String(draggedContactId)) {
        return {
          ...c,
          deadline: newDeadline,
          isOverdue: false,
          originalDeadline: undefined
        };
      }
      return c;
    });

    // 期限切れチェック
    const checkedContacts = checkAndFixOverdueContacts(updatedContacts);
    setContacts(checkedContacts);
    setDraggedContactId(null);
  };

  // カテゴリ表示用
  const getCategoryDisplay = (category: ContactCategory | undefined) => {
    const categories: Record<string, { label: string; emoji: string; color: string }> = {
      advisor: { label: '顧問', emoji: '🎯', color: 'bg-gradient-to-r from-blue-600 to-blue-700 text-white' },
      agency: { label: '代理店', emoji: '🏢', color: 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white' },
      customer: { label: '顧客', emoji: '👥', color: 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white' },
      other: { label: 'その他', emoji: '📌', color: 'bg-gradient-to-r from-gray-600 to-slate-600 text-white' }
    };

    // カスタムカテゴリの場合
    if (category && !['advisor', 'agency', 'customer', 'other'].includes(category)) {
      return {
        label: category,
        emoji: generateCategoryIcon(category),
        color: 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white'
      };
    }

    return categories[category || 'customer'];
  };

  // ログアウト
  const handleLogout = async () => {
    if (useDatabase && supabase) {
      await supabase.auth.signOut();
      router.push('/auth');
    }
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

  // 認証ローディング中
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-slate-800 via-blue-800 to-indigo-800 text-white border-b border-blue-700/50">
        <div className="max-w-6xl mx-auto px-4 py-4 sm:py-5 lg:py-6">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-center sm:text-left sm:flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-black text-white mb-1 tracking-tight">
                期日管理システム
              </h1>
              <p className="text-xs sm:text-sm lg:text-base text-blue-100 font-light">
                顧問・代理店・顧客との連絡を効率的に管理
              </p>
            </div>
            {useDatabase && user && (
              <div className="flex flex-row items-center gap-2 sm:gap-4 text-white">
                <span className="text-xs sm:text-sm opacity-75 truncate max-w-[120px] sm:max-w-[200px]">{user.email}</span>
                <button
                  onClick={handleLogout}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-all text-xs sm:text-sm font-medium whitespace-nowrap"
                >
                  ログアウト
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-3 sm:px-4 lg:px-5 py-3 sm:py-4 lg:py-5">

        {/* 入力フォーム */}
        <div className="bg-white/95 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-xl border border-white/20 p-3 sm:p-4 lg:p-5 mb-3 sm:mb-4">
          <h2 className="text-base sm:text-lg lg:text-xl font-black text-slate-800 mb-3 sm:mb-4">
            📝 新規登録
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="relative">
              <input
                type="text"
                placeholder="お名前"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 sm:px-3 sm:py-2.5 lg:py-2 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-xs sm:text-sm lg:text-sm text-gray-800 placeholder-gray-400"
              />
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="連絡の目的"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-3 py-2 sm:px-3 sm:py-2.5 lg:py-2 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-xs sm:text-sm lg:text-sm text-gray-800 placeholder-gray-400"
              />
            </div>
            <div className="relative">
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2 sm:px-3 sm:py-2.5 lg:py-2 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-xs sm:text-sm lg:text-sm text-gray-800"
              />
            </div>
            <div className="flex gap-2">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as ContactPriority)}
                className="w-24 px-3 py-2 sm:px-3 sm:py-2.5 lg:py-2 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-xs sm:text-sm lg:text-sm text-gray-800 appearance-none cursor-pointer font-bold"
              >
                <option value="A">🔴 A</option>
                <option value="B">🟡 B</option>
                <option value="C">🟢 C</option>
              </select>
              <select
                value={category}
                onChange={(e) => {
                  const val = e.target.value as ContactCategory;
                  setCategory(val);
                  setShowCustomInput(val === 'other');
                }}
                className="flex-1 px-3 py-2 sm:px-3 sm:py-2.5 lg:py-2 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-xs sm:text-sm lg:text-sm text-gray-800 appearance-none cursor-pointer"
              >
                <option value="customer">👥 顧客</option>
                <option value="advisor">🎯 顧問</option>
                <option value="agency">🏢 代理店</option>
                {customCategories.map(cat => (
                  <option key={cat} value={cat}>{generateCategoryIcon(cat)} {cat}</option>
                ))}
                <option value="other">📌 その他（新規追加）</option>
              </select>
              {showCustomInput && (
                <input
                  type="text"
                  placeholder="カテゴリ名入力"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  className="flex-1 px-3 py-2 sm:px-3 sm:py-2.5 lg:py-2 bg-gray-50 border border-gray-200 rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-xs sm:text-sm lg:text-sm text-gray-800 placeholder-gray-400"
                />
              )}
            </div>
            <button
              onClick={handleAdd}
              disabled={loading}
              className="relative px-3 py-2 sm:px-4 sm:py-2.5 lg:py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs sm:text-sm lg:text-sm rounded-lg sm:rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-300 disabled:opacity-50 shadow-lg hover:shadow-xl sm:hover:scale-105 transform"
            >
              <span className="relative z-10">
                {loading ? '追加中...' : '予定を追加'}
              </span>
            </button>
          </div>
        </div>

        {/* フィルタ・表示モード切替 */}
        <div className="bg-white/80 backdrop-blur-lg rounded-2xl sm:rounded-3xl shadow-lg border border-white/20 p-3 sm:p-4 lg:p-6 mb-4 sm:mb-6">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="🔍 名前や目的で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm bg-white border border-gray-200 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-gray-700 placeholder-gray-400"
              />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value as ContactCategory | 'all')}
                className="px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm bg-gradient-to-r from-gray-50 to-gray-100 border border-gray-200 rounded-xl sm:rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-gray-700 cursor-pointer hover:bg-gradient-to-r hover:from-gray-100 hover:to-gray-200"
              >
                <option value="all">🎨 全カテゴリ</option>
                <option value="customer">👥 顧客のみ</option>
                <option value="advisor">🎯 顧問のみ</option>
                <option value="agency">🏢 代理店のみ</option>
                {customCategories.map(cat => (
                  <option key={cat} value={cat}>{generateCategoryIcon(cat)} {cat}のみ</option>
                ))}
                <option value="other">📌 その他のみ</option>
              </select>
              <button
                onClick={() => setViewMode(viewMode === 'list' ? 'kanban' : 'list')}
                className="px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-700 font-semibold rounded-xl sm:rounded-2xl hover:from-indigo-100 hover:to-purple-100 transition-all duration-200 border border-indigo-200/50"
              >
                {viewMode === 'list' ? '📊 ボード表示' : '📋 リスト表示'}
              </button>
              <button
                onClick={() => setSortMode(sortMode === 'priority' ? 'auto' : sortMode === 'auto' ? 'created' : sortMode === 'created' ? 'manual' : 'priority')}
                className="px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 font-semibold rounded-xl sm:rounded-2xl hover:from-purple-100 hover:to-pink-100 transition-all duration-200 border border-purple-200/50"
              >
                {sortMode === 'priority' ? '🎯 優先度順' : sortMode === 'auto' ? '⚡ 期日順' : sortMode === 'created' ? '🕐 追加順' : '✋ 手動'}
              </button>
              <button
                onClick={() => {
                  setBulkSelectMode(!bulkSelectMode);
                  if (bulkSelectMode) setSelectedIds(new Set());
                }}
                className={`px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl sm:rounded-2xl transition-all duration-200 border ${
                  bulkSelectMode
                    ? 'bg-gradient-to-r from-amber-400 to-orange-400 text-white border-amber-300 shadow-lg'
                    : 'bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 border-amber-200/50 hover:from-amber-100 hover:to-orange-100'
                }`}
              >
                {bulkSelectMode ? '✅ 選択モード中' : '☑️ 一括選択'}
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={undo}
                  disabled={historyIndex <= 0}
                  className="p-2 bg-gradient-to-r from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200"
                  title="元に戻す"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
                <button
                  onClick={redo}
                  disabled={historyIndex >= history.length - 1}
                  className="p-2 bg-gradient-to-r from-slate-50 to-slate-100 hover:from-slate-100 hover:to-slate-200 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed border border-slate-200"
                  title="やり直す"
                >
                  <svg className="w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2m18-10l-6 6m6-6l-6-6" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={bulkUpdateOverdueToToday}
                disabled={loading || contacts.filter(c => c.isOverdue && c.status === 'pending').length === 0}
                className={`px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl sm:rounded-2xl transition-all duration-200 ${
                  contacts.filter(c => c.isOverdue && c.status === 'pending').length > 0
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white hover:from-orange-600 hover:to-red-600 shadow-lg hover:shadow-xl'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'
                }`}
              >
                ⚡ 期限切れを本日に ({contacts.filter(c => c.isOverdue && c.status === 'pending').length}件)
              </button>
              <button
                onClick={enableNotifications}
                className={`px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm font-semibold rounded-xl sm:rounded-2xl transition-all duration-200 ${
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
        </div>

        {/* 一括優先度設定パネル */}
        {bulkSelectMode && (
          <div className="bg-gradient-to-r from-amber-50 to-orange-50 backdrop-blur-lg rounded-2xl sm:rounded-3xl shadow-lg border-2 border-amber-300 p-3 sm:p-4 lg:p-5 mb-4 sm:mb-6">
            <div className="flex flex-wrap gap-3 items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm sm:text-base font-bold text-amber-800">
                  📋 {selectedIds.size}件選択中
                </span>
                <button
                  onClick={toggleSelectAll}
                  className="px-3 py-1.5 text-xs sm:text-sm bg-white text-amber-700 font-semibold rounded-lg hover:bg-amber-100 transition-all duration-200 border border-amber-300"
                >
                  {selectedIds.size === filteredAndSortedContacts.length ? '全解除' : '全選択'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm font-medium text-amber-700">優先度を設定:</span>
                <button
                  onClick={() => bulkSetPriority('A')}
                  disabled={loading || selectedIds.size === 0}
                  className="px-4 py-2 text-sm font-black bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🔴 A
                </button>
                <button
                  onClick={() => bulkSetPriority('B')}
                  disabled={loading || selectedIds.size === 0}
                  className="px-4 py-2 text-sm font-black bg-yellow-400 text-gray-800 rounded-xl hover:bg-yellow-500 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🟡 B
                </button>
                <button
                  onClick={() => bulkSetPriority('C')}
                  disabled={loading || selectedIds.size === 0}
                  className="px-4 py-2 text-sm font-black bg-green-500 text-white rounded-xl hover:bg-green-600 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  🟢 C
                </button>
              </div>
            </div>
          </div>
        )}

        {/* リスト表示 */}
        {viewMode === 'list' ? (
          <div className="space-y-2 sm:space-y-3">
            {filteredAndSortedContacts.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-navy-300 text-6xl mb-4">📅</div>
                <h3 className="text-xl sm:text-2xl font-bold text-navy-700 mb-2">連絡先がありません</h3>
                <p className="text-navy-500">
                  {(selectedCategory !== 'all' || searchQuery !== '') ? '条件に一致する連絡先がありません' : '新しい連絡先を追加してみましょう'}
                </p>
              </div>
            ) : (
            filteredAndSortedContacts.map((contact) => (
              <div key={contact.id} className={`group bg-white rounded-lg sm:rounded-xl shadow-sm sm:shadow-md border p-3 sm:p-3.5 lg:p-4 sm:hover:shadow-lg transition-all duration-300 sm:hover:-translate-y-0.5 ${
                contact.status === 'completed' ? 'opacity-50 bg-gray-50/50 border-gray-100' : ''
              } ${bulkSelectMode && selectedIds.has(contact.id) ? 'border-amber-400 bg-amber-50/50 ring-2 ring-amber-200' : 'border-gray-100'}`}>
                <div className="flex items-start gap-3">
                  {bulkSelectMode && (
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      className="mt-0.5 w-5 h-5 lg:w-6 lg:h-6 cursor-pointer accent-amber-500"
                    />
                  )}
                  <input
                    type="checkbox"
                    checked={contact.status === 'completed'}
                    onChange={() => toggleComplete(contact.id)}
                    className="mt-0.5 w-4 h-4 lg:w-5 lg:h-5 cursor-pointer"
                  />
                  <div className="flex-1">
                    {editMode === contact.id ? (
                      // 編集モード
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
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <input
                            type="date"
                            value={editDeadline}
                            onChange={(e) => setEditDeadline(e.target.value)}
                            className="px-3 py-2 border-2 border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-all"
                          />
                          <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(e.target.value as ContactPriority)}
                            className="px-3 py-2 border-2 border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-all font-bold"
                          >
                            <option value="A">🔴 優先度 A</option>
                            <option value="B">🟡 優先度 B</option>
                            <option value="C">🟢 優先度 C</option>
                          </select>
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="px-3 py-2 border-2 border-navy-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-navy-500 transition-all"
                          >
                            <option value="customer">👥 顧客</option>
                            <option value="advisor">🎯 顧問</option>
                            <option value="agency">🏢 代理店</option>
                            {customCategories.map(cat => (
                              <option key={cat} value={cat}>{generateCategoryIcon(cat)} {cat}</option>
                            ))}
                            <option value="other">📌 その他</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(contact.id)}
                            className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white font-medium text-sm rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all duration-200 shadow-md hover:shadow-lg"
                          >
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-4 py-1.5 bg-gradient-to-r from-slate-500 to-slate-600 text-white font-medium text-sm rounded-lg hover:from-slate-600 hover:to-slate-700 transition-all duration-200 shadow-md hover:shadow-lg"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <h3 className="text-base sm:text-lg lg:text-xl font-bold text-gray-800">{contact.name}</h3>
                          <span className={`inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full text-xs font-black shadow-sm ${
                            contact.priority === 'A' ? 'bg-red-500 text-white' :
                            contact.priority === 'B' ? 'bg-yellow-400 text-gray-800' :
                            'bg-green-500 text-white'
                          }`}>
                            {contact.priority || 'C'}
                          </span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full text-xs font-semibold ${getCategoryDisplay(contact.category).color} shadow-sm`}>
                            <span>{getCategoryDisplay(contact.category).emoji}</span>
                            <span>{getCategoryDisplay(contact.category).label}</span>
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs sm:text-sm font-semibold px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg ${
                            new Date(contact.deadline).toDateString() === new Date().toDateString()
                              ? 'bg-red-100 text-red-700'
                              : new Date(contact.deadline) < new Date()
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}>
                            📅 {formatDeadline(contact.deadline)}
                            {contact.isOverdue && contact.originalDeadline && (
                              <span className="text-red-600 font-bold">
                                (期日{new Date(contact.originalDeadline).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })})
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="text-gray-600 text-xs sm:text-sm lg:text-base leading-relaxed mt-1.5 sm:mt-2">{contact.purpose}</p>
                        {contact.createdAt && (
                          <p className="text-gray-400 text-xs mt-1">
                            追加: {formatCreatedAt(contact.createdAt)}
                          </p>
                        )}

                        {/* アクションボタン */}
                        <div className="flex gap-1.5 mt-2">
                          <button
                            onClick={() => startEdit(contact)}
                            className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs bg-gradient-to-r from-indigo-50 to-blue-50 text-indigo-700 font-semibold rounded-lg hover:from-indigo-100 hover:to-blue-100 transition-all duration-200 border border-indigo-200/50"
                          >
                            ✂️ 編集
                          </button>
                          <button
                            onClick={() => deleteContact(contact.id)}
                            className="px-2.5 py-1 sm:px-3 sm:py-1.5 text-xs bg-gradient-to-r from-red-50 to-pink-50 text-red-700 font-semibold rounded-lg hover:from-red-100 hover:to-pink-100 transition-all duration-200 border border-red-200/50"
                          >
                            🗑️ 削除
                          </button>
                          {sortMode === 'manual' && (
                            <>
                              <button
                                onClick={() => moveContact(contact.id, 'up')}
                                className="px-2 py-1 text-xs bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-all duration-200"
                              >
                                ⬆️
                              </button>
                              <button
                                onClick={() => moveContact(contact.id, 'down')}
                                className="px-2 py-1 text-xs bg-slate-100 text-slate-700 font-medium rounded-lg hover:bg-slate-200 transition-all duration-200"
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
                      <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg sm:rounded-xl border border-indigo-200/50">
                        <p className="text-xs font-semibold text-indigo-800 mb-2">🎆 完了おめでとう！次のアクションを選択:</p>
                        <div className="space-y-2">
                          {/* 次回期日設定 */}
                          <div>
                            <p className="text-xs mb-1.5">次回期日を設定:</p>
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => {
                                  const tomorrow = new Date();
                                  tomorrow.setDate(tomorrow.getDate() + 1);
                                  setNextDeadline(contact.id, tomorrow.toISOString().split('T')[0]);
                                }}
                                className="px-2 py-1 sm:px-3 sm:py-1.5 text-xs bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-indigo-600 shadow-sm hover:shadow-md transition-all"
                              >
                                明日
                              </button>
                              <button
                                onClick={() => {
                                  const nextWeek = new Date();
                                  nextWeek.setDate(nextWeek.getDate() + 7);
                                  setNextDeadline(contact.id, nextWeek.toISOString().split('T')[0]);
                                }}
                                className="px-2 py-1 sm:px-3 sm:py-1.5 text-xs bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-indigo-600 shadow-sm hover:shadow-md transition-all"
                              >
                                1週間後
                              </button>
                              <button
                                onClick={() => {
                                  const nextMonth = new Date();
                                  nextMonth.setMonth(nextMonth.getMonth() + 1);
                                  setNextDeadline(contact.id, nextMonth.toISOString().split('T')[0]);
                                }}
                                className="px-2 py-1 sm:px-3 sm:py-1.5 text-xs bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-indigo-600 shadow-sm hover:shadow-md transition-all"
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
                            <p className="text-xs sm:text-sm mb-2">定期スケジュール:</p>
                            <div className="space-y-2">
                              {/* 基本オプション */}
                              <div className="flex gap-2 flex-wrap">
                                <button
                                  onClick={() => {
                                    const tomorrow = new Date();
                                    tomorrow.setDate(tomorrow.getDate() + 1);
                                    setNextDeadline(contact.id, tomorrow.toISOString().split('T')[0], 'daily');
                                  }}
                                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-lg sm:rounded-xl hover:from-emerald-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all"
                                >
                                  毎日
                                </button>
                                <button
                                  onClick={() => {
                                    const nextWeek = new Date();
                                    nextWeek.setDate(nextWeek.getDate() + 7);
                                    setNextDeadline(contact.id, nextWeek.toISOString().split('T')[0], 'weekly');
                                  }}
                                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-lg sm:rounded-xl hover:from-emerald-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all"
                                >
                                  毎週
                                </button>
                                <button
                                  onClick={() => {
                                    const nextMonth = new Date();
                                    nextMonth.setMonth(nextMonth.getMonth() + 1);
                                    setNextDeadline(contact.id, nextMonth.toISOString().split('T')[0], 'monthly');
                                  }}
                                  className="px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold rounded-lg sm:rounded-xl hover:from-emerald-600 hover:to-teal-600 shadow-md hover:shadow-lg transition-all"
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* 期限切れ */}
            <div
              className={`bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 border-2 transition-all duration-200 ${
                draggedContactId ? 'border-orange-300 border-dashed' : 'border-orange-200'
              }`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'overdue')}
            >
              <h3 className="text-sm sm:text-base font-bold text-orange-800 mb-3 sm:mb-4 sticky top-0 bg-gradient-to-r from-orange-50 to-orange-100 py-2 rounded-lg flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                期限切れ
                {draggedContactId && <span className="text-xs font-normal ml-auto opacity-50">ドロップ不可</span>}
              </h3>
              <div className="space-y-3 min-h-[100px]">
                {filteredAndSortedContacts
                  .filter(c => {
                    return c.isOverdue && c.status === 'pending';
                  })
                  .map(contact => (
                    <div
                      key={contact.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, contact.id)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-3 shadow-sm sm:shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100 ${
                        draggedContactId === contact.id ? 'opacity-50 scale-95' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 select-none" title="ドラッグして移動">
                          ⋮⋮
                        </div>
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-xs sm:text-sm text-navy-800">{contact.name}</h4>
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black ${
                              contact.priority === 'A' ? 'bg-red-500 text-white' :
                              contact.priority === 'B' ? 'bg-yellow-400 text-gray-800' :
                              'bg-green-500 text-white'
                            }`}>
                              {contact.priority || 'C'}
                            </span>
                          </div>
                          <p className="text-xs text-navy-600 mt-0.5 sm:mt-1 line-clamp-2">{contact.purpose}</p>
                          <p className="text-xs text-orange-700 font-bold mt-1">
                            {new Date(contact.deadline).toLocaleDateString('ja-JP')}
                            {contact.isOverdue && contact.originalDeadline && (
                              <span className="text-red-600 font-bold ml-1">
                                (期日{new Date(contact.originalDeadline).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })})
                              </span>
                            )}
                          </p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2 ${getCategoryDisplay(contact.category).color}`}>
                            {getCategoryDisplay(contact.category).label}
                          </span>
                          {contact.createdAt && (
                            <p className="text-gray-400 text-xs mt-1">追加: {formatCreatedAt(contact.createdAt)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                {filteredAndSortedContacts.filter(c => {
                  return c.isOverdue && c.status === 'pending';
                }).length === 0 && (
                  <div className="text-center py-8">
                  <div className="text-orange-300 text-4xl mb-2">🎉</div>
                  <p className="text-orange-400 font-medium">期限切れはありません</p>
                </div>
                )}
              </div>
            </div>

            {/* 本日 */}
            <div
              className={`bg-gradient-to-br from-red-50 to-red-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 border-2 transition-all duration-200 ${
                draggedContactId ? 'border-red-400 border-dashed ring-2 ring-red-200' : 'border-red-200'
              }`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'today')}
            >
              <h3 className="text-sm sm:text-base font-bold text-red-800 mb-3 sm:mb-4 sticky top-0 bg-gradient-to-r from-red-50 to-red-100 py-2 rounded-lg flex items-center gap-2">
                <span className="text-lg">🔴</span>
                本日の連絡
                {draggedContactId && <span className="text-xs font-normal ml-auto text-red-600">→ 期日を本日に</span>}
              </h3>
              <div className="space-y-3 min-h-[100px]">
                {filteredAndSortedContacts
                  .filter(c => {
                    const today = new Date().toDateString();
                    return new Date(c.deadline).toDateString() === today && c.status === 'pending' && !c.isOverdue;
                  })
                  .map(contact => (
                    <div
                      key={contact.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, contact.id)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-3 shadow-sm sm:shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100 ${
                        draggedContactId === contact.id ? 'opacity-50 scale-95' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 select-none" title="ドラッグして移動">
                          ⋮⋮
                        </div>
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-xs sm:text-sm text-navy-800">{contact.name}</h4>
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black ${
                              contact.priority === 'A' ? 'bg-red-500 text-white' :
                              contact.priority === 'B' ? 'bg-yellow-400 text-gray-800' :
                              'bg-green-500 text-white'
                            }`}>
                              {contact.priority || 'C'}
                            </span>
                          </div>
                          <p className="text-xs text-navy-600 mt-0.5 sm:mt-1 line-clamp-2">{contact.purpose}</p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2 ${getCategoryDisplay(contact.category).color}`}>
                            {getCategoryDisplay(contact.category).label}
                          </span>
                          {contact.createdAt && (
                            <p className="text-gray-400 text-xs mt-1">追加: {formatCreatedAt(contact.createdAt)}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                {filteredAndSortedContacts.filter(c => {
                  const today = new Date().toDateString();
                  return new Date(c.deadline).toDateString() === today && c.status === 'pending' && !c.isOverdue;
                }).length === 0 && (
                  <div className="text-center py-8">
                  <div className="text-red-300 text-4xl mb-2">🎆</div>
                  <p className="text-red-400 font-medium">本日の連絡はありません</p>
                </div>
                )}
              </div>
            </div>

            {/* 今後の予定 */}
            <div
              className={`bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl sm:rounded-2xl p-3 sm:p-4 border-2 transition-all duration-200 ${
                draggedContactId ? 'border-blue-400 border-dashed ring-2 ring-blue-200' : 'border-blue-200'
              }`}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'future')}
            >
              <h3 className="text-sm sm:text-base font-bold text-blue-800 mb-3 sm:mb-4 sticky top-0 bg-gradient-to-r from-blue-50 to-indigo-100 py-2 rounded-lg flex items-center gap-2">
                <span className="text-lg">📅</span>
                今後の予定
                {draggedContactId && <span className="text-xs font-normal ml-auto text-blue-600">→ 期日を明日に</span>}
              </h3>
              <div className="space-y-3 min-h-[100px]">
                {filteredAndSortedContacts
                  .filter(c => {
                    const today = new Date();
                    const deadline = new Date(c.deadline);
                    return deadline > today && c.status === 'pending';
                  })
                  .map(contact => (
                    <div
                      key={contact.id}
                      draggable={true}
                      onDragStart={(e) => handleDragStart(e, contact.id)}
                      onDragEnd={handleDragEnd}
                      className={`bg-white rounded-lg sm:rounded-xl p-2.5 sm:p-3 shadow-sm sm:shadow-md hover:shadow-lg transition-all duration-200 border border-gray-100 ${
                        draggedContactId === contact.id ? 'opacity-50 scale-95' : ''
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 select-none" title="ドラッグして移動">
                          ⋮⋮
                        </div>
                        <input
                          type="checkbox"
                          checked={contact.status === 'completed'}
                          onChange={() => toggleComplete(contact.id)}
                          className="mt-1 w-4 h-4 cursor-pointer"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-bold text-xs sm:text-sm text-navy-800">{contact.name}</h4>
                            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-xs font-black ${
                              contact.priority === 'A' ? 'bg-red-500 text-white' :
                              contact.priority === 'B' ? 'bg-yellow-400 text-gray-800' :
                              'bg-green-500 text-white'
                            }`}>
                              {contact.priority || 'C'}
                            </span>
                          </div>
                          <p className="text-xs text-navy-600 mt-0.5 sm:mt-1 line-clamp-2">{contact.purpose}</p>
                          <p className="text-xs text-blue-700 font-bold mt-1">
                            {new Date(contact.deadline).toLocaleDateString('ja-JP')}
                          </p>
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold mt-2 ${getCategoryDisplay(contact.category).color}`}>
                            {getCategoryDisplay(contact.category).label}
                          </span>
                          {contact.recurring && (
                            <span className="block text-xs text-blue-500 font-medium mt-1">
                              🔄 {contact.recurring === 'daily' ? '毎日' :
                                  contact.recurring === 'weekly' ? '毎週' :
                                  contact.recurring === 'monthly' ? '毎月' : ''}
                            </span>
                          )}
                          {contact.createdAt && (
                            <p className="text-gray-400 text-xs mt-1">追加: {formatCreatedAt(contact.createdAt)}</p>
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
                  <div className="text-blue-300 text-4xl mb-2">😌</div>
                  <p className="text-blue-400 font-medium">今後の予定はありません</p>
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
