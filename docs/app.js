// Demo conversation data
const DEMO_DATA = {
  ammo: {
    title: "ammo_vs_armor",
    query: "What ammo penetrates class 5 armor?",
    response: "Top choices: 7.62x51mm M61 (64 pen), 7.62x54mmR SNB (62 pen), and 5.56x45mm SSA AP (56 pen) will reliably pierce Class 5 armor on the first shot. Budget pick: 7.62x39mm PP or 5.56mm M855A1 will break through after 2-3 hits.",
    tag: "Source: tarkov.dev live ammo table"
  },
  value: {
    title: "item_value",
    query: "Should I keep this LEDX or sell it?",
    response: "Keep it if you haven't completed 'Private Clinic' (Therapist) or need Medstation Level 3. If completed, sell on Flea Market for ~850,000₽ (or ~360,000₽ to Therapist if not Found in Raid).",
    tag: "Source: Flea Market live avg & Quest DB"
  },
  quest: {
    title: "quest_info",
    query: "Where is the pocket watch on Customs?",
    response: "Inside the cab of the orange fuel tanker in the construction area. You need the Machinery Key, which spawns in Room 205 of the 3-story dorms.",
    tag: "Quest: Checking (Prapor)"
  },
  extract: {
    title: "map_info",
    query: "Is ZB-013 extract open on Customs?",
    response: "ZB-013 is a conditional extract in the Factory basement. It requires the Factory Exit Key AND the power switch in Warehouse 4 must be turned on.",
    tag: "Map: Customs extracts"
  }
};

// Initialize dynamic behavior
document.addEventListener("DOMContentLoaded", () => {
  setupDemoTabs();
  setupFaqAccordion();
  detectOSAndHighlightDownload();
  fetchLatestRelease();
});

// Demo tab switcher
function setupDemoTabs() {
  const tabs = document.querySelectorAll(".demo-tab-btn");
  const userText = document.getElementById("demo-user-text");
  const aiText = document.getElementById("demo-ai-text");
  const dataTag = document.getElementById("demo-data-tag");

  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      const key = tab.dataset.demo;
      const data = DEMO_DATA[key];
      if (!data) return;

      // Animate transition
      userText.style.opacity = "0";
      aiText.style.opacity = "0";

      setTimeout(() => {
        userText.textContent = `"${data.query}"`;
        aiText.textContent = data.response;
        dataTag.textContent = data.tag;
        userText.style.opacity = "1";
        aiText.style.opacity = "1";
      }, 150);
    });
  });
}

// FAQ Accordion
function setupFaqAccordion() {
  const faqItems = document.querySelectorAll(".faq-item");
  faqItems.forEach(item => {
    const question = item.querySelector(".faq-question");
    question.addEventListener("click", () => {
      const isOpen = item.classList.contains("open");
      // Close other open items
      faqItems.forEach(other => other.classList.remove("open"));
      if (!isOpen) {
        item.classList.add("open");
      }
    });
  });
}

// Highlight download button matching user OS
function detectOSAndHighlightDownload() {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const winBtn = document.querySelectorAll(".btn-win");
  const macBtn = document.querySelectorAll(".btn-mac");

  if (userAgent.includes("mac")) {
    macBtn.forEach(btn => {
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
    });
    winBtn.forEach(btn => {
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-secondary");
    });
  } else {
    // Default to Windows
    winBtn.forEach(btn => {
      btn.classList.remove("btn-secondary");
      btn.classList.add("btn-primary");
    });
    macBtn.forEach(btn => {
      btn.classList.remove("btn-primary");
      btn.classList.add("btn-secondary");
    });
  }
}

// Fetch latest release from GitHub API
async function fetchLatestRelease() {
  const repo = "guivinicius/tarkov-operator";
  const defaultReleasesUrl = `https://github.com/${repo}/releases`;
  const versionLabel = document.getElementById("latest-version-label");
  const winDownloadBtns = document.querySelectorAll(".download-win-link");
  const macDownloadBtns = document.querySelectorAll(".download-mac-link");

  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`);
    if (!response.ok) throw new Error("Release not found");
    const data = await response.json();

    if (versionLabel && data.tag_name) {
      versionLabel.textContent = `Latest: ${data.tag_name}`;
    }

    let winAsset = data.assets?.find(a => a.name.endsWith(".exe"));
    let macAsset = data.assets?.find(a => a.name.endsWith(".dmg"));

    if (winAsset) {
      winDownloadBtns.forEach(btn => btn.href = winAsset.browser_download_url);
    } else {
      winDownloadBtns.forEach(btn => btn.href = data.html_url || defaultReleasesUrl);
    }

    if (macAsset) {
      macDownloadBtns.forEach(btn => btn.href = macAsset.browser_download_url);
    } else {
      macDownloadBtns.forEach(btn => btn.href = data.html_url || defaultReleasesUrl);
    }
  } catch (err) {
    // Fallback gracefully
    if (versionLabel) versionLabel.textContent = "Latest Release";
    winDownloadBtns.forEach(btn => btn.href = defaultReleasesUrl);
    macDownloadBtns.forEach(btn => btn.href = defaultReleasesUrl);
  }
}
