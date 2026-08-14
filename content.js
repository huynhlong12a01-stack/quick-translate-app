let triggerEl = null;
let popupEl = null;
let currentText = "";
let currentUtterance = null; // Global để tránh garbage collection

// Khởi động voices sớm
if (window.speechSynthesis) {
  window.speechSynthesis.getVoices();
}

document.addEventListener("mouseup", (e) => {
  if (popupEl?.contains(e.target) || triggerEl?.contains(e.target)) return;

  setTimeout(() => {
    const selection = window.getSelection();
    const text = selection.toString().trim();
    
    if (!text) {
      removeUI();
      return;
    }

    currentText = text;
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    
    showTrigger(rect);
  }, 10);
});

document.addEventListener("mousedown", (e) => {
  if (popupEl && !popupEl.contains(e.target) && !triggerEl?.contains(e.target)) {
    removeUI();
  }
});

async function showTrigger(rect) {
  removeUI();
  
  const syncData = await chrome.storage.sync.get(["targetLang", "targetModel"]);
  let targetLang = syncData.targetLang || "Tiếng Việt";
  let targetModel = syncData.targetModel || "auto";
  if (targetModel === "gemini-3.1-lite") targetModel = "gemini-3.5-lite";

  // --- LOGIC ĐỌC TRẠNG THÁI KHÓA (NÂNG CẤP ĐỌC THỜI GIAN ĐỘNG) ---
  const localData = await chrome.storage.local.get(null);
  const now = Date.now();

  const checkState = (modelVal) => {
    const key = `exhausted_${modelVal}`;
    const waitKey = `wait_${modelVal}`;
    // Đọc thời gian khóa từ background. Nếu không có thì mặc định 60s
    const lockTimeMs = localData[waitKey] || 60000; 

    if (localData[key] && (now - localData[key] < lockTimeMs)) {
      const timeLeftMs = lockTimeMs - (now - localData[key]);
      let labelStr = "";
      
      if (timeLeftMs > 3600000) {
          // Lớn hơn 1 tiếng -> Hiển thị Khóa theo giờ
          const hoursLeft = Math.ceil(timeLeftMs / 3600000);
          labelStr = `(Khóa ${hoursLeft}h)`;
      } else {
          // Nhỏ hơn 1 tiếng -> Đếm ngược theo giây
          const secondsLeft = Math.ceil(timeLeftMs / 1000);
          labelStr = `(Khóa ${secondsLeft}s)`;
      }
      return { disabled: "disabled", label: labelStr };
    }
    return { disabled: "", label: "" };
  };

  const mAuto = checkState("auto");
  const m35Flash = checkState("gemini-3.5-flash");
  const m35Lite = checkState("gemini-3.5-lite");
  const m30Flash = checkState("gemini-3.0-flash");

  if (checkState(targetModel).disabled) {
    const availableModels = ["auto", "gemini-3.5-flash", "gemini-3.5-lite", "gemini-3.0-flash"]
                            .filter(m => !checkState(m).disabled);
    if (availableModels.length > 0) {
      targetModel = availableModels[0];
    }
  }

  triggerEl = document.createElement("div");
  triggerEl.id = "monica-translator-trigger-container";
  
  let top = window.scrollY + rect.top - 50; 
  let left = window.scrollX + rect.left + (rect.width / 2) - 120;
  
  if (top < window.scrollY) top = window.scrollY + rect.bottom + 10;

  triggerEl.style.cssText = `
    position: absolute !important;
    z-index: 2147483647 !important;
    top: ${top}px !important;
    left: ${left}px !important;
    display: flex !important;
    width: max-content !important;
  `;
  
  triggerEl.innerHTML = `
    <select id="mt-trigger-model" title="Chọn Mô hình AI">
      <option value="auto" ${mAuto.disabled}>⚡ Tự động ${mAuto.label}</option>
      <option value="gemini-3.5-flash" ${m35Flash.disabled}>3.5 Flash ${m35Flash.label}</option>
      <option value="gemini-3.5-lite" ${m35Lite.disabled}>3.5 Flash Lite ${m35Lite.label}</option>
      <option value="gemini-3.0-flash" ${m30Flash.disabled}>3.0 Flash ${m30Flash.label}</option>
    </select>
    <div class="mt-trigger-divider"></div>
    <select id="mt-trigger-lang" title="Chọn Ngôn ngữ đích">
      <option value="Tiếng Việt">Tiếng Việt</option>
      <option value="Tiếng Anh">Tiếng Anh</option>
    </select>
    <div class="mt-trigger-divider"></div>
    <button id="mt-trigger-btn">✨ Dịch</button>
  `;
  
  document.body.appendChild(triggerEl);

  const selectLangEl = triggerEl.querySelector("#mt-trigger-lang");
  const selectModelEl = triggerEl.querySelector("#mt-trigger-model");
  const btnEl = triggerEl.querySelector("#mt-trigger-btn");
  
  selectLangEl.value = targetLang;
  selectModelEl.value = targetModel;

  triggerEl.addEventListener("mousedown", (e) => e.stopPropagation());

  selectLangEl.addEventListener("change", async (e) => {
    await chrome.storage.sync.set({ targetLang: e.target.value });
  });
  
  selectModelEl.addEventListener("change", async (e) => {
    await chrome.storage.sync.set({ targetModel: e.target.value });
  });
  
  btnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    showPopup(rect, currentText, selectLangEl.value, selectModelEl.value);
  });
}

function showPopup(rect, text, targetLang, targetModel) {
  document.querySelectorAll("#monica-translator-popup").forEach(el => el.remove());

  if (triggerEl) triggerEl.style.display = "none !important";
  
  popupEl = document.createElement("div");
  popupEl.id = "monica-translator-popup";
  
  const popupWidth = 420; 
  const estimatedHeight = 350; 
  
  let top = window.scrollY + rect.bottom + 10;
  let left = window.scrollX + rect.left;

  if (left + popupWidth > window.innerWidth + window.scrollX) {
    left = window.innerWidth + window.scrollX - popupWidth - 20;
  }
  
  const spaceBelow = window.innerHeight - rect.bottom;
  if (spaceBelow < estimatedHeight) {
    if (rect.top > estimatedHeight) {
      top = window.scrollY + rect.top - estimatedHeight - 10;
    } else {
      top = window.scrollY + 20;
    }
  }
  
  popupEl.style.cssText = `
    position: absolute !important;
    z-index: 2147483647 !important;
    top: ${top}px !important;
    left: ${left}px !important;
    display: block !important;
  `;
  
  popupEl.innerHTML = `
    <div class="mt-header" title="Nhấn giữ để kéo đi nơi khác">
      <div class="mt-title">Bản dịch (${targetLang})</div>
      <button class="mt-close">×</button>
    </div>
    <div class="mt-body">
      <div class="mt-result">
        <div class="mt-loading"><div class="mt-spinner"></div> Đang xử lý...</div>
      </div>
    </div>
  `;
  
  // Tránh popup tự đóng khi click vào bên trong nó
  popupEl.addEventListener("mousedown", (e) => e.stopPropagation());
  popupEl.querySelector(".mt-close").addEventListener("click", removeUI);
  
  document.body.appendChild(popupEl);

  // ==========================================
  // 🚀 THÊM LOGIC KÉO THẢ (DRAG & DROP)
  // ==========================================
  const headerEl = popupEl.querySelector(".mt-header");
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  headerEl.addEventListener("mousedown", (e) => {
    // Không kích hoạt kéo thả nếu người dùng lỡ bấm vào nút X (đóng)
    if (e.target.closest('.mt-close')) return;

    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    // Lấy tọa độ hiện tại của popup
    initialLeft = parseFloat(popupEl.style.left);
    initialTop = parseFloat(popupEl.style.top);

    popupEl.classList.add("mt-dragging");

    // Lắng nghe sự kiện di chuyển trên toàn màn hình (để lỡ chuột có đi ra ngoài popup vẫn kéo được)
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    
    e.preventDefault(); // Ngăn trình duyệt bôi đen chữ khi đang kéo
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    
    // Tính toán khoảng cách chuột đã di chuyển
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    
    // Cập nhật vị trí mới cho popup (dùng setProperty để đè cái !important)
    popupEl.style.setProperty("left", `${initialLeft + dx}px`, "important");
    popupEl.style.setProperty("top", `${initialTop + dy}px`, "important");
  }

  function onMouseUp() {
    if (isDragging) {
      isDragging = false;
      popupEl.classList.remove("mt-dragging");
      // Dọn dẹp rác (gỡ bỏ lắng nghe sự kiện) để không làm nặng máy
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
  }
  // ==========================================

  requestTranslation(text, targetLang, targetModel);
}


function requestTranslation(text, targetLang, targetModel) {
  chrome.runtime.sendMessage(
    { type: "TRANSLATE_TEXT", text: text, targetLang: targetLang, targetModel: targetModel },
    (response) => {
      const resultEl = popupEl?.querySelector(".mt-result");
      if (!resultEl) return;
      
      if (response && response.result) {
        let formattedText = "";
        const parts = response.result.split("---");

        if (text.split(/\s+/).length < 5 && parts.length >= 3) {
            const mainMeaning = parts[0].trim().replace(/\*/g, ''); 
            const sourcePhonetics = parts[1].trim();
            
            let targetPhonetics = "";
            let details = "";
            if (parts.length >= 4) {
                targetPhonetics = parts[2].trim();
                details = parts.slice(3).join("---").trim();
            } else {
                details = parts.slice(2).join("---").trim();
            }

            details = details.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                             .replace(/\*(.*?)\*/g, '<em>$1</em>')
                             .replace(/\n+/g, '<br>');

            const isVietnameseRegex = /[àáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệđìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳýỹỷỵđ]/i;
            const isSourceVietnamese = isVietnameseRegex.test(text);
            const isTargetVietnamese = targetLang === "Tiếng Việt" || isVietnameseRegex.test(mainMeaning);

            // Ghi lại vào Flashcard
            saveToFlashcard(text, mainMeaning, response.sourceLang, targetLang, sourcePhonetics);

            const sourcePhoneticsHtml = sourcePhonetics ? `<div class="mt-dict-phonetics mt-phonetics-source" title="Nghe phát âm" style="cursor: pointer;">${sourcePhonetics}</div>` : '';
            const targetPhoneticsHtml = targetPhonetics ? `<div class="mt-dict-phonetics mt-phonetics-target" title="Nghe phát âm" style="cursor: pointer;">${targetPhonetics}</div>` : '';
            const speakerSVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;

            const sourceSpeakerBtn = isSourceVietnamese ? '' : `<button class="mt-speaker-inline mt-speaker-source" title="Nghe từ gốc">${speakerSVG}</button>`;
            const targetSpeakerBtn = isTargetVietnamese ? '' : `<button class="mt-speaker-inline mt-speaker-target" title="Nghe bản dịch">${speakerSVG}</button>`;

            formattedText = `<div class="mt-dict-word-group"><div class="mt-dict-word-row"><span class="mt-dict-word-main">${text}</span>${sourceSpeakerBtn}</div>${sourcePhoneticsHtml}</div><div class="mt-dict-word-group mt-target-group"><div class="mt-dict-word-row"><span class="mt-dict-word-translated">${mainMeaning}</span>${targetSpeakerBtn}</div>${targetPhoneticsHtml}</div><div class="mt-dict-details">${details}</div>`;
        } 
        else {
            const cleanResult = response.result.replace(/---/g, '').trim();
            const parsedText = cleanResult
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n+/g, '<br><br>');
                
            formattedText = `<div>${parsedText}</div>`;
        }
            
        resultEl.innerHTML = formattedText;
        
        const speakerSource = resultEl.querySelector(".mt-speaker-source");
        if (speakerSource) {
            speakerSource.onclick = (e) => {
                e.stopPropagation();
                speakText(text); 
            };
        }

        const phoneticsSource = resultEl.querySelector(".mt-phonetics-source");
        if (phoneticsSource) {
            phoneticsSource.onclick = (e) => {
                e.stopPropagation();
                speakText(text); 
            };
        }

        const speakerTarget = resultEl.querySelector(".mt-speaker-target");
        if (speakerTarget) {
            speakerTarget.onclick = (e) => {
                e.stopPropagation();
                const translatedWord = resultEl.querySelector(".mt-dict-word-translated").innerText;
                speakText(translatedWord); 
            };
        }

        const phoneticsTarget = resultEl.querySelector(".mt-phonetics-target");
        if (phoneticsTarget) {
            phoneticsTarget.onclick = (e) => {
                e.stopPropagation();
                const translatedWord = resultEl.querySelector(".mt-dict-word-translated").innerText;
                speakText(translatedWord); 
            };
        }
      } else {
        resultEl.textContent = "Đã xảy ra lỗi khi dịch.";
      }
    }
  );
}

function speakText(text) {
  const cleanText = text.replace(/<[^>]*>?/gm, '');
  const finalLang = "en";

  const url = `https://translate.googleapis.com/translate_tts?client=gtx&ie=UTF-8&tl=${finalLang}&q=${encodeURIComponent(cleanText)}`;
  
  const audio = new Audio(url);
  audio.play().catch(e => {
      fallbackTTS(cleanText);
  });
}

function fallbackTTS(cleanText) {
  const utterThis = new SpeechSynthesisUtterance(cleanText);
  utterThis.lang = "en-US";
  
  const play = () => {
      let voices = window.speechSynthesis.getVoices();
      let matchingVoices = voices.filter(v => v.lang.toLowerCase().startsWith("en"));
      if (matchingVoices.length > 0) {
          let bestVoice = matchingVoices.find(v => v.name.includes('Google'));
          if (!bestVoice) bestVoice = matchingVoices[0];
          utterThis.voice = bestVoice;
      }
      window.speechSynthesis.cancel();
      setTimeout(() => window.speechSynthesis.speak(utterThis), 50);
  };

  if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = play;
  } else {
      play();
  }
}

function removeUI() {
  window.speechSynthesis.cancel();
  document.querySelectorAll("#monica-translator-trigger-container, #monica-translator-popup").forEach(el => el.remove());
  triggerEl = null;
  popupEl = null;
}

function saveToFlashcard(word, meaning, originalLang, targetLang, phonetics) {
  if (!word || !meaning) return;
  const wordKey = word.toLowerCase().trim();
  
  chrome.storage.local.get("saved_flashcards", (result) => {
    let cards = result.saved_flashcards || {};
    
    if (!cards[wordKey]) {
      cards[wordKey] = {
        word: word.trim(),
        meaning: meaning.trim(),
        originalLang: originalLang,
        targetLang: targetLang,
        phonetics: phonetics || "",
        nextReview: Date.now(),
        streak: 0,
        interval: 1,
        ease: 2.5,
        addedAt: Date.now()
      };
    } else {
      // Cập nhật phiên âm nếu trước đó chưa có hoặc bị thiếu
      if (phonetics && !cards[wordKey].phonetics) {
        cards[wordKey].phonetics = phonetics;
      }
    }
    
    chrome.storage.local.set({ "saved_flashcards": cards }, () => {
       console.log("Saved/Updated flashcard:", wordKey);
    });
  });
}