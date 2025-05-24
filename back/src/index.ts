import { Hono } from "hono";
import { GoogleGenAI } from "@google/genai";

type Bindings = {
  GEMINI_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", async (c) => {
  try {
    console.log(c.env.GEMINI_API_KEY);
    const apiKey = c.env.GEMINI_API_KEY;

    if (!apiKey) {
      return c.json({ error: "GEMINI_API_KEY not found" }, 500);
    }

    const ai = new GoogleGenAI({ apiKey: apiKey });

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: "Why is the sky blue?",
    });

    return c.json({
      question: "Why is the sky blue?",
      answer: response.text,
    });
  } catch (error) {
    console.error("Error:", error);
    return c.json(
      {
        error: "Failed to get response from Gemini API",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      500
    );
  }
});

export default app;
