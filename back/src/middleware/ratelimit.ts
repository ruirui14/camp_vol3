import { Context, Next } from "hono";
import { StatusCode } from "hono/utils/http-status";

// デフォルト値を定義
const DEFAULT_LIMIT = 20; // 1時間に20リクエストまで許可
const DEFAULT_WINDOW_MS = 60 * 60 * 1000; // 1時間 (ミリ秒)
const DEFAULT_STATUS_CODE = 429; // Too Many Requests
const DEFAULT_MESSAGE = "Too many requests, please try again later.";
const DEFAULT_KEY_PREFIX = "rate-limit:";

/**
 * IPアドレスに基づくレート制限ミドルウェア
 * Cloudflare KVを使用してリクエスト数をカウント
 *
 * @param kvNamespace - リクエストカウントに使用するCloudflare KV Namespace。必須。
 * @param limit - windowMs内に許可する最大リクエスト数。デフォルトは60。
 * @param windowMs - リクエスト数をカウントする期間（ミリ秒）。デフォルトは60000 (1分)。
 * @param statusCode - 制限を超過した場合に返すHTTPステータスコード。デフォルトは429。
 * @param message - 制限を超過した場合に返すエラーメッセージ。
 * @param keyPrefix - KVストアに保存する際のキーのプレフィックス。デフォルトは "rate-limit:"。
 */
export function rateLimitMiddleware(
  kvNamespace: KVNamespace,
  limit: number = DEFAULT_LIMIT,
  windowMs: number = DEFAULT_WINDOW_MS,
  statusCode: number = DEFAULT_STATUS_CODE,
  message: string = DEFAULT_MESSAGE,
  keyPrefix: string = DEFAULT_KEY_PREFIX
) {
  if (!kvNamespace) {
    throw new Error("KVNamespaceが指定されていません。");
  }

  return async (c: Context, next: Next) => {
    // クライアントのIPアドレスを取得
    const ip = c.req.header("CF-Connecting-IP") || "0.0.0.0"; // デフォルトIP

    // KVストレージのキー
    const kvKey = `${keyPrefix}${ip}`;

    const now = Date.now();

    // KVからレート制限情報を取得
    let rateInfo = (await kvNamespace.get(kvKey, "json")) as {
      count: number;
      reset: number; // 次にカウンターがリセットされるタイムスタンプ
    } | null;

    if (!rateInfo || now > rateInfo.reset) {
      // 初回アクセス、またはリセット時間が過ぎていたらカウンターをリセット
      rateInfo = {
        count: 0,
        reset: now + windowMs,
      };
    }

    // カウンター増加
    rateInfo.count++;

    // 残りのリクエスト数
    const remaining = Math.max(0, limit - rateInfo.count);

    // レスポンスヘッダーにレート制限情報を追加
    c.header("X-RateLimit-Limit", limit.toString());
    c.header("X-RateLimit-Remaining", remaining.toString());
    c.header("X-RateLimit-Reset", Math.ceil(rateInfo.reset / 1000).toString()); // UNIXタイムスタンプ(秒)

    // KVに保存（expiration timeを設定して自動期限切れ）
    // TTLは現在の時刻からリセット時刻までの秒数。KVの最小TTLは60秒。
    const ttlInSeconds = Math.ceil((rateInfo.reset - now) / 1000);
    const expirationTtl = Math.max(60, ttlInSeconds); // 最小60秒

    await kvNamespace.put(kvKey, JSON.stringify(rateInfo), {
      expirationTtl: expirationTtl,
    });

    // 制限を超えた場合
    if (rateInfo.count > limit) {
      c.status(statusCode as StatusCode);
      const retryAfterSeconds = Math.ceil((rateInfo.reset - now) / 1000);
      c.header("Retry-After", retryAfterSeconds.toString()); // Retry-Afterヘッダーを追加
      return c.json({
        error: message,
        retryAfter: retryAfterSeconds, // 秒単位
      });
    }

    await next();
  };
}
