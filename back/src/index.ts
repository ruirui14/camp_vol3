import { Hono } from "hono";
import { cors } from "hono/cors";
import { GoogleGenAI, Modality } from "@google/genai";

type Bindings = {
  GEMINI_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS設定
app.use("/*", cors());

// 固定プロンプト
const PROMPT = `
    元の人物の顔の特徴とポーズを正確に維持し、服装のみをスーツに変更してください。
    顔の表情、髪型、体型、ポーズはそのままに。背景も保持してください。
  `;

// 最大ファイルサイズ（10MB）
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// 画像変換エンドポイント
app.post("/api/transform/suit", async (c) => {
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

    // 画像生成モデルで背景除去を実行
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: [
        {
          inlineData: {
            mimeType: imageFile.type,
            data: base64Image,
          },
        },
        PROMPT,
      ],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE], // テキストは使わないが、書く必要がある
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
});

// ルートエンドポイント
app.get("/", (c) => {
  return c.json({ status: "ok" });
});

export default app;
