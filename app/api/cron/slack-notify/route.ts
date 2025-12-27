import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase クライアント（サーバーサイド用）
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Slack Webhook URL
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL || '';

export async function GET(request: Request) {
  // Cron認証（Vercelからのリクエストのみ許可）
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // 開発環境では認証をスキップ
    if (process.env.NODE_ENV === 'production' && process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    // 今日の日付を取得（日本時間）
    const today = new Date();
    const jstOffset = 9 * 60; // JST is UTC+9
    const jstDate = new Date(today.getTime() + (jstOffset + today.getTimezoneOffset()) * 60000);
    const todayStr = jstDate.toISOString().split('T')[0];

    // 当日期日 & 優先度A/B & 未完了のcontactsを取得
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('deadline', todayStr)
      .eq('status', 'pending')
      .in('priority', ['A', 'B'])
      .order('priority', { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }

    // 通知するcontactsがない場合
    if (!contacts || contacts.length === 0) {
      console.log('No contacts to notify for today');
      return NextResponse.json({ message: 'No contacts to notify', date: todayStr });
    }

    // Slackメッセージを作成
    const priorityA = contacts.filter(c => c.priority === 'A');
    const priorityB = contacts.filter(c => c.priority === 'B');

    let message = `📅 *本日の期日* (${todayStr})\n\n`;

    if (priorityA.length > 0) {
      message += `🔴 *【優先度A】*\n`;
      priorityA.forEach(c => {
        message += `• ${c.name} - ${c.purpose}\n`;
      });
      message += '\n';
    }

    if (priorityB.length > 0) {
      message += `🟡 *【優先度B】*\n`;
      priorityB.forEach(c => {
        message += `• ${c.name} - ${c.purpose}\n`;
      });
      message += '\n';
    }

    message += `━━━━━━━━━━━━━━━━━━\n`;
    message += `合計: ${contacts.length}件`;

    // Slackに送信
    const slackResponse = await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: message,
        username: '期日管理Bot',
        icon_emoji: ':calendar:',
      }),
    });

    if (!slackResponse.ok) {
      const errorText = await slackResponse.text();
      console.error('Slack error:', errorText);
      return NextResponse.json({ error: 'Slack notification failed' }, { status: 500 });
    }

    console.log(`Successfully notified ${contacts.length} contacts`);
    return NextResponse.json({
      success: true,
      date: todayStr,
      notified: contacts.length,
      contacts: contacts.map(c => ({ name: c.name, priority: c.priority })),
    });

  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

