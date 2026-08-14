const AI_MODELS = {
  "auto_short": "gemini-3.5-flash-lite", 
  "auto_long": "gemini-3.5-flash",

  "gemini-3.5-lite": "gemini-3.5-flash-lite",
  "gemini-3.1-lite": "gemini-3.5-flash-lite",
  "gemini-3.0-flash": "gemini-3-flash-preview", 
  "gemini-3.5-flash": "gemini-3.5-flash"
};

const translationCache = new Map();

async function getStoredApiKeys() {
  const data = await chrome.storage.local.get("gemini_api_keys");
  if (Array.isArray(data.gemini_api_keys) && data.gemini_api_keys.length > 0) {
    return data.gemini_api_keys.map(k => k.trim()).filter(Boolean);
  }
  if (typeof data.gemini_api_keys === "string" && data.gemini_api_keys.trim()) {
    return data.gemini_api_keys.split(/[\n,;]+/).map(k => k.trim()).filter(Boolean);
  }
  return [];
}

function maskKey(key) {
  if (!key || key.length < 8) return "••••••••";
  return key.substring(0, 6) + "..." + key.substring(key.length - 4);
}

async function testApiKeys(keys) {
  if (!keys || keys.length === 0) return [];
  const testResults = [];
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i].trim();
    if (!key) continue;
    
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });
      
      if (response.ok) {
        testResults.push({ keyIndex: i + 1, maskedKey: maskKey(key), status: "success", message: "Key hợp lệ, kết nối tốt!" });
      } else {
        const err = await response.json().catch(() => ({}));
        const errMsg = err.error?.message || `Lỗi HTTP ${response.status}`;
        testResults.push({ keyIndex: i + 1, maskedKey: maskKey(key), status: "error", message: errMsg });
      }
    } catch (e) {
      testResults.push({ keyIndex: i + 1, maskedKey: maskKey(key), status: "error", message: e.message || "Lỗi kết nối mạng" });
    }
  }
  return testResults;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "TRANSLATE_TEXT") {
    chrome.i18n.detectLanguage(message.text, (detectResult) => {
      let sourceLang = "en-US"; 
      if (detectResult && detectResult.languages && detectResult.languages.length > 0) {
        const code = detectResult.languages[0].language; 
        const langMap = { 'en': 'en-US', 'vi': 'vi-VN' };
        sourceLang = langMap[code] || code;
        if (code === 'en') sourceLang = 'en-US'; 
      }

      translateWithCacheAndRetry(message.text, message.targetLang, message.targetModel)
        .then((result) => sendResponse({ result: result, sourceLang: sourceLang }))
        .catch((error) => {
          console.error("Translation error:", error);
          sendResponse({ result: "Lỗi: " + error.message, sourceLang: "en-US" });
        });
    });
    return true; 
  }

  if (message.type === "GENERATE_DEFINITION") {
    generateDefinitionWithFallback(message.word, 0, 60000)
      .then((result) => sendResponse({ result: result }))
      .catch((error) => {
        console.error("Definition generation error:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (message.type === "TEST_API_KEYS") {
    testApiKeys(message.keys)
      .then((results) => sendResponse({ results: results }))
      .catch((error) => {
        console.error("API test error:", error);
        sendResponse({ error: error.message });
      });
    return true;
  }

  if (message.type === "SPEAK_TEXT") {
    chrome.tts.stop();
    const cleanText = message.text.replace(/<[^>]*>?/gm, '');
    chrome.tts.speak(cleanText, { lang: "en-US" });
    return true;
  }

  if (message.type === "STOP_SPEAKING") {
    chrome.tts.stop();
    return true;
  }
});

async function translateWithCacheAndRetry(text, targetLang, targetModel) {
  const cacheKey = text.trim().toLowerCase() + "|" + targetLang + "|" + targetModel;

  if (translationCache.has(cacheKey)) {
    console.log("⚡ Lấy từ Cache, KHÔNG tốn API!");
    return translationCache.get(cacheKey);
  }

  const apiKeys = await getStoredApiKeys();
  if (apiKeys.length === 0) {
    return "Lỗi: Chưa cài đặt API Key! Vui lòng nhấp vào biểu tượng tiện ích -> Cài đặt (⚙️) để nhập Gemini API Key.";
  }

  // Khởi chạy với attempt = 0 và waitTime mặc định = 60s
  const finalResult = await callGeminiApiWithFallback(text, targetLang, targetModel, 0, 60000, apiKeys);

  if (!finalResult.startsWith("Lỗi:")) {
    translationCache.set(cacheKey, finalResult);
  }

  return finalResult;
}

async function callGeminiApiWithFallback(text, targetLang, targetModel, attempt, waitTime, apiKeys) {
  if (!apiKeys || apiKeys.length === 0) {
    return "Lỗi: Chưa cài đặt API Key! Vui lòng mở popup tiện ích -> Cài đặt (⚙️) để nhập Gemini API Key.";
  }

  if (attempt >= apiKeys.length) {
    const lockKey = `exhausted_${targetModel}`;
    const waitKey = `wait_${targetModel}`;
    await chrome.storage.local.set({ 
        [lockKey]: Date.now(),
        [waitKey]: waitTime 
    });
    
    let timeText = waitTime > 3600000 ? "24 giờ" : `${Math.ceil(waitTime/1000)} giây`;
    return `Lỗi: Tất cả ${apiKeys.length} API Key đều bận (Rate limit). Tự động khóa mô hình này ${timeText} để chờ hồi phục.`;
  }

  const randomIndex = Math.floor(Math.random() * apiKeys.length);
  const randomApiKey = apiKeys[randomIndex];
  const wordCount = text.trim().split(/\s+/).length;
  
  let prompt = "";
  let temp = 0.1; 

  if (wordCount < 5) {
    temp = 0.1; 
    prompt = `You are a dictionary API. Target language: ${targetLang}. 
Original word: "${text}"

INSTRUCTIONS:
1. Translate the original word into ${targetLang}.
2. Phonetics 1 (Original): Provide IPA/Romaji if the original word is English/Foreign. Leave EXACTLY BLANK if Vietnamese.
3. Phonetics 2 (Translated): Provide IPA/Romaji if the translated word is English/Foreign. Leave EXACTLY BLANK if Vietnamese.
4. Details: Provide part of speech, synonyms, and one example sentence.

OUTPUT FORMAT (Do NOT add labels like "Part 1". Just output the values separated by exactly three "---" dividers):
[Translated text]
---
[Phonetics 1]
---
[Phonetics 2]
---
**[Part of speech]**: [Explanation]
**Synonyms**: [List 2-3 synonyms in the ORIGINAL language of the word]
- Example: [Original sentence] -> [Translated sentence in ${targetLang}]`;
  } else {
    temp = 0.3; 
    prompt = `You are an elite translator. Target language: ${targetLang}.
Translate the following text naturally, fluently, and correctly in context into ${targetLang}. 
DO NOT translate word-by-word. 
DO NOT output any phonetics, dividers, or explanations. ONLY output the final translated text.

Text to translate: "${text}"`;
  }

  let modelCode = "";
  if (targetModel === "auto") {
    modelCode = (wordCount < 5) ? AI_MODELS["auto_short"] : AI_MODELS["auto_long"];
  } else {
    modelCode = AI_MODELS[targetModel] || AI_MODELS["auto_long"]; 
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCode}:generateContent?key=${randomApiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: temp,
          thinking_config: { include_thoughts: false, thinking_level: "minimal" }
        } 
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.error?.message || JSON.stringify(err);

      if (response.status === 429 || response.status === 503) {
        const retryMatch = errMsg.match(/retry in (\d+(\.\d+)?)s/i);
        let currentWaitTime = 60000; // MẶC ĐỊNH LUÔN LÀ 60S CHO AN TOÀN
        
        if (retryMatch) {
            // Có số giây cụ thể thì lấy số đó + 2s bù trừ
            currentWaitTime = Math.ceil(parseFloat(retryMatch[1])) * 1000 + 2000;
        } else if (errMsg.toLowerCase().includes("per day") || errMsg.toLowerCase().includes("daily")) {
            // Chỉ khi CHẮC CHẮN chứa chữ "per day" hoặc "daily" thì mới dám khóa 24h
            currentWaitTime = 24 * 60 * 60 * 1000; 
        }

        const maxWaitTime = Math.max(waitTime, currentWaitTime);

        console.warn(`Key API bị từ chối. Đang thử Key khác... Lệnh phạt dự kiến: ${maxWaitTime}ms`);
        return await callGeminiApiWithFallback(text, targetLang, targetModel, attempt + 1, maxWaitTime, apiKeys);
      }
      throw new Error(errMsg || "Lỗi kết nối API");
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    
    // Ghép tất cả các phần text không phải là 'thought'
    let resultText = parts
      .filter(p => !p.thought)
      .map(p => p.text)
      .join("")
      .trim();

    // Xóa các thẻ tư duy nếu model vẫn trả về trong text (Gemma 4 / Thinking models)
    resultText = resultText
      .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
      .replace(/<\|think\|>[\s\S]*?<\/\|think\|>/gi, "")
      .replace(/<\|think\|>[\s\S]*?<\|thought\|>/gi, "")
      .trim();

    return resultText || "Không có kết quả dịch.";

  } catch (error) {
    if (error.message && error.message.includes("not found")) {
      return `Lỗi: Model "${modelCode}" chưa được Google cấp phép hoặc sai tên.`;
    }
    throw error;
  }
}

async function generateDefinitionWithFallback(word, attempt = 0, waitTime = 60000, apiKeys = null) {
  if (!apiKeys) {
    apiKeys = await getStoredApiKeys();
  }
  if (!apiKeys || apiKeys.length === 0) {
    return "Lỗi: Chưa cài đặt API Key! Vui lòng mở popup tiện ích -> Cài đặt (⚙️) để nhập Gemini API Key.";
  }

  if (attempt >= apiKeys.length) {
    return "Lỗi: Tất cả API Key đều bận. Hãy thử lại sau.";
  }

  const randomIndex = Math.floor(Math.random() * apiKeys.length);
  const randomApiKey = apiKeys[randomIndex];
  const prompt = `Provide a concise English dictionary definition for the word "${word}". Do NOT use the word "${word}" in your definition. Return ONLY the definition text without any markdown or formatting.`;
  const modelCode = AI_MODELS["auto_short"] || "gemini-3.5-flash-lite";

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelCode}:generateContent?key=${randomApiKey}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3 } 
      })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      const errMsg = err.error?.message || JSON.stringify(err);

      if (response.status === 429 || response.status === 503) {
        return await generateDefinitionWithFallback(word, attempt + 1, waitTime, apiKeys);
      }
      throw new Error(errMsg || "Lỗi kết nối API");
    }

    const data = await response.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    let resultText = parts.filter(p => !p.thought).map(p => p.text).join("").trim();
    resultText = resultText.replace(/<thought>[\s\S]*?<\/thought>/gi, "").replace(/<\|think\|>[\s\S]*?<\/\|think\|>/gi, "").trim();
    
    return resultText || "Không thể tạo định nghĩa.";
  } catch (error) {
    throw error;
  }
}