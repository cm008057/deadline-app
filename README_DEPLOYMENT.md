# デプロイ手順

## 方法1: Vercel + Supabase でのデプロイ（推奨）

### ステップ1: Supabaseのセットアップ

1. [Supabase](https://supabase.com) にアクセスしてアカウント作成
2. 新しいプロジェクトを作成
3. SQL Editorで以下のテーブルを作成：

```sql
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  deadline DATE NOT NULL,
  status TEXT DEFAULT 'pending',
  recurring TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  user_id TEXT
);

-- RLS（Row Level Security）を有効化
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- ポリシーを作成（全ユーザーがアクセス可能）
CREATE POLICY "Enable all access for all users" ON contacts
  FOR ALL USING (true) WITH CHECK (true);
```

4. Settings > API から以下を取得：
   - Project URL
   - anon public key

### ステップ2: 環境変数の設定

`.env.local` ファイルを作成：

```
NEXT_PUBLIC_SUPABASE_URL=your_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

### ステップ3: Supabase クライアントのインストール

```bash
npm install @supabase/supabase-js
```

### ステップ4: Vercelへのデプロイ

1. GitHubにリポジトリをプッシュ
2. [Vercel](https://vercel.com) でアカウント作成
3. GitHubリポジトリをインポート
4. 環境変数を設定（Supabaseの情報）
5. デプロイ

---

## 方法2: Netlify + Firebase でのデプロイ

### ステップ1: Firebaseのセットアップ

1. [Firebase Console](https://console.firebase.google.com) でプロジェクト作成
2. Firestore Database を作成（テストモードで開始）
3. プロジェクト設定から設定情報を取得

### ステップ2: Firebase設定

`.env.local` ファイル：

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### ステップ3: Firebaseクライアントのインストール

```bash
npm install firebase
```

### ステップ4: Netlifyへのデプロイ

```bash
npm run build
# distフォルダをNetlifyにドラッグ&ドロップ
```

---

## セキュリティ考慮事項

### ユーザー認証を追加する場合

1. **Supabase Auth** または **Firebase Auth** を使用
2. ユーザーごとにデータを分離
3. RLS（Row Level Security）でアクセス制御

### 本番環境のチェックリスト

- [ ] HTTPS の有効化（Vercel/Netlifyは自動）
- [ ] 環境変数の適切な管理
- [ ] データベースのバックアップ設定
- [ ] エラーログの監視
- [ ] レート制限の設定

---

## 推奨構成

**小規模・個人利用**
- Vercel（ホスティング）+ Supabase（DB）
- 無料枠で十分運用可能
- セットアップが簡単

**中規模・チーム利用**
- Vercel Pro + Supabase Pro
- またはAWS/Google Cloud
- 認証機能必須

**必要な月額費用（目安）**
- 個人利用：0円（無料枠内）
- 小規模チーム：2,000円程度
- 中規模：5,000円〜

## サポート

問題が発生した場合は、各サービスのドキュメントを参照：
- [Vercel Docs](https://vercel.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)