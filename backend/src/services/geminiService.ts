import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("⚠️ WARNING: GEMINI_API_KEY is not defined in .env");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export interface AssistantResponse {
  intent:
    | "create_reminder"
    | "get_daily_agenda"
    | "create_meeting"
    | "clarification_needed"
    | "unsupported";
  confidence: number;
  reminder?: {
    title: string;
    scheduled_at: string; // ISO-8601 string
    timezone: string;
  };
  meeting?: {
    title: string;
    start_time: string; // ISO-8601 string
    end_time?: string;
    duration_minutes: number;
    attendees: string[];
  };
  agenda?: {
    date: string; // YYYY-MM-DD
  };
  reply_message: string;
}

export async function interpretUserRequest(
  message: string,
  userTimezone: string = "UTC",
  referenceDate: Date = new Date(),
): Promise<AssistantResponse> {
  const referenceDateISO = referenceDate.toISOString();

  const systemInstruction = `                                                                                                                         
    You are AssistFlow AI, an executive assistant. Your role is to interpret natural-language requests into structured actions.                           
                                                                                                                                                          
    Current Reference Context:                                                                                                                            
    - Current UTC Time: ${referenceDateISO}                                                                                                               
    - User Timezone: ${userTimezone}                                                                                                                      
                                                                                                                                                          
    Guidelines:                                                                                                                                           
    1. Available intents:                                                                                                                                 
       - "create_reminder": User wants to be reminded of a task at a specific time.                                                                       
       - "get_daily_agenda": User wants to view scheduled meetings/agenda for a date.                                                                     
       - "create_meeting": User wants to schedule a meeting with attendees.                                                                               
       - "clarification_needed": If time or details are too ambiguous (e.g., "remind me tomorrow morning" without time - prompt politely asking if 9:00 AM
       works).                                                                                                                                            
       - "unsupported": Requests that don't match executive assistant capabilities.                                                                       
    2. For "create_reminder", always populate the reminder object:
       - title: concise action title (e.g. "Call John")
       - scheduled_at: exact ISO-8601 string calculated using user timezone and current reference time
       - timezone: the user timezone (e.g. "${userTimezone}")
    3. For relative dates like "tomorrow at 2pm" or "in 30 minutes", calculate the exact ISO-8601 timestamp using the user's timezone and current reference time.
    4. Always return valid structured JSON matching the provided schema.
    5. "reply_message" should be a friendly, concise message for the user.
    `;

  const CANDIDATE_MODELS = [
    'gemini-flash-lite-latest',
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
  ];
  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: message,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              intent: {
                type: Type.STRING,
                enum: [
                  "create_reminder",
                  "get_daily_agenda",
                  "create_meeting",
                  "clarification_needed",
                  "unsupported",
                ],
              },
              confidence: { type: Type.NUMBER },
              reply_message: { type: Type.STRING },
              reminder: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  scheduled_at: { type: Type.STRING },
                  timezone: { type: Type.STRING },
                },
                required: ["title", "scheduled_at", "timezone"],
              },
              meeting: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  start_time: { type: Type.STRING },
                  end_time: { type: Type.STRING },
                  duration_minutes: { type: Type.INTEGER },
                  attendees: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
              },
              agenda: {
                type: Type.OBJECT,
                properties: {
                  date: { type: Type.STRING },
                },
              },
            },
            required: ["intent", "reply_message"],
          },
        },
      });

      const rawText = response.text?.trim() || "{}";
      return JSON.parse(rawText) as AssistantResponse;
    } catch (err: any) {
      console.warn(`Model ${model} unavailable (${err.status || err.message}), trying fallback...`);
      lastError = err;
    }
  }

  throw lastError;
}
