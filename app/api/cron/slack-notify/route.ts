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
    const now = new Date();
    // 日本時間に変換
    const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
    const year = jstNow.getFullYear();
    const month = String(jstNow.getMonth() + 1).padStart(2, '0');
    const day = String(jstNow.getDate()).padStart(2, '0');
    const todayStr = `${year}-${month}-${day}`;
    
    console.log('Today (JST):', todayStr);

    // まず全データを取得してデバッグ
    const { data: allContacts, error: allError } = await supabase
      .from('contacts')
      .select('name, deadline, priority, status')
      .limit(5);
    
    console.log('All contacts sample:', allContacts);
    console.log('All contacts error:', allError);

    // 当日期日 & 優先度A & 未完了のcontactsを取得
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('deadline', todayStr)
      .eq('status', 'pending')
      .eq('priority', 'A')
      .order('name', { ascending: true });

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json({ error: 'Database error', details: error.message, allSample: allContacts }, { status: 500 });
    }

    console.log('Found contacts:', contacts?.length || 0);

    // 通知するcontactsがない場合
    if (!contacts || contacts.length === 0) {
      console.log('No contacts to notify for today');
      return NextResponse.json({ 
        message: 'No contacts to notify', 
        date: todayStr, 
        debug: { 
          supabaseUrl: !!supabaseUrl, 
          serviceKey: !!supabaseServiceKey,
          allSample: allContacts,
          allError: allError?.message
        } 
      });
    }

    // Slackメッセージを作成
    let message = `📅 *本日の期日* (${todayStr})\n\n`;
    message += `🔴 *【優先度A】* ${contacts.length}件\n\n`;

    contacts.forEach(c => {
      message += `• ${c.name} - ${c.purpose}\n`;
    });

    message += `\n━━━━━━━━━━━━━━━━━━`;

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

