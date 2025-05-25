// src/index.ts - Cloudflare Workers用 Hono アプリケーション
import { Hono } from "hono";
import { cors } from "hono/cors";
import { GoogleGenAI, Modality } from "@google/genai";
import { rateLimitMiddleware } from "./middleware/ratelimit";

type Bindings = {
  GEMINI_API_KEY: string;
  RATE_LIMIT_KV: KVNamespace;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS設定
app.use("/*", cors());

// プロンプト定義
const PROMPTS = {
  camera: `
    The image we will give you this time is of the torso (from the neck to the chest). The image we will give you is of casual clothing, so please edit it to a black tie formal suit and submit it. Please do not change the neck position or width (keep the neck color as given) or the size of the image.
  `,
  upload: `
    The image we will give you this time is from the face to the chest.
    The image we give you is of casual clothes, so please convert it to a formal suit and submit it.
    Keep the original person's facial features and pose. The position of the neck and the overall image size must also remain unchanged.
    Must change the background to #FFFFFF.
    Ties must be worn.
    The suit should be a photorealistic formal business suit, styled appropriately for the person's gender (men's suit for a male, women's suit for a female), not anime-style. It should have a realistic texture, showing fabric details and natural wrinkles.
  `,
};

// 最大ファイルサイズ（10MB）
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// レート制限ミドルウェアを適用
app.use("/api/*", (c, next) => {
  const limiter = rateLimitMiddleware(c.env.RATE_LIMIT_KV);
  return limiter(c, next);
});

// 共通の画像変換処理
async function transformImage(c: any, prompt: string) {
  try {
    const formData = await c.req.formData();
    const imageFile = formData.get("image") as File;

    if (!imageFile) {
      return c.json({ error: "画像が必要です" }, 400);
    }

    // ファイルサイズチェック
    if (imageFile.size > MAX_FILE_SIZE) {
      return c.json(
        {
          error: `ファイルサイズが大きすぎます。最大${
            MAX_FILE_SIZE / 1024 / 1024
          }MBまでです。`,
        },
        400
      );
    }

    // Gemini APIクライアントを初期化
    const ai = new GoogleGenAI({ apiKey: c.env.GEMINI_API_KEY });

    // 画像をBase64に変換（大きなファイルに対応）
    const arrayBuffer = await imageFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    let binaryString = "";
    const chunkSize = 8192; // 8KB chunks

    for (let i = 0; i < uint8Array.length; i += chunkSize) {
      const chunk = uint8Array.slice(i, i + chunkSize);
      binaryString += String.fromCharCode.apply(null, Array.from(chunk));
    }

    const base64Image = btoa(binaryString);

    // 画像生成モデルでスーツ変換を実行
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: [
        {
          inlineData: {
            mimeType: imageFile.type,
            data: base64Image,
          },
        },
        prompt,
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    // レスポンスから画像データを取得
    if (!response.candidates || response.candidates.length === 0) {
      throw new Error("画像生成に失敗しました");
    }

    const candidate = response.candidates[0];
    if (!candidate.content || !candidate.content.parts) {
      throw new Error("生成された画像が見つかりません");
    }

    // 生成された画像データを探す
    let imageData: string | undefined;

    for (const part of candidate.content.parts) {
      if (
        part.inlineData &&
        part.inlineData.mimeType &&
        part.inlineData.mimeType.startsWith("image/")
      ) {
        imageData = part.inlineData.data;
      }
    }

    if (!imageData) {
      throw new Error("生成された画像データが見つかりません");
    }

    // Base64エンコードされた画像データを返す
    return c.json({
      image: `data:image/png;base64,${imageData}`,
    });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "画像変換中にエラーが発生しました",
      },
      500
    );
  }
}

// カメラ用画像変換エンドポイント
app.post("/api/transform/suit/camera", async (c) => {
  return transformImage(c, PROMPTS.camera);
});

// アップロード用画像変換エンドポイント
app.post("/api/transform/suit/upload", async (c) => {
  return transformImage(c, PROMPTS.upload);
});

// ルートエンドポイント
app.get("/", (c) => {
  return c.json({ status: "ok" });
});

export default app;
