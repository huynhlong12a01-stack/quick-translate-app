document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const loadingState = document.getElementById('loading');
  const emptyState = document.getElementById('emptyState');
  const flashcardState = document.getElementById('flashcardState');
  const manageState = document.getElementById('manageState');
  const settingsState = document.getElementById('settingsState');
  
  const modeSelect = document.getElementById('modeSelect');
  const manageBtn = document.getElementById('manageBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const backBtn = document.getElementById('backBtn');
  const settingsBackBtn = document.getElementById('settingsBackBtn');
  const reviewAllBtn = document.getElementById('reviewAllBtn');
  
  const wordText = document.getElementById('wordText');
  const speakBtn = document.getElementById('speakBtn');
  const phoneticsContainer = document.getElementById('phoneticsContainer');
  const showPhoneticsBtn = document.getElementById('showPhoneticsBtn');
  const phoneticsText = document.getElementById('phoneticsText');
  const optionsContainer = document.getElementById('optionsContainer');
  const progressBar = document.getElementById('progressBar');
  const reviewedCountEl = document.getElementById('reviewedCount');
  const totalReviewCountEl = document.getElementById('totalReviewCount');
  
  const wordList = document.getElementById('wordList');
  const totalWordsEl = document.getElementById('totalWords');

  // Settings Elements
  const apiKeyInput = document.getElementById('apiKeyInput');
  const apiKeyCountBadge = document.getElementById('apiKeyCountBadge');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const testApiBtn = document.getElementById('testApiBtn');
  const settingsStatusMsg = document.getElementById('settingsStatusMsg');
  const testResultsSection = document.getElementById('testResultsSection');
  const testResultsList = document.getElementById('testResultsList');

  // State
  let allWords = {};
  let reviewQueue = [];
  let currentCardIndex = 0;
  let reviewedCount = 0;
  let forceReviewAll = false;
  let currentMode = "1";
  let currentUtterance = null; // Global để tránh garbage collection

  // Khởi động voices sớm
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
  }

  // Navigation
  function showState(stateEl) {
    [loadingState, emptyState, flashcardState, manageState, settingsState].forEach(el => {
      if (el) el.classList.remove('active');
    });
    if (stateEl) stateEl.classList.add('active');
  }

  manageBtn.addEventListener('click', () => {
    renderManageList();
    showState(manageState);
  });

  settingsBtn.addEventListener('click', () => {
    loadSettings();
    showState(settingsState);
  });

  backBtn.addEventListener('click', () => {
    initFlashcards();
  });

  settingsBackBtn.addEventListener('click', () => {
    initFlashcards();
  });

  reviewAllBtn.addEventListener('click', () => {
    forceReviewAll = true;
    initFlashcards();
  });

  modeSelect.addEventListener('change', (e) => {
    currentMode = e.target.value;
    chrome.storage.local.set({ flashcard_mode: currentMode });
    initFlashcards();
  });

  // Settings Logic
  function parseApiKeys(text) {
    if (!text) return [];
    return text
      .split(/[\n,;]+/)
      .map(k => k.trim())
      .filter(k => k.length > 0);
  }

  function updateKeyBadge() {
    const keys = parseApiKeys(apiKeyInput.value);
    apiKeyCountBadge.textContent = `${keys.length} key${keys.length > 1 ? 's' : ''}`;
  }

  apiKeyInput.addEventListener('input', updateKeyBadge);

  function loadSettings() {
    settingsStatusMsg.className = 'settings-status-msg';
    settingsStatusMsg.textContent = '';
    testResultsSection.classList.add('hidden');
    testResultsList.innerHTML = '';
    
    chrome.storage.local.get("gemini_api_keys", (result) => {
      let keys = result.gemini_api_keys || [];
      if (typeof keys === 'string') {
        keys = parseApiKeys(keys);
      }
      if (Array.isArray(keys)) {
        apiKeyInput.value = keys.join('\n');
        updateKeyBadge();
      }
    });
  }

  saveSettingsBtn.addEventListener('click', () => {
    const keys = parseApiKeys(apiKeyInput.value);
    chrome.storage.local.set({ gemini_api_keys: keys }, () => {
      settingsStatusMsg.className = 'settings-status-msg success';
      settingsStatusMsg.textContent = `✅ Đã lưu ${keys.length} API Key thành công!`;
      updateKeyBadge();
      setTimeout(() => {
        if (settingsStatusMsg.classList.contains('success')) {
          settingsStatusMsg.textContent = '';
          settingsStatusMsg.className = 'settings-status-msg';
        }
      }, 3000);
    });
  });

  testApiBtn.addEventListener('click', () => {
    const keys = parseApiKeys(apiKeyInput.value);
    if (keys.length === 0) {
      settingsStatusMsg.className = 'settings-status-msg error';
      settingsStatusMsg.textContent = '❌ Vui lòng nhập ít nhất 1 API Key trước khi kiểm tra!';
      return;
    }

    testApiBtn.disabled = true;
    testApiBtn.textContent = '⏳ Đang kiểm tra...';
    settingsStatusMsg.className = 'settings-status-msg info';
    settingsStatusMsg.textContent = 'Đang kiểm tra kết nối với Gemini...';
    testResultsSection.classList.add('hidden');
    testResultsList.innerHTML = '';

    chrome.runtime.sendMessage({ type: "TEST_API_KEYS", keys: keys }, (response) => {
      testApiBtn.disabled = false;
      testApiBtn.textContent = '⚡ Kiểm tra kết nối';

      if (chrome.runtime.lastError || !response || response.error) {
        settingsStatusMsg.className = 'settings-status-msg error';
        settingsStatusMsg.textContent = '❌ ' + (response?.error || chrome.runtime.lastError?.message || 'Lỗi kiểm tra');
        return;
      }

      const results = response.results || [];
      const successCount = results.filter(r => r.status === 'success').length;

      if (successCount === results.length && results.length > 0) {
        settingsStatusMsg.className = 'settings-status-msg success';
        settingsStatusMsg.textContent = `✅ Toàn bộ ${results.length} API Key đều hoạt động tốt!`;
      } else if (successCount > 0) {
        settingsStatusMsg.className = 'settings-status-msg info';
        settingsStatusMsg.textContent = `⚠️ ${successCount}/${results.length} API Key hợp lệ.`;
      } else {
        settingsStatusMsg.className = 'settings-status-msg error';
        settingsStatusMsg.textContent = `❌ Tất cả API Key đều không hợp lệ hoặc hết hạn!`;
      }

      testResultsList.innerHTML = '';
      results.forEach(r => {
        const item = document.createElement('div');
        item.className = `test-result-item ${r.status}`;
        item.innerHTML = `
          <span class="test-key-name">Key #${r.keyIndex} (${r.maskedKey})</span>
          <span class="test-key-status">${r.status === 'success' ? '✅ ' + r.message : '❌ ' + r.message}</span>
        `;
        testResultsList.appendChild(item);
      });
      testResultsSection.classList.remove('hidden');
    });
  });

  // Initialization
  function loadWords(callback) {
    chrome.storage.local.get(["saved_flashcards", "flashcard_mode"], (result) => {
      allWords = result.saved_flashcards || {};
      if (result.flashcard_mode) {
        currentMode = result.flashcard_mode;
        modeSelect.value = currentMode;
      }
      callback();
    });
  }

  function initFlashcards() {
    showState(loadingState);
    loadWords(() => {
      const now = Date.now();
      const wordKeys = Object.keys(allWords);
      
      if (wordKeys.length === 0) {
        emptyState.querySelector('p').textContent = "Bạn chưa lưu từ vựng nào. Hãy quét văn bản để lưu!";
        emptyState.querySelector('h2').textContent = "Trống";
        reviewAllBtn.style.display = 'none';
        showState(emptyState);
        return;
      }

      if (wordKeys.length < 4) {
        emptyState.querySelector('p').textContent = "Cần ít nhất 4 từ vựng để tạo bài kiểm tra. Hiện tại bạn có " + wordKeys.length + " từ.";
        emptyState.querySelector('h2').textContent = "Chưa đủ từ";
        reviewAllBtn.style.display = 'none';
        showState(emptyState);
        return;
      }

      reviewAllBtn.style.display = 'inline-block';

      if (forceReviewAll) {
        reviewQueue = wordKeys.map(k => allWords[k]);
      } else {
        reviewQueue = wordKeys
          .map(k => allWords[k])
          .filter(w => (w.nextReview || 0) <= now);
      }

      // Shuffle
      reviewQueue.sort(() => Math.random() - 0.5);

      currentCardIndex = 0;
      reviewedCount = 0;
      totalReviewCountEl.textContent = reviewQueue.length;
      reviewedCountEl.textContent = reviewedCount;

      if (reviewQueue.length === 0) {
        emptyState.querySelector('p').textContent = "Bạn đã hoàn thành tất cả từ vựng hôm nay.";
        emptyState.querySelector('h2').textContent = "Chúc mừng!";
        showState(emptyState);
      } else {
        showState(flashcardState);
        renderCard();
      }
    });
  }

  // Flashcard Rendering & Logic
  function renderCard() {
    if (currentCardIndex >= reviewQueue.length) {
      emptyState.querySelector('p').textContent = "Bạn đã hoàn thành phiên ôn tập!";
      emptyState.querySelector('h2').textContent = "Hoàn thành!";
      showState(emptyState);
      return;
    }

    const item = reviewQueue[currentCardIndex];
    
    // Update progress
    progressBar.style.width = `${(reviewedCount / reviewQueue.length) * 100}%`;
    reviewedCountEl.textContent = reviewedCount;

    // Reset phonetics
    if (item.phonetics && item.phonetics.trim()) {
      phoneticsContainer.style.display = 'block';
      phoneticsText.textContent = item.phonetics;
      phoneticsText.classList.add('hidden');
      showPhoneticsBtn.style.display = 'inline-block';
    } else {
      phoneticsContainer.style.display = 'none';
    }

    optionsContainer.innerHTML = '';

    if (currentMode === "1") {
      // Mode 1: Hiển thị Word -> Chọn Nghĩa (Meaning)
      wordText.textContent = item.word;
      speakBtn.style.display = 'inline-flex';

      speakBtn.onclick = () => {
        speakText(item.word);
      };

      const options = generateOptions(item, 'meaning');
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt.text;
        btn.addEventListener('click', () => handleAnswer(btn, opt.isCorrect, item));
        optionsContainer.appendChild(btn);
      });

    } else {
      // Mode 2: Hiển thị Nghĩa/Định nghĩa -> Chọn Word
      wordText.textContent = item.definition || item.meaning;
      speakBtn.style.display = 'none'; // Không phát âm đáp án

      const options = generateOptions(item, 'word');
      options.forEach(opt => {
        const btn = document.createElement('button');
        btn.className = 'option-btn';
        btn.textContent = opt.text;
        btn.addEventListener('click', () => handleAnswer(btn, opt.isCorrect, item));
        optionsContainer.appendChild(btn);
      });
    }
  }

  function generateOptions(currentItem, targetProp) {
    const correctOption = {
      text: currentItem[targetProp],
      isCorrect: true
    };

    const otherWords = Object.values(allWords).filter(w => w.word !== currentItem.word);
    otherWords.sort(() => Math.random() - 0.5);
    
    const distractors = otherWords.slice(0, 3).map(w => ({
      text: w[targetProp] || w.meaning,
      isCorrect: false
    }));

    const options = [correctOption, ...distractors];
    options.sort(() => Math.random() - 0.5);
    return options;
  }

  function handleAnswer(selectedBtn, isCorrect, item) {
    // Disable all options
    const allBtns = optionsContainer.querySelectorAll('.option-btn');
    allBtns.forEach(btn => btn.disabled = true);

    if (isCorrect) {
      selectedBtn.classList.add('correct');
      updateSpacedRepetition(item, true);
    } else {
      selectedBtn.classList.add('incorrect');
      allBtns.forEach(btn => {
        const matchProp = (currentMode === "1") ? item.meaning : item.word;
        if (btn.textContent === matchProp) {
          btn.classList.add('correct');
        }
      });
      updateSpacedRepetition(item, false);
    }

    reviewedCount++;
    progressBar.style.width = `${(reviewedCount / reviewQueue.length) * 100}%`;
    reviewedCountEl.textContent = reviewedCount;

    setTimeout(() => {
      currentCardIndex++;
      renderCard();
    }, 1200);
  }

  // Spaced Repetition Logic (Leitner System simplified)
  // Intervals: Level 0: 4h, Level 1: 1d, Level 2: 3d, Level 3: 7d, Level 4: 14d, Level 5: 30d
  const INTERVALS = [
    4 * 60 * 60 * 1000,
    1 * 24 * 60 * 60 * 1000,
    3 * 24 * 60 * 60 * 1000,
    7 * 24 * 60 * 60 * 1000,
    14 * 24 * 60 * 60 * 1000,
    30 * 24 * 60 * 60 * 1000
  ];

  function updateSpacedRepetition(item, isSuccess) {
    const key = item.word.toLowerCase();
    if (!allWords[key]) return;

    let streak = allWords[key].streak || 0;

    if (isSuccess) {
      streak += 1;
    } else {
      streak = 0; // Reset on failure
    }

    const intervalIndex = Math.min(streak, INTERVALS.length - 1);
    const nextInterval = INTERVALS[intervalIndex];
    
    allWords[key].streak = streak;
    allWords[key].nextReview = Date.now() + nextInterval;
    allWords[key].lastReviewed = Date.now();

    // Check if definition is missing in Mode 2
    if (!allWords[key].definition) {
      fetchDefinitionForWord(allWords[key].word);
    }

    chrome.storage.local.set({ saved_flashcards: allWords });
  }

  function fetchDefinitionForWord(word) {
    chrome.runtime.sendMessage({ type: "GENERATE_DEFINITION", word: word }, (res) => {
      if (res && res.result && !res.error) {
        const key = word.toLowerCase();
        if (allWords[key]) {
          allWords[key].definition = res.result;
          chrome.storage.local.set({ saved_flashcards: allWords });
        }
      }
    });
  }

  // Word Management View Logic
  function renderManageList() {
    wordList.innerHTML = '';
    const keys = Object.keys(allWords);
    totalWordsEl.textContent = keys.length;

    if (keys.length === 0) {
      wordList.innerHTML = '<li style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có từ vựng nào được lưu.</li>';
      return;
    }

    // Sort by addedAt descending
    keys.sort((a, b) => (allWords[b].addedAt || 0) - (allWords[a].addedAt || 0));

    keys.forEach(k => {
      const w = allWords[k];
      const li = document.createElement('li');
      li.className = 'word-item';
      
      const streak = w.streak || 0;
      
      li.innerHTML = `
        <div class="word-info">
          <strong>${w.word}</strong>
          <span>${w.meaning} (Lặp: ${streak})</span>
        </div>
        <button class="delete-btn" title="Xóa">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      `;

      li.querySelector('.delete-btn').addEventListener('click', () => {
        delete allWords[k];
        chrome.storage.local.set({ saved_flashcards: allWords }, () => {
          renderManageList();
        });
      });

      wordList.appendChild(li);
    });
  }

  showPhoneticsBtn.addEventListener('click', () => {
    phoneticsText.classList.remove('hidden');
    showPhoneticsBtn.style.display = 'none';
    const currentWord = reviewQueue[currentCardIndex];
    if (currentWord) {
      speakText(currentWord.word);
    }
  });

  phoneticsText.style.cursor = 'pointer';
  phoneticsText.title = "Nghe phát âm";
  phoneticsText.addEventListener('click', () => {
    const currentWord = reviewQueue[currentCardIndex];
    if (currentWord) {
      speakText(currentWord.word);
    }
  });

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

  // Start
  initFlashcards();
});
