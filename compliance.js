/**
 * compliance.js — Self-contained compliance and memory module for testcron.
 * Mirrors the logic in the main app's gemini.js but uses node-fetch.
 */
import fetch from "node-fetch";
import { AppContext, UserMemory } from "./db/models.js";

async function fetchWithRetry(url, options, maxRetries = 3, initialDelay = 2000) {
  let delay = initialDelay;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        console.warn(`[fetchWithRetry] 429 Too Many Requests on attempt ${attempt}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }
      return response;
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.warn(`[fetchWithRetry] Network error on attempt ${attempt}: ${err.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
  return fetch(url, options);
}

/**
 * Verifies a post against the admin app context and user memories.
 * Two-pass: check → rewrite if needed → re-check.
 */
export async function verifyPostCompliance(postContent, userMemories = [], appContextText = "") {
  const apiKey = process.env.GROQ_API_KEY;

  if (!appContextText && userMemories.length === 0) {
    return { success: true, finalContent: postContent };
  }

  const guidelines = `
${appContextText ? `APP-WIDE COMPLIANCE CONSTITUTION:\n${appContextText}` : ""}

${userMemories.length > 0 ? `USER-SPECIFIC STYLE MEMORIES:\n${userMemories.map(m => `- [${m.memoryType?.toUpperCase?.() || "RULE"}]: ${m.content}`).join("\n")}` : ""}
`.trim();

  async function checkPass(contentToVerify) {
    const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an absolute, uncompromising brand compliance editor for a professional social media platform.
Evaluate the post against the compliance guidelines. Rewrite if it violates anything.
Return ONLY valid JSON: {"isCompliant": boolean, "issuesFound": "brief detail or empty string", "rewrittenContent": "fixed or original post"}`,
          },
          {
            role: "user",
            content: `COMPLIANCE GUIDELINES:\n${guidelines}\n\nPOST TO VERIFY:\n---\n${contentToVerify}\n---\nAnalyze and return JSON now.`,
          },
        ],
      }),
    });

    if (!response.ok) throw new Error("Compliance Groq error: " + response.statusText);
    const data = await response.json();
    try {
      return JSON.parse(data.choices?.[0]?.message?.content);
    } catch {
      return { isCompliant: false, issuesFound: "Invalid AI JSON", rewrittenContent: contentToVerify };
    }
  }

  try {
    console.log("🛡️ [Cron Compliance] Pass 1...");
    const pass1 = await checkPass(postContent);

    if (pass1.isCompliant) {
      console.log("✅ [Cron Compliance] Pass 1: Compliant.");
      return { success: true, finalContent: pass1.rewrittenContent || postContent };
    }

    console.log("⚠️ [Cron Compliance] Pass 1 failed:", pass1.issuesFound, "— running Pass 2...");
    const pass2 = await checkPass(pass1.rewrittenContent);

    if (pass2.isCompliant) {
      console.log("✅ [Cron Compliance] Pass 2: Rewrite passed.");
      return { success: true, finalContent: pass2.rewrittenContent };
    }

    console.log("❌ [Cron Compliance] Both passes failed. Flagging post.");
    return { success: false, error: pass2.issuesFound };

  } catch (error) {
    console.error("[Cron Compliance] Engine Error:", error.message);
    return { success: false, error: "Compliance checker crashed: " + error.message };
  }
}

/**
 * Auto-Learning Memory Extractor — extracts new style facts from a published post.
 * Returns an array of insight strings. Caller saves them to UserMemory.
 */
export async function extractUserMemory(userInputText, existingMemories = []) {
  const apiKey = process.env.GROQ_API_KEY;
  const existingSummary = existingMemories.length > 0
    ? existingMemories.map(m => m.content).join("; ")
    : "None yet";

  try {
    const response = await fetchWithRetry("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an AI constraint analyzer. Your job is to extract HARD, long-term rules, distinct tone preferences, or unique core beliefs out of a user's raw input guidelines.
Do NOT extract generic topic ideas, common themes, or temporary instructions. Only extract what genuinely defines the author's strict, long-term writing style.
EXISTING KNOWN FACTS (do NOT duplicate): ${existingSummary}
Return ONLY valid JSON: {"insights": ["rule/fact 1", "rule/fact 2"]} — an array of 0-2 NEW, highly specific, non-duplicate constraints that MUST be enforced globally later. Return empty array if the input is generic.`,
          },
          {
            role: "user",
            content: `Evaluate these user instructions for permanent style facts/rules:\n---\n${userInputText}\n---`,
          },
        ],
      }),
    });

    if (!response.ok) return [];
    const data = await response.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || '{"insights":[]}');
    return Array.isArray(parsed.insights) ? parsed.insights.filter(Boolean) : [];
  } catch {
    return [];
  }
}

/**
 * Convenience function: loads AppContext + UserMemory and runs compliance.
 * Handles auto-memory extraction after publishing.
 */
export async function runCompliancePipeline(postContent, userId) {
  const appCtxRow = await AppContext.findOne({ order: [["id", "DESC"]] });
  const appContextText = appCtxRow?.fullText || "";
  const userMemories = await UserMemory.findAll({ where: { userId, isActive: true } });

  console.log(`[Compliance] context: ${appContextText ? "loaded" : "none"} | memories: ${userMemories.length}`);
  return {
    result: await verifyPostCompliance(postContent, userMemories, appContextText),
    userMemories,
  };
}

/**
 * Saves auto-extracted memory insights after a post is published.
 */
export async function saveAutoMemories(userInputText, userId, existingMemories) {
  try {
    const insights = await extractUserMemory(userInputText, existingMemories);
    for (const insight of insights) {
      await UserMemory.create({ userId, memoryType: "auto", content: insight, isActive: true });
    }
    if (insights.length > 0) {
      console.log(`[Memory] Stored ${insights.length} new auto-memories for user ${userId}`);
    }
  } catch (err) {
    console.warn("[Memory] Auto-learn failed (non-critical):", err.message);
  }
}
