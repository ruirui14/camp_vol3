# 画像変換 API

このプロジェクトは、Cloudflare Workers 上で動作する Hono アプリケーションです。アップロードされた画像を指定されたプロンプトに基づいて Google Gemini API を利用して変換し、変換後の画像を Base64 形式で返却します。

## 概要

ユーザーが画像をアップロードすると、この API は以下の処理を行います。

- **画像変換**: Google Gemini API の画像生成モデルを使用し、固定のプロンプトに基づいて画像を変換します。

## 使用技術

- **Cloudflare Workers**: サーバーレス実行環境
- **Hono**: Web フレームワーク (Cloudflare Workers に最適化)
- **TypeScript**: 静的型付け言語
- **Google Gemini API**: 画像生成および変換のための AI モデル

## 主な機能

- 指定された画像ファイルの服装をスーツに変更（顔、ポーズ、背景は維持）。
- 変換後の画像を `data:image/png;base64,...` 形式で返却。
- API のヘルスチェック機能。

## API エンドポイント

### 1. 画像変換

- **エンドポイント**:
  - `POST /api/transform/suit/camera` 首と胴体のみ
  - `POST /api/transform/suit/upload` 全身
- **リクエストタイプ**: `multipart/form-data`
- **フォームデータ**:
  - `image`: (File) 変換したい画像ファイル。
- **成功時のレスポンス (200 OK)**:
  ```json
  {
    "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAB4AAAAPyCAYAA..."
  }
  ```
  base64 エンコードされたデータが含まれます。
- **エラー時のレスポンス (400 Bad Request / 500 Internal Server Error)**:
  ```json
  {
    "error": "エラーメッセージ"
  }
  ```
  例:
  - `{"error": "画像が必要です"}`
  - `{"error": "ファイルサイズが大きすぎます。最大10MBまでです。"}`
  - `{"error": "画像生成に失敗しました"}`

### 2. ヘルスチェック

- **エンドポイント**: `GET /`
- **成功時のレスポンス (200 OK)**:
  ```json
  {
    "status": "ok"
  }
  ```

## セットアップとデプロイ

### 必要なもの

- Node.js と npm (または pnpm, yarn)
- Cloudflare アカウント
- Wrangler CLI (Cloudflare Workers のデプロイツール)
- Google Gemini API キー

### ローカル開発

1.  **依存関係をインストールします**:

    ```bash
    npm install
    ```

2.  **環境変数を設定します**:
    プロジェクトルートに `.dev.vars` ファイルを作成し、Gemini API キーを設定します。

    ```
    GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
    ```

    **注意**: `.dev.vars` ファイルを Git リポジトリにコミットしないでください。

3.  **ローカル開発サーバーを起動します**:
    ```bash
    npm run dev
    ```
    通常、`http://localhost:8787` でアプリケーションが起動します。

### Cloudflare へのデプロイ

1.  **Wrangler CLI で Cloudflare にログインします**:

    ```bash
    npx wrangler login
    ```

2.  **Gemini API キーを Cloudflare Workers の Secrets に設定します**:

    ```bash
    npx wrangler secret put GEMINI_API_KEY
    ```

    プロンプトに従って API キーを入力します。

3.  **プロジェクトをデプロイします**:
    ```bash
    npm run deploy
    ```

## リクエスト例 (curl)

```bash
curl -X POST \
  -F "image=@/path/to/your/image.jpg" \
  http://localhost:8787/api/transform/suit
# デプロイ後の場合は http://localhost:8787 を実際のWorker URLに置き換えてください。
```
