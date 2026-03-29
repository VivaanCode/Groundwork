// @ts-nocheck
const path = require("path");
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_KEY });
const express = require("express");
const session = require("express-session");
const { google } = require("googleapis");
const fs = require("fs");

const app = express();
const fallbackPort = 3000;
const envPort = process.env.PORT ? Number(process.env.PORT) : null;

app.use(express.urlencoded({ extended: true }));
app.use(
    session({
        secret: process.env.SESSION_SECRET || "classloop-secret-key",
        resave: false,
        saveUninitialized: false,
    })
);

// --- Persistent DB ---
const dbPath = path.join(__dirname, 'db.json');
const db = {
    users: {}, // googleId -> { id, role, name, email, picture, classCode, schoolId }     
    teachersByCode: {}, // code -> googleId
    lessons: {},
    assignments: {},
    studentProgress: {},
    messages: [],
    schools: {}, // schoolId -> { id, name, code, teacherIds }
    schoolsByCode: {} // code -> schoolId
};

if (fs.existsSync(dbPath)) {
    try {
        const loadedDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        Object.assign(db, loadedDb);
        if (!db.schools) db.schools = {};
        if (!db.schoolsByCode) db.schoolsByCode = {};
    } catch (e) {
        console.error('Failed to load db.json', e);
    }
}

// Auto-save the database to disk every 5 seconds
setInterval(() => {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
}, 5000);

// Ensure we save on exit
process.on('SIGINT', () => {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));
    process.exit();
});

function generateCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

// --- OAuth Setup ---
const credentialsPath = path.join(__dirname, "credentials.json");
const rawCredentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
const oauthConfig = rawCredentials.web || rawCredentials.installed;

const configuredRedirectUri = process.env.NODE_ENV === 'production' || true ? "https://classloop.xyz/auth/google/callback" : `http://localhost:${envPort || fallbackPort}/auth/google/callback`;

function getRedirectUri(req) {
    return "https://classloop.xyz/auth/google/callback";
}

function createOAuthClient(req) {
    const redirectUri = req ? getRedirectUri(req) : configuredRedirectUri;
    return new google.auth.OAuth2(oauthConfig.client_id, oauthConfig.client_secret, redirectUri);
}

function getAuthedOAuthClient(req) {
    if (!req.session.tokens) return null;
    const client = createOAuthClient(req);
    client.setCredentials(req.session.tokens);
    return client;
}

// --- Gmail Logic ---
async function fetchEmails(authClient) {
    const gmail = google.gmail({ version: "v1", auth: authClient });
    const list = await gmail.users.messages.list({ userId: "me", maxResults: 8 });
    const messages = list.data.messages || [];
    
    return await Promise.all(messages.map(async (m) => {
        const detail = await gmail.users.messages.get({ userId: "me", id: m.id, format: "metadata", metadataHeaders: ["From", "Subject", "Date"] });
        const headers = detail.data.payload?.headers || [];
        const rawFrom = headers.find(h => h.name === "From")?.value || "Unknown";
        return {
            id: m.id,
            from: rawFrom.split('<')[0].trim(),
            rawFrom: rawFrom,
            subject: headers.find(h => h.name === "Subject")?.value || "(No Subject)",
            date: new Date(headers.find(h => h.name === "Date")?.value).toLocaleDateString(),
            snippet: detail.data.snippet || ""
        };
    }));
}

// --- UI Templates ---

function renderLandingPage() {
return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClassLoop — The Unified Learning OS</title>
  
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap" rel="stylesheet">

  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Inter', 'sans-serif'],
          },
          colors: {
            zinc: {
              950: '#09090b',
            },
            accent: '#E67E22',
            brand: {
              50: '#f5f3ff',
              100: '#ede9fe',
              500: '#8b5cf6',
              600: '#5A51E1',
            }
          }
        }
      }
    }
  </script>

  <style>
    body { background-color: #fbfbfb; color: #18181b; -webkit-font-smoothing: antialiased; }
    
    @keyframes slideUp {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-in {
      animation: slideUp 0.4s ease-out forwards;
      opacity: 0;
    }
    .delay-1 { animation-delay: 0.1s; }
    .delay-2 { animation-delay: 0.2s; }
    
    .custom-scroll::-webkit-scrollbar { width: 3px; }
    .custom-scroll::-webkit-scrollbar-track { background: transparent; }
    .custom-scroll::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 10px; }
    
    .app-border { border: 1px solid #e4e4e7; }
    
    .tab-active {
      color: #18181b;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 1px rgba(0,0,0,0.02);
      border: 1px solid #e4e4e7;
    }

    .glass-nav {
      background: rgba(255, 255, 255, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
    }
  </style>
</head>
<body class="selection:bg-brand-100 selection:text-brand-600">

  <nav class="fixed top-0 w-full z-50 glass-nav border-b border-zinc-100">
    <div class="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[4px]">
          <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
        </div>
        <span class="font-semibold text-[15px] tracking-tight text-zinc-900">ClassLoop</span>
      </div>
      <div class="flex items-center gap-3">
        <a href="/student/login" class="text-zinc-600 hover:text-zinc-900 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all">Student login</a>
        <a href="/teacher/login" class="bg-zinc-950 text-white px-4 py-1.5 rounded-md text-[13px] font-medium hover:bg-zinc-800 transition-all shadow-sm">Teacher login</a>
      </div>
    </div>
  </nav>

  <header class="pt-32 pb-12 px-6">
    <div class="max-w-4xl mx-auto text-center">
      <h1 class="text-4xl md:text-[52px] font-semibold tracking-tighter text-zinc-950 mb-5 animate-in leading-[1.1]">
        The Dashboard Your Classroom Needs
      </h1>
      <p class="text-[17px] text-zinc-500 max-w-xl mx-auto animate-in delay-1 font-normal leading-relaxed">
        From Busywork to Framework      </p>
    </div>
  </header>

  <section class="pb-24 px-6">
    <div class="max-w-[1200px] mx-auto">
      
      <!-- Interactive Tabs -->
      <div class="flex justify-center mb-8 animate-in delay-2 sticky top-20 z-40">
        <div class="bg-zinc-100/80 backdrop-blur-md p-1.5 rounded-lg inline-flex border border-zinc-200 shadow-sm gap-1 flex-wrap justify-center">
          <button data-target="student-view" class="tab-btn active tab-active px-4 py-1.5 rounded-md text-[13px] font-medium transition-all flex items-center gap-2">
            Student Workspace
          </button>
          <button data-target="guide-view" class="tab-btn px-4 py-1.5 rounded-md text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-all flex items-center gap-2">
            Interactive Guide
          </button>
          <button data-target="lesson-view" class="tab-btn px-4 py-1.5 rounded-md text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-all flex items-center gap-2">
            Guided Lesson
          </button>
          <button data-target="teacher-view" class="tab-btn px-4 py-1.5 rounded-md text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-all flex items-center gap-2">
            Teacher Dashboard
          </button>
        </div>
      </div>

      <!-- Main App Window -->
      <div class="bg-white rounded-xl app-border shadow-[0_8px_40px_rgb(0,0,0,0.06)] overflow-hidden h-[750px] flex flex-col relative animate-in delay-2">
        
        <!-- Browser Chrome -->
        <div class="h-10 border-b border-zinc-100 flex items-center px-4 gap-2 bg-[#fcfcfc] shrink-0">
          <div class="flex gap-1.5">
            <div class="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e]"></div>
            <div class="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dea123]"></div>
            <div class="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]"></div>
          </div>
          <div class="mx-auto flex items-center gap-2 text-[11px] font-medium text-zinc-500 bg-white border border-zinc-200 px-4 py-1 rounded-md shadow-sm w-64 justify-center">
            <i data-lucide="lock" class="w-3 h-3"></i> classloop.xyz
          </div>
          <div class="w-[52px]"></div> <!-- Spacer for centering -->
        </div>

        <!-- 1. STUDENT VIEW -->
        <div id="student-view" class="view-panel flex-1 flex flex-col h-full bg-[#fafafa]">
          <!-- Top Nav -->
          <div class="h-16 bg-white border-b border-zinc-100 flex items-center justify-between px-8 shrink-0">
            <div class="flex items-center gap-2">
              <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[4px]">
                <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
              </div>
              <span class="font-semibold text-[15px] tracking-tight text-zinc-900">ClassLoop</span>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <div class="text-[13px] font-semibold text-zinc-900">Jeremiah Joseph</div>
                <div class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Student</div>
              </div>
              <img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQP9dtrsRV0DbONcKNfqA0wThRa8XjA7ii-VQ&s" class="w-8 h-8 rounded-full border border-zinc-200 object-cover" alt="Student">
              <button class="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 ml-2">Sign Out</button>
            </div>
          </div>
          
          <!-- Student Content -->
          <div class="flex-1 p-8 overflow-y-auto custom-scroll flex justify-center">
            <div class="w-full max-w-5xl">
              <!-- Header -->
              <div class="flex justify-between items-center mb-10">
                <h1 class="text-[28px] font-bold text-zinc-900 tracking-tight">Student Workspace</h1>
                <div class="flex items-center gap-2 px-3 py-1.5 bg-white border border-zinc-200 rounded-lg shadow-sm">
                  <i data-lucide="monitor" class="w-4 h-4 text-zinc-400"></i>
                  <span class="text-[13px] font-medium text-zinc-600">Class: Vivaan S</span>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                <!-- Left Column -->
                <div class="md:col-span-2 space-y-8">
                  
                  <!-- Current Tasks -->
                  <section>
                    <h3 class="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] mb-3 ml-1">Current Tasks & Lessons</h3>
                    <div class="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm transition-shadow hover:shadow-md">
                      <div class="flex items-center justify-between">
                        <div class="flex items-center gap-4">
                          <div class="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center border border-blue-100">
                            <i data-lucide="compass" class="w-5 h-5 text-blue-500"></i>
                          </div>
                          <div>
                            <div class="flex items-center gap-2 mb-1">
                              <h4 class="text-[15px] font-bold text-zinc-900">How to access your math assignments</h4>
                              <span class="px-2 py-0.5 bg-blue-50 text-blue-600 text-[9px] font-bold uppercase rounded tracking-wider">Guide</span>
                            </div>
                            <p class="text-[12px] text-zinc-500 font-medium">Due: 3/27/2026 • Progress: 0%</p>
                          </div>
                        </div>
                        <button class="px-4 py-2 border border-zinc-200 text-zinc-700 text-[13px] font-medium rounded-lg hover:bg-zinc-50 transition-colors shadow-sm">
                          Open Link
                        </button>
                      </div>
                    </div>
                  </section>

                  <!-- Completed Lessons -->
                  <section>
                    <h3 class="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] mb-3 ml-1">Completed Lessons</h3>
                    <div class="bg-white border border-zinc-200 rounded-xl p-12 text-center shadow-sm">
                      <p class="text-[13px] text-zinc-500 font-medium">No completed lessons yet.</p>
                    </div>
                  </section>

                </div>

                <!-- Right Column -->
                <div class="md:col-span-1">
                  <div class="bg-[#f5f6ff] border border-[#e4e6fb] rounded-xl p-8 text-center flex flex-col items-center">
                    <div class="w-14 h-14 rounded-full bg-white flex items-center justify-center shadow-sm mb-5 text-[#5A51E1]">
                      <i data-lucide="life-buoy" class="w-7 h-7"></i>
                    </div>
                    <h3 class="text-[18px] font-bold text-[#1a1c29] mb-3 tracking-tight">Need Teacher Help?</h3>
                    <p class="text-[13px] text-[#555870] leading-relaxed mb-6">
                      Don't stay blocked. Access AI tools, peer networks, and your teacher to overcome roadblocks.
                    </p>
                    <button class="w-full py-2.5 bg-[#5A51E1] text-white text-[13px] font-semibold rounded-lg hover:bg-[#4b43c6] transition-colors shadow-sm">
                      Contact Teacher
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. INTERACTIVE GUIDE VIEW (GitHub Clone) -->
        <div id="guide-view" class="view-panel hidden flex-1 flex h-full overflow-hidden">
          
          <!-- External Site (GitHub clone) -->
          <div class="flex-1 bg-[#0d1117] flex flex-col relative border-r border-zinc-200 overflow-y-auto custom-scroll">
            <!-- Mock Header -->
            <div class="h-14 bg-[#161b22] border-b border-[#30363d] flex items-center justify-between px-6 shrink-0 z-10 sticky top-0">
              <div class="flex items-center gap-4 text-[#c9d1d9]">
                <i data-lucide="github" class="w-6 h-6 text-white"></i>
                <span class="text-[14px] font-semibold">VivaanCode</span>
              </div>
              <div class="flex items-center gap-3">
                <div class="bg-[#0d1117] border border-[#30363d] rounded-md px-3 py-1.5 flex items-center gap-2 text-[#8b949e] w-64">
                  <i data-lucide="search" class="w-3.5 h-3.5"></i>
                  <span class="text-[12px]">Type <span class="border border-[#30363d] rounded px-1 ml-0.5 mr-0.5">/</span> to search</span>
                </div>
                <div class="w-7 h-7 rounded-full bg-[#30363d] overflow-hidden">
                   <img src="https://images.unsplash.com/photo-1599566150163-29194dcaad36?auto=format&fit=crop&q=80&w=100" class="w-full h-full object-cover grayscale">
                </div>
              </div>
            </div>

            <!-- Warning Banner -->
            <div class="bg-[#1f2428] border-b border-[#30363d] p-3 flex items-center gap-2 text-[#8b949e] text-[12px]">
              <i data-lucide="info" class="w-4 h-4 text-blue-400"></i>
              On April 24 we'll start using GitHub Copilot interaction data for AI model training unless you opt out. <a href="#" class="text-blue-400 hover:underline">Review this update</a>
            </div>

            <!-- Profile Nav (with focus element) -->
            <div class="flex items-center gap-6 px-8 mt-6 border-b border-[#30363d] z-10 sticky top-14 bg-[#0d1117]">
              <div class="pb-3 text-[#8b949e] text-[13px] flex items-center gap-2 cursor-pointer hover:text-[#c9d1d9]"><i data-lucide="book-open" class="w-4 h-4"></i> Overview</div>
              
              <!-- Spotlight Area for the Guide -->
              <div class="relative z-20">
                <div class="absolute -inset-2 border-[3px] border-orange-400 rounded-lg animate-pulse z-0 bg-[#0d1117]"></div>
                <div class="pb-3 text-[#c9d1d9] text-[13px] font-semibold flex items-center gap-2 relative z-10 border-b-2 border-[#f78166] pt-1">
                  <i data-lucide="folder-git-2" class="w-4 h-4"></i> Repositories
                  <span class="bg-[#30363d] text-[#c9d1d9] text-[11px] px-1.5 py-0.5 rounded-full font-medium">18</span>
                </div>
              </div>
              
              <div class="pb-3 text-[#8b949e] text-[13px] flex items-center gap-2 cursor-pointer hover:text-[#c9d1d9]"><i data-lucide="layout" class="w-4 h-4"></i> Projects</div>
              <div class="pb-3 text-[#8b949e] text-[13px] flex items-center gap-2 cursor-pointer hover:text-[#c9d1d9]"><i data-lucide="package" class="w-4 h-4"></i> Packages</div>
              <div class="pb-3 text-[#8b949e] text-[13px] flex items-center gap-2 cursor-pointer hover:text-[#c9d1d9]"><i data-lucide="star" class="w-4 h-4"></i> Stars <span class="bg-[#30363d] px-1.5 py-0.5 rounded-full text-[11px]">3</span></div>
            </div>

            <!-- Profile Content -->
            <div class="flex-1 p-8 flex flex-col md:flex-row gap-8 relative z-0">
              <div class="w-64 shrink-0">
                <div class="w-64 h-64 bg-[#161b22] rounded-full border border-[#30363d] flex items-center justify-center text-[#c9d1d9] text-[80px] font-bold mb-4 overflow-hidden relative shadow-lg">
                  <span class="opacity-50 tracking-tighter">V\S</span>
                </div>
                <h2 class="text-2xl font-bold text-[#c9d1d9]">Vivaan</h2>
                <div class="text-[16px] text-[#8b949e] mb-4">VivaanCode • he/him</div>
                <button class="w-full py-1.5 bg-[#21262d] border border-[#30363d] text-[#c9d1d9] rounded-md text-[13px] font-medium mb-4 hover:bg-[#30363d] transition-colors">Follow</button>
                <div class="text-[14px] text-[#c9d1d9] mb-4">yay</div>
                <div class="text-[13px] text-[#8b949e] flex items-center gap-1.5 mb-2">
                  <i data-lucide="users" class="w-3.5 h-3.5"></i> <strong class="text-[#c9d1d9]">0</strong> followers • <strong class="text-[#c9d1d9]">1</strong> following
                </div>
                <div class="text-[13px] text-[#8b949e] flex items-center gap-1.5 mb-1">
                  <i data-lucide="clock" class="w-3.5 h-3.5"></i> 17:23 - same time
                </div>
                <div class="text-[13px] text-[#8b949e] flex items-center gap-1.5 mb-6">
                  <i data-lucide="link" class="w-3.5 h-3.5"></i> <a href="#" class="text-[#c9d1d9] hover:underline hover:text-blue-400">vivaan.dev</a>
                </div>
              </div>

              <div class="flex-1 space-y-6">
                <!-- README -->
                <div class="text-[#8b949e] text-[12px] mb-2 font-medium">VivaanCode / README.md</div>
                <h3 class="text-[20px] font-bold text-[#c9d1d9] mb-2">Hey 👋 I'm Vivaan</h3>
                <h4 class="text-[24px] font-bold text-[#1f6feb] mb-6 tracking-tight">Fullstack developer</h4>
                
                <!-- Hackatime Stats -->
                <div class="border border-[#30363d] rounded-xl p-6 bg-[#0d1117] shadow-sm">
                  <h4 class="text-[15px] font-semibold text-[#c9d1d9] mb-5 tracking-wide text-red-400/80">Hackatime Stats</h4>
                  <div class="flex h-2.5 rounded-full overflow-hidden mb-5 bg-[#30363d]">
                    <div class="bg-blue-500 w-[45%]"></div>
                    <div class="bg-yellow-400 w-[25%]"></div>
                    <div class="bg-red-500 w-[15%]"></div>
                    <div class="bg-purple-500 w-[10%]"></div>
                    <div class="bg-zinc-500 w-[5%]"></div>
                  </div>
                  <div class="grid grid-cols-2 gap-y-3 text-[12px] text-[#8b949e]">
                    <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Python - 26h 34m</div>
                    <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-yellow-400"></span> JavaScript - 13h 13m</div>
                    <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-red-500"></span> HTML - 13h 9m</div>
                    <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-purple-500"></span> CSS - 3h 54m</div>
                    <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-orange-400"></span> Java - 9h 18m</div>
                    <div class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full bg-zinc-500"></span> Other - 4h 29m</div>
                  </div>
                </div>

                <div class="text-[14px] text-[#c9d1d9] mt-8 mb-4 font-medium">Pinned</div>
                <!-- Pinned Repos -->
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <!-- Repo 1 -->
                   <div class="border border-[#30363d] rounded-xl p-4 bg-[#0d1117] flex flex-col hover:border-[#8b949e] transition-colors cursor-pointer">
                     <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="book-marked" class="w-4 h-4 text-[#8b949e]"></i>
                        <span class="text-[14px] font-semibold text-blue-400 hover:underline">Urlshort</span>
                        <span class="px-2 py-0.5 border border-[#30363d] rounded-full text-[10px] text-[#8b949e]">Public</span>
                     </div>
                     <p class="text-[12px] text-[#8b949e] mb-4 flex-1">One of the first projects I've made. A simple Flask URL shortener.</p>
                     <div class="flex items-center gap-2 text-[12px] text-[#8b949e]">
                       <span class="w-3 h-3 rounded-full bg-blue-500"></span> Python
                     </div>
                   </div>
                   <!-- Repo 2 -->
                   <div class="border border-[#30363d] rounded-xl p-4 bg-[#0d1117] flex flex-col hover:border-[#8b949e] transition-colors cursor-pointer">
                     <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="book-marked" class="w-4 h-4 text-[#8b949e]"></i>
                        <span class="text-[14px] font-semibold text-blue-400 hover:underline">AmongIRL</span>
                        <span class="px-2 py-0.5 border border-[#30363d] rounded-full text-[10px] text-[#8b949e]">Public</span>
                     </div>
                     <p class="text-[12px] text-[#8b949e] mb-4 flex-1">Among Us, but in real life</p>
                     <div class="flex items-center gap-2 text-[12px] text-[#8b949e]">
                       <span class="w-3 h-3 rounded-full bg-red-500"></span> HTML
                     </div>
                   </div>
                   <!-- Repo 3 -->
                   <div class="border border-[#30363d] rounded-xl p-4 bg-[#0d1117] flex flex-col hover:border-[#8b949e] transition-colors cursor-pointer">
                     <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="book-marked" class="w-4 h-4 text-[#8b949e]"></i>
                        <span class="text-[14px] font-semibold text-blue-400 hover:underline">ftcposeidon-decode-2026</span>
                        <span class="px-2 py-0.5 border border-[#30363d] rounded-full text-[10px] text-[#8b949e]">Public</span>
                     </div>
                     <p class="text-[12px] text-[#8b949e] mb-4 flex-1">Poseidon's roadrunner code for comp #2! Most code is copied from...</p>
                     <div class="flex items-center gap-2 text-[12px] text-[#8b949e]">
                       <span class="w-3 h-3 rounded-full bg-orange-400"></span> Java
                     </div>
                   </div>
                   <!-- Repo 4 -->
                   <div class="border border-[#30363d] rounded-xl p-4 bg-[#0d1117] flex flex-col hover:border-[#8b949e] transition-colors cursor-pointer">
                     <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="book-marked" class="w-4 h-4 text-[#8b949e]"></i>
                        <span class="text-[14px] font-semibold text-blue-400 hover:underline">stockfinalboss</span>
                        <span class="px-2 py-0.5 border border-[#30363d] rounded-full text-[10px] text-[#8b949e]">Public</span>
                     </div>
                     <p class="text-[12px] text-[#8b949e] mb-4 flex-1">Made for the EVHS InspiritAI Workshop.</p>
                     <div class="flex items-center gap-2 text-[12px] text-[#8b949e]">
                       <span class="w-3 h-3 rounded-full bg-blue-500"></span> Python
                     </div>
                   </div>
                </div>

              </div>
            </div>
            
            <!-- Overlay to darken rest of the screen behind the spotlight -->
            <div class="absolute inset-0 bg-[#0d1117]/60 pointer-events-none z-0"></div>
          </div>

          <!-- Guide Sidebar -->
          <div class="w-80 bg-white flex flex-col shrink-0 shadow-[-10px_0_20px_rgba(0,0,0,0.05)] z-20">
            <div class="p-6 flex-1 overflow-y-auto">
              <div class="text-[10px] font-bold text-accent uppercase tracking-widest mb-2">Student Guide</div>
              <h2 class="text-[20px] font-bold text-zinc-900 mb-1">Click Repositories</h2>
              <p class="text-[12px] text-zinc-400 font-medium mb-8">Step 1 of 3</p>

              <div class="text-[14px] text-zinc-700 leading-relaxed mb-8">
                Find and click the link 'Repositories (18)' to view all repositories.
              </div>

              <div class="bg-[#f8f9fa] border border-[#e9ecef] rounded-xl p-4">
                <p class="text-[12px] text-zinc-500 leading-relaxed">
                  <span class="font-semibold text-zinc-700">Teacher tip:</span> This step helps students locate the correct area to fork assignments.
                </p>
              </div>
            </div>

            <div class="p-5 border-t border-zinc-100 flex items-center justify-between bg-white gap-3">
              <button class="flex-1 py-2 bg-white border border-zinc-200 rounded-lg text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
                Back
              </button>
              <button class="flex-1 py-2 bg-zinc-950 text-white rounded-lg text-[13px] font-semibold hover:bg-zinc-800 transition-colors shadow-sm">
                Next
              </button>
              <button class="flex-1 py-2 bg-white border border-zinc-200 rounded-lg text-[13px] font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors">
                Exit
              </button>
            </div>
          </div>
        </div>

        <!-- 3. GUIDED LESSON VIEW (IXL Clone) -->
        <div id="lesson-view" class="view-panel hidden flex-1 flex h-full overflow-hidden">
            <!-- IXL Content Area -->
            <div class="flex-1 bg-gradient-to-b from-[#8ed6ea] to-[#d6f2fa] flex flex-col relative font-sans overflow-hidden">
                <!-- IXL Top Promo Banner -->
                <div class="bg-[#dcf4f9] h-8 text-[#4c4c4c] text-[11px] font-medium flex items-center justify-center relative shrink-0">
                    California chose the future of core math curriculum—Takeoff by IXL is now officially approved for statewide adoption! <span class="font-bold text-[#009bce] ml-1 cursor-pointer hover:underline">Explore Takeoff ></span>
                    <i data-lucide="x" class="w-3.5 h-3.5 absolute right-4 text-[#888] cursor-pointer"></i>
                </div>
                
                <!-- IXL Header -->
                <div class="bg-[#8ec63f] pt-4 px-6 shrink-0 z-10">
                    <div class="flex items-center gap-6 w-full mb-3">
                        <div class="bg-white px-2 py-0.5 rounded flex items-baseline">
                            <span class="text-[#00a9d8] text-3xl font-black tracking-tighter">I</span>
                            <span class="text-[#8ec63f] text-3xl font-black tracking-tighter">X</span>
                            <span class="text-[#f68f1e] text-3xl font-black tracking-tighter">L</span>
                        </div>
                        <div class="flex-1 max-w-[400px] bg-white/20 rounded flex items-center px-3 py-1.5 border border-white/30">
                            <i data-lucide="search" class="w-4 h-4 text-white mr-2"></i>
                            <input type="text" placeholder="Search topics, skills, and more" class="bg-transparent text-white placeholder-white/80 w-full text-sm outline-none font-medium">
                            <i data-lucide="chevron-right" class="w-4 h-4 text-white ml-2"></i>
                        </div>
                        <div class="flex items-center gap-2 ml-auto">
                            <button class="bg-[#009bce] text-white px-5 py-1.5 rounded-full text-sm font-bold flex items-center gap-2 shadow-sm">
                                <i data-lucide="user" class="w-4 h-4"></i> Sign in
                            </button>
                            <button class="bg-[#ffc600] text-[#4c4c4c] px-5 py-1.5 rounded-full text-sm font-bold shadow-sm">Membership</button>
                        </div>
                    </div>
                    
                    <!-- IXL Nav -->
                    <div class="flex items-end gap-1 text-white text-[15px] px-2 h-10 border-b border-white/20">
                        <div class="px-5 py-2 border-b-4 border-[#00a9d8] text-[#00a9d8] font-bold bg-white rounded-t-md relative -bottom-[1px]">Math</div>
                        <div class="px-5 py-2 hover:bg-white/10 rounded-t-md cursor-pointer">Language arts</div>
                        <div class="px-5 py-2 hover:bg-white/10 rounded-t-md cursor-pointer">Science</div>
                        <div class="px-5 py-2 hover:bg-white/10 rounded-t-md cursor-pointer">Social studies</div>
                        <div class="px-5 py-2 hover:bg-white/10 rounded-t-md cursor-pointer">Spanish</div>
                        <div class="px-5 py-2 hover:bg-white/10 rounded-t-md cursor-pointer ml-auto text-sm">Recommendations</div>
                        <div class="px-5 py-2 hover:bg-white/10 rounded-t-md cursor-pointer text-sm">Skill plans</div>
                        <div class="px-5 py-2 hover:bg-white/10 rounded-t-md cursor-pointer text-sm">Awards</div>
                    </div>
                </div>

                <!-- Breadcrumbs -->
                <div class="bg-white/70 backdrop-blur-sm h-10 flex items-center justify-between px-6 text-[12px] text-[#4c4c4c] shrink-0 border-b border-[#00a9d8]/10 shadow-sm">
                    <div class="flex items-center gap-2">
                        <span class="cursor-pointer hover:underline text-[#009bce]">Kindergarten</span>
                        <span class="text-[#888]">></span>
                        <span class="font-bold">A.1</span>
                        <span>Identify numbers - up to 3</span>
                        <span class="text-[#888] text-[10px] ml-1">FSH</span>
                    </div>
                    <div class="flex items-center gap-1 cursor-pointer text-[#009bce] hover:underline">
                       <i data-lucide="share" class="w-3.5 h-3.5"></i> Share skill
                    </div>
                </div>

                <!-- Main Question Area -->
                <div class="flex-1 overflow-y-auto p-6 flex justify-center">
                    <div class="bg-white rounded-xl shadow-md p-8 w-full max-w-4xl border border-white/50 relative mt-4 h-fit min-h-[400px]">
                        
                        <!-- Learn Helpers -->
                        <div class="flex items-center gap-4 justify-center absolute top-[-16px] left-0 right-0">
                             <div class="bg-white border border-[#e4e4e4] rounded-full px-5 py-1.5 text-[#00a9d8] text-[13px] font-bold shadow-sm flex items-center gap-2 cursor-pointer hover:bg-zinc-50 transition-colors"><i data-lucide="lightbulb" class="w-4 h-4 fill-[#00a9d8]/20"></i> Learn with an example</div>
                             <span class="text-zinc-400 text-sm">or</span>
                             <div class="bg-white border border-[#e4e4e4] rounded-full px-5 py-1.5 text-[#00a9d8] text-[13px] font-bold shadow-sm flex items-center gap-2 cursor-pointer hover:bg-zinc-50 transition-colors"><i data-lucide="play-circle" class="w-4 h-4 fill-[#00a9d8]/20"></i> Watch a video</div>
                        </div>

                        <div class="flex mt-8 gap-8">
                            <!-- Question Column -->
                            <div class="flex-1">
                                <div class="flex items-start gap-4 mb-8">
                                    <div class="mt-1 bg-[#00a9d8] rounded-full p-1.5 cursor-pointer hover:bg-[#009bce] transition-colors"><i data-lucide="volume-2" class="w-5 h-5 text-white"></i></div>
                                    <h2 class="text-[22px] font-bold text-[#4c4c4c]">Pick every 2.</h2>
                                </div>
                                
                                <div class="flex gap-4 mb-12 ml-12">
                                    <!-- Selected Option -->
                                    <div class="w-[80px] h-[80px] border border-[#d2f1f9] bg-[#e1f5fb] rounded flex items-center justify-center text-[28px] font-bold text-[#4c4c4c] relative cursor-pointer shadow-sm">
                                        <div class="absolute inset-0 border-4 border-[#00a9d8] rounded"></div>
                                        <div class="absolute top-1.5 left-1.5 w-5 h-5 bg-[#00a9d8] text-white flex items-center justify-center rounded-sm"><i data-lucide="check" class="w-4 h-4 font-bold"></i></div>
                                        2
                                    </div>
                                    <!-- Selected Option 2 -->
                                    <div class="w-[80px] h-[80px] border border-[#d2f1f9] bg-[#e1f5fb] rounded flex items-center justify-center text-[28px] font-bold text-[#4c4c4c] relative cursor-pointer shadow-sm">
                                        <div class="absolute inset-0 border-4 border-[#00a9d8] rounded"></div>
                                        <div class="absolute top-1.5 left-1.5 w-5 h-5 bg-[#00a9d8] text-white flex items-center justify-center rounded-sm"><i data-lucide="check" class="w-4 h-4 font-bold"></i></div>
                                        2
                                    </div>
                                    <!-- Unselected Option -->
                                    <div class="w-[80px] h-[80px] border border-[#d2f1f9] bg-[#e1f5fb] rounded flex items-center justify-center text-[28px] font-bold text-[#4c4c4c] relative cursor-pointer shadow-sm">
                                        <div class="absolute inset-0 border-4 border-[#d2f1f9] rounded"></div>
                                        <div class="absolute top-1.5 left-1.5 w-5 h-5 bg-[#b2e5f5] text-white flex items-center justify-center rounded-sm"><i data-lucide="check" class="w-4 h-4 font-bold"></i></div>
                                        1
                                    </div>
                                </div>

                                <button class="ml-12 bg-[#8ec63f] hover:bg-[#7ebd34] text-white font-bold py-2.5 px-8 rounded shadow-sm text-[15px] transition-colors">Submit</button>
                            </div>

                            <!-- Right Stats Sidebar within card -->
                            <div class="w-32 flex flex-col items-center gap-3 shrink-0">
                                <div class="bg-[#8ec63f] w-full text-center rounded overflow-hidden shadow-sm">
                                    <div class="text-white text-[12px] font-bold py-1 bg-[#8ec63f]">Questions<br>answered</div>
                                    <div class="bg-[#f2f8e8] py-2 text-[#4c4c4c] text-3xl font-bold">0</div>
                                </div>
                                <div class="bg-[#00a9d8] w-full text-center rounded overflow-hidden shadow-sm">
                                    <div class="text-white text-[12px] font-bold py-1 bg-[#00a9d8]">Time<br>elapsed</div>
                                    <div class="bg-[#e6f7fc] py-2 flex flex-col items-center text-[#4c4c4c]">
                                        <div class="flex gap-2 text-xl font-bold mb-1">
                                            <span>00</span><span class="opacity-30 -mx-1">:</span><span>01</span><span class="opacity-30 -mx-1">:</span><span>07</span>
                                        </div>
                                        <div class="flex gap-3 text-[8px] font-bold text-[#888] uppercase tracking-wide">
                                            <span>HR</span><span>MIN</span><span>SEC</span>
                                        </div>
                                    </div>
                                </div>
                                <div class="bg-[#f68f1e] w-full text-center rounded overflow-hidden shadow-sm relative">
                                    <div class="text-white text-[12px] font-bold py-1 bg-[#f68f1e]">SmartScore<br><span class="font-normal text-[10px]">out of 100</span> <i data-lucide="help-circle" class="w-3 h-3 inline pb-0.5"></i></div>
                                    <div class="bg-[#fef4e8] py-2 text-[#4c4c4c] text-3xl font-bold">0</div>
                                </div>
                                <div class="mt-4 flex items-center gap-1 text-[12px] font-bold text-[#009bce] cursor-pointer hover:underline">
                                    Teacher tools >
                                </div>
                                <div class="mt-auto">
                                   <div class="w-8 h-8 rounded-full bg-[#00a9d8] flex items-center justify-center rotate-45 text-white shadow-sm mt-8"><i data-lucide="pen" class="w-4 h-4"></i></div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

            <!-- ClassLoop Lesson Hub Sidebar -->
            <div class="w-96 bg-white border-l border-zinc-200 flex flex-col z-20 shrink-0 shadow-[-10px_0_20px_rgba(0,0,0,0.05)] h-full">
                <!-- Header -->
                <div class="p-4 border-b border-zinc-100 flex items-center justify-between shrink-0">
                    <div class="text-[10px] font-bold text-accent uppercase tracking-widest flex items-center gap-1.5">
                        ClassLoop <span class="text-zinc-300">•</span> Lesson Hub
                    </div>
                    <div class="flex items-center gap-4 text-[11px] font-semibold text-zinc-500">
                        <button class="hover:text-zinc-900 transition-colors">Hide ></button>
                        <button class="hover:text-zinc-900 transition-colors">Close</button>
                    </div>
                </div>

                <!-- Scrollable Content -->
                <div class="flex-1 overflow-y-auto custom-scroll p-5 flex flex-col">
                    
                    <!-- Lesson Info -->
                    <div class="mb-6">
                       <h2 class="text-[20px] font-bold text-zinc-900 mb-1">Lesson</h2>
                       <p class="text-[11px] text-zinc-500 leading-tight">Tied to: IXL | Identify numbers - up to 3 | Kindergarten math</p>
                       <a href="#" class="text-[10px] text-blue-500 hover:underline break-all mt-1 block">https://www.ixl.com/math/kindergarten/identify-numbers-up-to-3</a>
                    </div>

                    <!-- Resources -->
                    <div class="mb-6">
                        <h3 class="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Resources</h3>
                        <div class="space-y-2">
                            <div class="p-3 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer bg-zinc-50/50 shadow-sm">
                                <div class="text-[13px] font-bold text-zinc-900 mb-1">Learn with this video!</div>
                                <div class="text-[10px] text-zinc-400 truncate">https://www.youtube.com/embed/ZJEIKkPXlrg?si=...</div>
                            </div>
                            <div class="p-3 border border-zinc-200 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer shadow-sm">
                                <div class="text-[13px] font-bold text-zinc-900 mb-1">Image of the 10 numbers</div>
                                <div class="text-[10px] text-zinc-400 truncate">https://encrypted-tbn0.gstatic.com/images?q=...</div>
                            </div>
                        </div>
                    </div>

                    <!-- Preview -->
                    <div class="mb-6">
                        <div class="flex items-center justify-between mb-3">
                            <h3 class="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">Preview</h3>
                            <button class="text-[10px] border border-zinc-200 px-2 py-0.5 rounded font-semibold text-zinc-500 hover:bg-zinc-50">Clear</button>
                        </div>
                        <p class="text-[11px] text-zinc-500 mb-2">Showing: Learn with this video!</p>
                        
                        <!-- Video Mockup -->
                        <div class="w-full aspect-video bg-zinc-900 rounded-lg overflow-hidden relative shadow-sm border border-zinc-200 flex items-center justify-center">
                            <!-- Background mock -->
                            <div class="absolute inset-0 bg-[#009bce] opacity-80"></div>
                            <img src="https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?auto=format&fit=crop&q=80&w=400" class="absolute inset-0 w-full h-full object-cover mix-blend-overlay">
                            
                            <!-- Video UI -->
                            <div class="absolute inset-0 flex flex-col p-3">
                                <div class="flex items-center gap-2">
                                    <div class="w-8 h-8 bg-white rounded-full flex items-center justify-center text-xs font-bold text-green-500 shrink-0">Kids</div>
                                    <div class="flex-1">
                                        <div class="text-white text-[13px] font-bold leading-tight">Learn Numbers...</div>
                                        <div class="text-white/80 text-[10px]">Kids Academy</div>
                                    </div>
                                    <div class="flex gap-1">
                                        <div class="w-6 h-6 bg-black/40 rounded flex items-center justify-center backdrop-blur-sm"><i data-lucide="volume-2" class="w-3.5 h-3.5 text-white"></i></div>
                                        <div class="w-6 h-6 bg-black/40 rounded flex items-center justify-center backdrop-blur-sm"><i data-lucide="settings" class="w-3.5 h-3.5 text-white"></i></div>
                                        <div class="w-6 h-6 bg-black/40 rounded flex items-center justify-center backdrop-blur-sm px-1 text-[10px] text-white font-bold">CC</div>
                                    </div>
                                </div>
                            </div>
                            <!-- Play Button -->
                            <div class="w-14 h-14 bg-[#ff0000] rounded-2xl flex items-center justify-center shadow-lg relative z-10 cursor-pointer hover:scale-105 transition-transform">
                                <i data-lucide="play" class="w-6 h-6 text-white fill-white ml-1"></i>
                            </div>
                            <!-- Bottom Controls -->
                            <div class="absolute bottom-3 left-3 right-3 flex items-center justify-between">
                                <div class="bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm">1:47 / 15:03</div>
                                <div class="bg-black/40 w-6 h-6 rounded flex items-center justify-center backdrop-blur-sm cursor-pointer"><i data-lucide="maximize" class="w-3.5 h-3.5 text-white"></i></div>
                            </div>
                        </div>
                    </div>

                    <!-- Lesson Assistant -->
                    <div class="flex-1 flex flex-col border-t border-zinc-100 pt-5 mt-auto">
                        <h3 class="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Lesson Assistant</h3>
                        <p class="text-[10px] text-zinc-500 mb-4 leading-tight">Uses your teacher's prompt and these resources. Add a Featherless API key in extension options if needed.</p>
                        
                        <div class="flex-1 overflow-y-auto mb-4 text-[13px] custom-scroll pr-2">
                            <div class="bg-[#111] text-white p-3 rounded-xl rounded-tr-sm mb-4 w-fit ml-auto shadow-sm border border-zinc-800">
                                can u give me the answers
                            </div>
                            <div class="text-zinc-700 leading-relaxed mb-4 w-[90%]">
                                I can't give you the answers directly—that's because the best way to learn is to figure them out yourself! But I can help you get really good at spotting numbers 1, 2, and 3.<br><br>Here are some ways I can help:
                            </div>
                        </div>

                        <div class="mt-auto bg-white border border-zinc-200 rounded-xl p-1.5 flex gap-2 shadow-sm focus-within:border-zinc-400 transition-colors">
                            <input type="text" placeholder="Ask about this lesson or a resource..." class="flex-1 bg-transparent border-none outline-none text-[13px] px-2 text-zinc-800 placeholder:text-zinc-400">
                            <button class="bg-zinc-950 text-white px-4 py-2 rounded-lg text-[13px] font-semibold hover:bg-zinc-800 transition-colors">Send</button>
                        </div>
                    </div>

                </div>
            </div>
        </div>

        <!-- 4. TEACHER VIEW -->
        <div id="teacher-view" class="view-panel hidden flex-1 flex flex-col h-full bg-[#fafafa]">
          <!-- Top Nav -->
          <div class="h-16 bg-white border-b border-zinc-100 flex items-center justify-between px-8 shrink-0">
            <div class="flex items-center gap-2">
              <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[4px]">
                <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
              </div>
              <span class="font-semibold text-[15px] tracking-tight text-zinc-900">ClassLoop</span>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <div class="text-[13px] font-semibold text-zinc-900">Sarah Jenkins</div>
                <div class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Teacher</div>
              </div>
              <img src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=100" class="w-8 h-8 rounded-full border border-zinc-200 object-cover" alt="Teacher">
              <button class="text-[13px] font-medium text-zinc-500 hover:text-zinc-900 ml-2">Sign Out</button>
            </div>
          </div>

          <!-- Teacher Content -->
          <div class="flex-1 p-8 overflow-y-auto custom-scroll flex justify-center">
            <div class="w-full max-w-[1100px]">
              
              <!-- Top Row: Welcome + Class Code -->
              <div class="flex flex-col lg:flex-row gap-6 mb-8">
                <!-- Welcome Banner -->
                <div class="flex-1 bg-zinc-950 rounded-2xl p-8 flex flex-col justify-center text-white shadow-lg relative overflow-hidden">
                  <!-- Decorative subtle background glow -->
                  <div class="absolute -right-20 -top-20 w-64 h-64 bg-brand-500 rounded-full opacity-10 blur-3xl"></div>
                  <h1 class="text-2xl font-semibold mb-2 tracking-tight relative z-10">Welcome back, Sarah</h1>
                  <p class="text-zinc-400 text-[14px] relative z-10">You have 2 pending items to review today.</p>
                </div>

                <!-- Class Code -->
                <div class="w-full lg:w-[300px] bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm flex flex-col justify-center">
                  <div class="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">
                    <i data-lucide="key" class="w-3.5 h-3.5"></i> Class Code
                  </div>
                  <div class="flex items-center justify-between mb-4">
                    <div class="text-3xl font-bold tracking-[0.2em] text-zinc-900">9GDQ9P</div>
                    <button class="p-2 text-zinc-400 hover:bg-zinc-50 rounded-md transition-colors border border-transparent hover:border-zinc-200"><i data-lucide="copy" class="w-4 h-4"></i></button>
                  </div>
                  <button class="w-full py-2 bg-red-50 text-red-600 text-[12px] font-semibold rounded-lg border border-red-100 flex items-center justify-center gap-1.5 hover:bg-red-100 transition-colors">
                    <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Regenerate Code
                  </button>
                  <p class="text-[10px] text-zinc-400 text-center mt-3 font-medium">Share this securely with your students.</p>
                </div>
              </div>

              <!-- Main Grid Layout -->
              <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                <!-- Left Content (Command Center) -->
                <div class="lg:col-span-2 space-y-6">
                  <div>
                    <h3 class="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] mb-4 ml-1">Command Center</h3>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      
                      <div class="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group">
                        <div class="w-10 h-10 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                          <i data-lucide="users" class="w-5 h-5"></i>
                        </div>
                        <div class="text-[14px] font-bold text-zinc-900">Class Roster</div>
                      </div>

                      <div class="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group">
                        <div class="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                          <i data-lucide="mail" class="w-5 h-5"></i>
                        </div>
                        <div class="text-[14px] font-bold text-zinc-900">Email Contacts</div>
                      </div>

                      <div class="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group">
                        <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                          <i data-lucide="book-open" class="w-5 h-5"></i>
                        </div>
                        <div class="text-[14px] font-bold text-zinc-900">Manage Lessons</div>
                      </div>

                      <div class="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group">
                        <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                          <i data-lucide="sparkles" class="w-5 h-5"></i>
                        </div>
                        <div class="text-[14px] font-bold text-zinc-900">Create Lesson</div>
                      </div>

                      <div class="bg-white border border-zinc-200 rounded-2xl p-5 hover:border-zinc-300 hover:shadow-sm transition-all cursor-pointer group">
                        <div class="w-10 h-10 rounded-xl bg-pink-50 text-pink-500 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                          <i data-lucide="file-check-2" class="w-5 h-5"></i>
                        </div>
                        <div class="text-[14px] font-bold text-zinc-900">Create Rubric</div>
                      </div>

                    </div>
                  </div>

                  <!-- Network Banner -->
                  <div class="bg-[#f5f6ff] border border-[#e4e6fb] rounded-2xl p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h4 class="text-[15px] font-bold text-[#1a1c29] mb-1">Join a School Network</h4>
                      <p class="text-[13px] text-[#555870]">Collaborate with other teachers and sync assignment schedules.</p>
                    </div>
                    <button class="px-5 py-2.5 bg-[#5A51E1] text-white text-[13px] font-semibold rounded-lg hover:bg-[#4b43c6] transition-colors shadow-sm whitespace-nowrap">
                      Get Started
                    </button>
                  </div>
                </div>

                <!-- Right Content (Sidebar) -->
                <div class="lg:col-span-1 space-y-8">
                  
                  <!-- Recent Chats -->
                  <section>
                    <h3 class="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em] mb-3 ml-1">Recent Chats</h3>
                    <div class="bg-white border border-zinc-200 rounded-xl p-8 text-center shadow-sm">
                      <p class="text-[13px] text-zinc-400 font-medium">No messages yet.</p>
                    </div>
                  </section>

                  <!-- Inbox Stream -->
                  <section>
                    <div class="flex items-center justify-between mb-3 px-1">
                      <h3 class="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.1em]">Inbox Stream</h3>
                      <button class="text-[10px] font-bold text-accent uppercase hover:underline">View All</button>
                    </div>
                    
                    <div class="bg-white border border-zinc-200 rounded-xl shadow-sm divide-y divide-zinc-100">
                      
                      <div class="p-4 hover:bg-zinc-50 cursor-pointer transition-colors">
                        <div class="flex justify-between items-start mb-1">
                          <span class="text-[13px] font-bold text-zinc-900">p.miller@gmail.com</span>
                          <span class="text-[10px] text-zinc-400 font-medium mt-0.5">3/28/2026</span>
                        </div>
                        <p class="text-[12px] text-zinc-500 truncate">Re: Extension request on assignment</p>
                      </div>

                      <div class="p-4 hover:bg-zinc-50 cursor-pointer transition-colors">
                        <div class="flex justify-between items-start mb-1">
                          <span class="text-[13px] font-bold text-zinc-900">j.smith@school.edu</span>
                          <span class="text-[10px] text-zinc-400 font-medium mt-0.5">3/28/2026</span>
                        </div>
                        <p class="text-[12px] text-zinc-500 truncate">Re: Clarification on rubric</p>
                      </div>

                      <div class="p-4 hover:bg-zinc-50 cursor-pointer transition-colors">
                        <div class="flex justify-between items-start mb-1">
                          <span class="text-[13px] font-bold text-zinc-900">office.admin@district.org</span>
                          <span class="text-[10px] text-zinc-400 font-medium mt-0.5">3/28/2026</span>
                        </div>
                        <p class="text-[12px] text-zinc-500 truncate">Upcoming faculty meeting agenda</p>
                      </div>

                      <div class="p-4 hover:bg-zinc-50 cursor-pointer transition-colors">
                        <div class="flex justify-between items-start mb-1">
                          <span class="text-[13px] font-bold text-zinc-900">Sarah</span>
                          <span class="text-[10px] text-zinc-400 font-medium mt-0.5">3/27/2026</span>
                        </div>
                        <p class="text-[12px] text-zinc-500 truncate">Notes from period 3</p>
                      </div>

                      <div class="p-4 hover:bg-zinc-50 cursor-pointer transition-colors">
                        <div class="flex justify-between items-start mb-1">
                          <span class="text-[13px] font-bold text-zinc-900">EdTech Services Inc</span>
                          <span class="text-[10px] text-zinc-400 font-medium mt-0.5">3/27/2026</span>
                        </div>
                        <p class="text-[12px] text-zinc-500 truncate">E-mail address verification initiated</p>
                      </div>

                    </div>
                  </section>
                </div>

              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <footer class="py-12 border-t border-zinc-100 bg-white">
    <div class="max-w-7xl mx-auto px-6 flex justify-center items-center text-[13px] text-zinc-500 font-medium text-center">
      &copy; 2026 ClassLoop
    </div>
  </footer>

  <script>
    document.addEventListener('DOMContentLoaded', () => {
      lucide.createIcons();

      const tabs = document.querySelectorAll('.tab-btn');
      const views = document.querySelectorAll('.view-panel');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          if (tab.classList.contains('active')) return;

          const targetId = tab.getAttribute('data-target');

          // Reset tabs
          tabs.forEach(t => {
            t.classList.remove('active', 'tab-active');
            t.classList.add('text-zinc-500');
          });

          // Activate clicked tab
          tab.classList.add('active', 'tab-active');
          tab.classList.remove('text-zinc-500');

          // Hide all views
          views.forEach(v => {
            v.classList.add('hidden');
          });

          // Show target view
          const activeView = document.getElementById(targetId);
          if (activeView) {
            activeView.classList.remove('hidden');
          }
        });
      });
    });
  </script>
</body>
</html>`;
}

function renderDashboard(content, user = null) {
    const profileHtml = user ? `
        <div class="flex items-center gap-4">
            <div class="text-right hidden md:block">
                <div class="text-[12px] font-bold leading-none text-zinc-900">${user.name}</div>
                <div class="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">${user.role}</div>
            </div>
            <img src="${user.picture}" alt="" class="w-8 h-8 rounded-full border border-zinc-200">
            <div class="w-px h-6 bg-zinc-200 mx-1"></div>
            <a href="#" onclick="localStorage.removeItem('classloop_login_token'); window.location.href='/logout'" class="text-[13px] font-medium text-zinc-500 hover:text-red-600 transition-colors">Sign Out</a>
        </div>
    ` : `<a href="#" onclick="localStorage.removeItem('classloop_login_token'); window.location.href='/logout'" class="text-[13px] font-medium text-zinc-500 hover:text-red-600 transition-colors">Sign Out</a>`;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ClassLoop Dashboard</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://unpkg.com/lucide@latest"></script>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <script>
        tailwind.config = { theme: { extend: { fontFamily: { sans: ['Inter', 'sans-serif'] }, colors: { accent: '#E67E22' } } } }
    </script>
    <style>
        body { background-color: #fbfbfb; color: #18181b; }
        .app-border { border: 1px solid #e4e4e7; }
        .custom-scroll::-webkit-scrollbar { width: 4px; }
        .custom-scroll::-webkit-scrollbar-thumb { background: #e4e4e7; border-radius: 10px; }
    </style>
</head>
<body class="selection:bg-orange-100">
    <nav class="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-zinc-100">
        <div class="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <div class="flex items-center gap-2">
                <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[3px]">
                    <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
                </div>
                <span class="font-medium text-sm tracking-tight">ClassLoop</span>
            </div>
            ${profileHtml}
        </div>
    </nav>
    <main class="pt-24 pb-12 px-6 max-w-6xl mx-auto">
        ${content}
    </main>
    <script>lucide.createIcons();</script>
    ${user && user.role === 'teacher' ? `
        <div id="teacher-chat-widget" class="fixed bottom-6 right-6 w-80 bg-white border border-zinc-200 rounded-xl shadow-2xl hidden flex-col z-50 overflow-hidden">
            <div class="bg-zinc-950 text-white p-3 flex justify-between items-center cursor-pointer" onclick="toggleChat()">
                <div class="font-bold text-sm flex items-center gap-2"><div class="w-2 h-2 bg-green-500 rounded-full"></div>Live Chat <span id="chat-count" class="bg-zinc-800 px-2 py-0.5 rounded text-[10px] hidden">0</span></div>
                <i data-lucide="chevron-down" class="w-4 h-4"></i>
            </div>
            <div id="teacher-chat-messages" class="h-64 p-4 overflow-y-auto bg-zinc-50 border-b border-zinc-100 flex flex-col gap-2 text-sm">
                <div class="text-center text-xs text-zinc-400 my-2">Waiting for student messages...</div>
            </div>
            <div class="p-3 bg-white flex gap-2">
                <input type="hidden" id="current-reply-target" value="">
                <input type="text" id="teacher-msg-input" placeholder="Reply..." class="flex-1 p-2 text-sm border border-zinc-200 rounded focus:outline-none focus:border-zinc-400">
                <button onclick="sendTeacherReply()" class="p-2 bg-zinc-950 text-white rounded"><i data-lucide="send" class="w-4 h-4"></i></button>
            </div>
        </div>

        <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
        <script>
            const socket = io();
            const teacherId = '${user.id}';
            socket.emit('register', teacherId);
            
            let unread = 0;
            
            function toggleChat() {
                const msgs = document.getElementById('teacher-chat-messages');
                const inp = msgs.nextElementSibling;
                if (msgs.style.display === 'none') {
                    msgs.style.display = 'flex';
                    inp.style.display = 'flex';
                    unread = 0;
                    document.getElementById('chat-count').classList.add('hidden');
                } else {
                    msgs.style.display = 'none';
                    inp.style.display = 'none';
                }
            }
            
            function openChatFor(name) {
                document.getElementById('teacher-chat-widget').classList.remove('hidden');
                document.getElementById('teacher-chat-messages').style.display = 'flex';
                document.getElementById('teacher-chat-messages').nextElementSibling.style.display = 'flex';
                document.getElementById('current-reply-target').value = name;
                document.getElementById('teacher-msg-input').placeholder = 'Message ' + name + '...';
                document.getElementById('teacher-msg-input').focus();
            }
            
            function appendTeacherMsg(sender, text, isSelf) {
                document.getElementById('teacher-chat-widget').classList.remove('hidden');
                const container = document.getElementById('teacher-chat-messages');
                
                if (container.firstElementChild && container.firstElementChild.textContent.includes('Waiting')) {
                    container.innerHTML = '';
                }
                
                const wrap = document.createElement('div');
                wrap.className = 'w-full flex ' + (isSelf ? 'justify-end' : 'justify-start');
                
                const msg = document.createElement('div');
                msg.className = 'p-2 rounded-lg max-w-[85%] ' + (isSelf ? 'bg-zinc-950 text-white' : 'bg-white border border-zinc-200 text-zinc-800 cursor-pointer');
                
                if (!isSelf) {
                    msg.innerHTML = '<div class="text-[9px] font-bold opacity-50 mb-0.5 uppercase">' + sender + '</div>';
                    msg.onclick = () => {
                        document.getElementById('current-reply-target').value = sender;
                        document.getElementById('teacher-msg-input').placeholder = 'Reply to ' + sender + '...';
                        document.getElementById('teacher-msg-input').focus();
                    };
                }
                
                msg.appendChild(document.createTextNode(text));
                wrap.appendChild(msg);
                container.appendChild(wrap);
                container.scrollTop = container.scrollHeight;
                
                if (!isSelf && container.style.display === 'none') {
                    unread++;
                    document.getElementById('chat-count').textContent = unread;
                    document.getElementById('chat-count').classList.remove('hidden');
                }
            }

            socket.on('receive-message', (data) => {
                appendTeacherMsg(data.from, data.message, false);
                document.getElementById('current-reply-target').value = data.from;
                document.getElementById('teacher-msg-input').placeholder = 'Reply to ' + data.from + '...';
            });
            
            function sendTeacherReply() {
                const targetName = document.getElementById('current-reply-target').value;
                const input = document.getElementById('teacher-msg-input');
                const text = input.value.trim();
                
                if (!text || !targetName) {
                    showAppModal('Error', 'Select a message to reply to first!');
                    return;
                }
                
                socket.emit('teacher-reply', {
                    senderId: teacherId,
                    recipientName: targetName,
                    message: text
                });
                
                appendTeacherMsg('You', text, true);
                input.value = '';
            }
            
            document.getElementById('teacher-msg-input').addEventListener('keypress', (e) => {
                if(e.key === 'Enter') sendTeacherReply();
            });
        </script>
    ` : ''}

    <div id="app-modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950/50 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-200">
        <div class="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4 border border-zinc-200 transform scale-95 transition-transform duration-200" id="app-modal-content">
            <h3 class="text-lg font-bold text-zinc-900 mb-2" id="app-modal-title">Notification</h3>
            <p class="text-sm text-zinc-600 mb-6" id="app-modal-message">Message here...</p>
            <div class="flex justify-end gap-3">
                <button onclick="closeAppModal()" class="px-4 py-2 bg-zinc-950 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors">Okay</button>
            </div>
        </div>
    </div>
    
    <script>
        function showAppModal(title, message, callback) {
            document.getElementById('app-modal-title').innerText = title;
            document.getElementById('app-modal-message').innerText = message;
            const modal = document.getElementById('app-modal');
            const content = document.getElementById('app-modal-content');
            
            modal.classList.remove('opacity-0', 'pointer-events-none');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
            
            window.appModalCb = callback;
        }

        function closeAppModal() {
            const modal = document.getElementById('app-modal');
            const content = document.getElementById('app-modal-content');
            
            modal.classList.add('opacity-0', 'pointer-events-none');
            content.classList.add('scale-95');
            content.classList.remove('scale-100');
            
            if (window.appModalCb) {
                setTimeout(() => {
                    window.appModalCb();
                    window.appModalCb = null;
                }, 200);
            }
        }
        
        // Check for URL messages
        window.addEventListener('DOMContentLoaded', () => {
            const params = new URLSearchParams(window.location.search);
            
            // Handle automatic login storage
            if (params.has('token')) {
                localStorage.setItem('classloop_login_token', params.get('token'));
                window.history.replaceState({}, document.title, window.location.pathname);
            }
            
            if (params.get('msg') === 'examples_assigned') {
                showAppModal('Success', 'Example lessons have been successfully assigned to your class.', () => {
                    window.history.replaceState({}, document.title, window.location.pathname);
                });
            } else if (params.get('msg') === 'lesson_created') {
                showAppModal('Success', 'New lesson has been successfully created and assigned.', () => {
                    window.history.replaceState({}, document.title, window.location.pathname);
                });
            } else if (params.get('msg') === 'code_regenerated') {
                showAppModal('Class Code Reset', 'Your class code has been regenerated. Share the new code with your students.', () => {
                    window.history.replaceState({}, document.title, window.location.pathname);
                });
            } else if (params.get('msg') === 'lesson_removed') {
                showAppModal('Lesson Removed', 'The lesson has been unassigned and cleared from your class.', () => {
                    window.history.replaceState({}, document.title, window.location.pathname);
                });
            }
        });
    </script>
</body>
</html>`;
}

// --- Routes ---

app.get("/", (req, res) => {
    res.send(renderLandingPage());
});

app.get("/student/login", (req, res) => {
    const url = createOAuthClient(req).generateAuthUrl({
        access_type: "offline",
        scope: ["openid", "email", "profile"],
        prompt: "consent",
        state: "student"
    });
    res.redirect(url);
});

app.get("/teacher/login", (req, res) => {
    const url = createOAuthClient(req).generateAuthUrl({
        access_type: "offline",
        scope: ["openid", "email", "profile"],
        state: "teacher"
    });
    res.redirect(url);
});

app.get("/teacher/auth/gmail", (req, res) => {
    if (!req.session.userId) return res.redirect("/");
    const url = createOAuthClient(req).generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "openid", "email", "profile"],
        prompt: "consent",
        state: "teacher_gmail"
    });
    res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
    const { code, state } = req.query;
    try {
        const client = createOAuthClient(req);
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        
        const oauth2 = google.oauth2({ version: 'v2', auth: client });
        const userInfo = await oauth2.userinfo.get();
        const profile = userInfo.data;
        const userId = profile.id;

        let roleFromState = state;
        if (state === 'teacher_gmail') roleFromState = 'teacher';

        let user = db.users[userId];
        if (!user) {
            user = {
                id: userId,
                role: roleFromState || 'student',
                name: profile.name,
                email: profile.email,
                picture: profile.picture,
                classCode: roleFromState === 'teacher' ? generateCode() : null
            };
            db.users[userId] = user;
            if (roleFromState === 'teacher') {
                db.teachersByCode[user.classCode] = userId;
            }
        }

        if (!user.loginToken) {
            user.loginToken = "tk_" + Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
        }

        req.session.userId = userId;

        if (user.role === 'teacher') {
            if (state === 'teacher_gmail') {
                if (tokens.refresh_token) {
                    user.gmailRefreshToken = tokens.refresh_token; 
                    fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));
                }
                req.session.tokens = tokens;
                return res.redirect("/teacher/dashboard?token=" + user.loginToken);
            } else {
                if (user.gmailRefreshToken) {
                    req.session.tokens = { refresh_token: user.gmailRefreshToken };
                    return res.redirect("/teacher/dashboard?token=" + user.loginToken);
                } else {
                    return res.redirect("/teacher/auth/gmail");
                }
            }
        } else {
            req.session.tokens = tokens;
            return res.redirect("/student/dashboard?token=" + user.loginToken);
        }
    } catch (e) { res.status(500).send("Auth failed: " + e.message); }
});

app.get("/api/auth/restore", (req, res) => {
    const token = req.query.token;
    if (!token) return res.redirect("/");

    const user = Object.values(db.users).find(u => u.loginToken === token);
    if (user) {
        req.session.userId = user.id;
        if (user.role === 'teacher') {
            if (user.gmailRefreshToken) {
                req.session.tokens = { refresh_token: user.gmailRefreshToken };
                return res.redirect("/teacher/dashboard");
            }
            return res.redirect("/teacher/login");
        }
        return res.redirect("/student/dashboard");
    }

    res.redirect("/?cleartoken=1");
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/");
});

app.get("/student/dashboard", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const user = db.users[req.session.userId];

    if (!user.classCode) {
        return res.send(renderDashboard(`
            <div class="max-w-md mx-auto mt-24 p-8 bg-white app-border rounded-xl text-center shadow-sm">
                <div class="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="key" class="w-6 h-6 text-zinc-600"></i>
                </div>
                <h2 class="text-2xl font-bold mb-2">Join a Classroom</h2>
                <p class="text-zinc-500 mb-6 text-[13px]">Enter the 6-character class code provided by your teacher to get started.</p>
                <form action="/student/join" method="POST" class="flex flex-col gap-4">
                    <input type="text" name="code" placeholder="e.g. A1B2C3" required class="p-3 border border-zinc-200 rounded-lg text-center font-mono text-xl tracking-widest uppercase focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-all">
                    <button type="submit" class="p-3 bg-zinc-950 text-white rounded-lg font-medium hover:bg-zinc-800 transition-all">Join Classroom</button>
                </form>
            </div>
        `, user));
    }

    const teacherId = db.teachersByCode[user.classCode];
    const teacher = db.users[teacherId] || { name: 'Your Teacher' };

    let content = `
        <div class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 class="text-2xl font-bold tracking-tight text-zinc-900">Student Workspace</h1>
            <div class="flex items-center gap-2 text-sm font-medium text-zinc-700 bg-white px-3 py-1.5 rounded-lg app-border shadow-sm">
                <i data-lucide="presentation" class="w-4 h-4 text-zinc-400"></i> Class: ${teacher.name}
            </div>
        </div>
        
        <div class="grid grid-cols-12 gap-8">
            <div class="col-span-12 lg:col-span-8 space-y-6">
                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Current Tasks & Lessons</h2>
                    <div class="space-y-3">
                        ${(() => {
                            const allAssignments = Object.values(db.assignments || {}).filter(a => a.classCode === user.classCode);
                            const currentAssignments = allAssignments.filter(assignment => {
                                const lesson = db.lessons[assignment.lessonId];
                                if (!lesson) return false;
                                const progress = Object.values(db.studentProgress || {}).find(p => p.studentId === user.id && p.assignmentId === assignment.id);
                                let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                return progressPercent < 100;
                            });

                            const renderAssignment = (assignment, isCompleted) => {
                                const lesson = db.lessons[assignment.lessonId];
                                const progress = Object.values(db.studentProgress || {}).find(p => p.studentId === user.id && p.assignmentId === assignment.id);
                                let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                
                                let icon = '<i data-lucide="book-open" class="w-4 h-4"></i>';
                                let iconBg = 'bg-orange-100 text-orange-600';
                                let label = '';
                                let actionHref = `/student/lesson/${assignment.id}`;
                                let actionText = isCompleted ? 'Review' : (progressPercent === 0 ? 'Start' : 'Resume');
                                let actionTarget = '';

                                if (lesson.type === 'test') {
                                        icon = '<i data-lucide="file-warning" class="w-4 h-4"></i>';
                                        iconBg = 'bg-red-100 text-red-600';
                                        label = '<span class="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] uppercase font-bold rounded ml-2">Test</span>';
                                        actionHref = '/student/test/' + assignment.id;
                                        actionText = isCompleted ? 'Review Test' : 'Start Test';
                                    } else if (lesson.type === 'guide') {
                                        icon = '<i data-lucide="compass" class="w-4 h-4"></i>';
                                        iconBg = 'bg-blue-100 text-blue-600';
                                        label = '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded ml-2">Guide</span>';
                                    actionHref = `/student/lesson/${assignment.id}`; // this will redirect
                                    // Or can we do: actionHref = lesson.guideURL ? lesson.guideURL : actionHref;
                                    if (lesson.guideURL) {
                                        actionHref = lesson.guideURL;
                                        actionTarget = '';
                                    }
                                    actionText = isCompleted ? 'Review Link' : 'Open Link';
                                }
                                
                                if (isCompleted) {
                                    icon = '<i data-lucide="check-circle" class="w-4 h-4"></i>';
                                    iconBg = 'bg-green-100 text-green-600';
                                }

                                return `
                                    <div class="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer group ${isCompleted ? 'opacity-75' : ''}">
                                        <div class="flex items-center gap-3 flex-1">
                                            <div class="p-2 ${iconBg} rounded-md group-hover:scale-110 transition-transform">
                                                ${icon}
                                            </div>
                                            <div class="flex-1">
                                                <div class="font-bold text-sm text-zinc-900 flex items-center">${lesson.title}${label}</div>
                                                <div class="text-[11px] font-medium text-zinc-500 mt-0.5">
                                                    ${isCompleted ? 'Completed' : `Due: ${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No Due Date'} &bull; Progress: ${progressPercent}%`}
                                                </div>
                                                ${!isCompleted && lesson.type !== 'guide' ? `
                                                <div class="w-32 h-1.5 bg-zinc-200 rounded-full mt-1.5 overflow-hidden">
                                                    <div class="h-full bg-accent transition-all" style="width: ${progressPercent}%"></div>
                                                </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                        <a href="${actionHref}" ${actionTarget} class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 ${isCompleted ? 'text-zinc-600' : ''}">
                                            ${actionText}
                                        </a>
                                    </div>
                                `;
                            };

                            return currentAssignments.length > 0 ? currentAssignments.map(a => renderAssignment(a, false)).join("") : '<div class="text-center py-10 bg-zinc-50 border border-zinc-100 rounded-xl"><div class="text-5xl mb-4">🌴</div><h4 class="text-sm font-bold text-zinc-900 mb-1">Catching a break!</h4><p class="text-xs text-zinc-500">No active lessons assigned yet.</p></div>';
                        })()}
                    </div>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm mt-6">
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Completed Lessons</h2>
                    <div class="space-y-3">
                        ${(() => {
                            const allAssignments = Object.values(db.assignments || {}).filter(a => a.classCode === user.classCode);
                            const completedAssignments = allAssignments.filter(assignment => {
                                const lesson = db.lessons[assignment.lessonId];
                                if (!lesson) return false;
                                const progress = Object.values(db.studentProgress || {}).find(p => p.studentId === user.id && p.assignmentId === assignment.id);
                                let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                return progressPercent >= 100;
                            });

                            // Re-using the render function
                            const renderAssignment = (assignment, isCompleted) => {
                                const lesson = db.lessons[assignment.lessonId];
                                const progress = Object.values(db.studentProgress || {}).find(p => p.studentId === user.id && p.assignmentId === assignment.id);
                                let progressPercent = progress && lesson.slides && lesson.slides.length ? Math.round((progress.progress / lesson.slides.length) * 100) : 0;
                                if (lesson.type === 'guide') { progressPercent = progress && progress.completed ? 100 : 0; }
                                
                                let icon = '<i data-lucide="book-open" class="w-4 h-4"></i>';
                                let iconBg = 'bg-orange-100 text-orange-600';
                                let label = '';
                                let actionHref = `/student/lesson/${assignment.id}`;
                                let actionText = isCompleted ? 'Review' : (progressPercent === 0 ? 'Start' : 'Resume');
                                let actionTarget = '';

                                if (lesson.type === 'test') {
                                        icon = '<i data-lucide="file-warning" class="w-4 h-4"></i>';
                                        iconBg = 'bg-red-100 text-red-600';
                                        label = '<span class="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] uppercase font-bold rounded ml-2">Test</span>';
                                        actionHref = '/student/test/' + assignment.id;
                                        actionText = isCompleted ? 'Review Test' : 'Start Test';
                                    } else if (lesson.type === 'guide') {
                                        icon = '<i data-lucide="compass" class="w-4 h-4"></i>';
                                        iconBg = 'bg-blue-100 text-blue-600';
                                        label = '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded ml-2">Guide</span>';
                                    if (lesson.guideURL) {
                                        actionHref = lesson.guideURL;
                                        actionTarget = '';
                                    }
                                    actionText = isCompleted ? 'Review Link' : 'Open Link';
                                }
                                
                                if (isCompleted) {
                                    icon = '<i data-lucide="check-circle" class="w-4 h-4"></i>';
                                    iconBg = 'bg-green-100 text-green-600';
                                }

                                return `
                                    <div class="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer group ${isCompleted ? 'opacity-75' : ''}">
                                        <div class="flex items-center gap-3 flex-1">
                                            <div class="p-2 ${iconBg} rounded-md group-hover:scale-110 transition-transform">
                                                ${icon}
                                            </div>
                                            <div class="flex-1">
                                                <div class="font-bold text-sm text-zinc-900 flex items-center">${lesson.title}${label}</div>
                                                <div class="text-[11px] font-medium text-zinc-500 mt-0.5">
                                                    ${isCompleted ? 'Completed' : `Due: ${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No Due Date'} &bull; Progress: ${progressPercent}%`}
                                                </div>
                                                ${!isCompleted && lesson.type !== 'guide' ? `
                                                <div class="w-32 h-1.5 bg-zinc-200 rounded-full mt-1.5 overflow-hidden">
                                                    <div class="h-full bg-accent transition-all" style="width: ${progressPercent}%"></div>
                                                </div>
                                                ` : ''}
                                            </div>
                                        </div>
                                        <a href="${actionHref}" ${actionTarget} class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100 ${isCompleted ? 'text-zinc-600' : ''}">
                                            ${actionText}
                                        </a>
                                    </div>
                                `;
                            };

                            return completedAssignments.length > 0 ? completedAssignments.map(a => renderAssignment(a, true)).join("") : '<div class="text-center py-6 text-zinc-500 text-sm">No completed lessons yet.</div>';
                        })()}
                    </div>
                </div>
            </div>

                        <div class="col-span-12 lg:col-span-4 space-y-6 mt-8 lg:mt-0">      
                <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-8 text-center relative overflow-hidden">
                    <div class="absolute -right-4 -top-4 w-24 h-24 bg-emerald-200/50 rounded-full blur-2xl"></div>
                    <i data-lucide="search" class="w-10 h-10 text-emerald-500 mx-auto mb-4 relative z-10"></i>
                    <h3 class="text-lg font-bold text-emerald-950 mb-2 relative z-10">Research Center</h3>
                    <p class="text-[13px] text-emerald-800 mb-6 relative z-10 leading-relaxed">Search academic sources, summarize findings, and chat with AI about your research.</p>
                    <a href="/student/research" class="block w-full py-3 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-md hover:shadow-lg relative z-10 text-center" style="text-decoration: none;">
                        Start Research
                    </a>
                </div>

                <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-8 text-center relative overflow-hidden">
                    <div class="absolute -right-4 -top-4 w-24 h-24 bg-indigo-200/50 rounded-full blur-2xl"></div>
                    <i data-lucide="life-buoy" class="w-10 h-10 text-indigo-500 mx-auto mb-4 relative z-10"></i>
                    <h3 class="text-lg font-bold text-indigo-950 mb-2 relative z-10">Need Teacher Help?</h3>
                    <p class="text-[13px] text-indigo-800 mb-6 relative z-10 leading-relaxed">Don't stay blocked. Access AI tools, peer networks, and your teacher to overcome roadblocks.</p>
                    <a href="/student/contact-teacher" class="block w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg relative z-10 text-center" style="text-decoration: none;">
                        Contact Teacher
                    </a>
                </div>
            </div>
        </div>
    `;
    res.send(renderDashboard(content, user));
});

app.post("/student/join", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const code = (req.body.code || "").toUpperCase().trim();
    if (db.teachersByCode[code]) {
        db.users[req.session.userId].classCode = code;
    }
    res.redirect("/student/dashboard");
});

app.get("/student/help", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const user = db.users[req.session.userId];

    const content = `
        <div class="mb-8 flex items-center gap-4">
            <a href="/student/dashboard" class="p-2.5 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"><i data-lucide="arrow-left" class="w-4 h-4"></i></a>
            <div>
                <h1 class="text-2xl font-bold tracking-tight text-zinc-900">Support Center</h1>
                <p class="text-sm text-zinc-500 mt-0.5">Select a resource below to get assistance</p>
            </div>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <a href="/student/contact-teacher" class="p-6 bg-white app-border rounded-xl text-left hover:shadow-lg hover:-translate-y-1 transition-all group flex flex-col h-full" style="text-decoration: none;">
                <div class="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-5"><i data-lucide="message-square" class="w-6 h-6"></i></div>
                <h3 class="font-bold text-lg text-zinc-900 mb-2">Contact Teacher</h3>
                <p class="text-[13px] text-zinc-500 leading-relaxed flex-1">Send a direct priority message to your instructor for specific clarifications.</p>
            </a>
        </div>
    `;
    res.send(renderDashboard(content, user));
});


app.get("/teacher/school", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.redirect("/");

    let content = '<div class="mb-6 flex items-center justify-between">' +
        '<div class="flex items-center gap-3">' +
            '<a href="/teacher/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50 transition-colors">' +
                '<i data-lucide="arrow-left" class="w-4 h-4 text-zinc-600"></i>' +
            '</a>' +
            '<h1 class="text-2xl font-bold text-zinc-900">School Network</h1>' +
        '</div>' +
        '<div class="text-sm text-zinc-500 font-medium">Coordinate effectively with your colleagues</div>' +
    '</div>';

    if (teacher.schoolId && db.schools[teacher.schoolId]) {
        const school = db.schools[teacher.schoolId];
        content += '<div class="max-w-2xl bg-white app-border rounded-xl p-8 shadow-sm mb-6">' +
            '<h2 class="text-2xl font-bold mb-6 text-zinc-900">' + school.name + '</h2>' +
            '<div class="p-6 bg-zinc-50 rounded-xl border border-zinc-200 mb-8 flex flex-col sm:flex-row items-center justify-between gap-4">' +
                '<div>' +
                    '<p class="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">Invite Code</p>' +
                    '<div class="flex items-center gap-3">' +
                        '<code class="px-4 py-2 bg-white border border-zinc-300 rounded-lg font-mono text-2xl font-bold text-zinc-800 tracking-wider shadow-sm">' + school.code + '</code>' +
                    '</div>' +
                '</div>' +
                '<div class="text-xs text-zinc-500 max-w-xs text-center sm:text-left leading-relaxed bg-white/50 p-3 rounded-lg border border-zinc-100 italic">' +
                    'Share this code with other teachers so they can join your network and sync their dashboard.' +
                '</div>' +
            '</div>' +
            '<h3 class="font-bold text-sm mb-4 text-zinc-400 uppercase tracking-widest">Teachers in Network (' + school.teacherIds.length + ')</h3>' +
            '<div class="space-y-3">' +
                school.teacherIds.map(id => {
                    const t = db.users[id];
                    return '<div class="p-4 bg-white border border-zinc-100 shadow-sm rounded-xl flex items-center justify-between transition-all hover:border-zinc-300 group">' +
                        '<div class="flex items-center gap-3">' +
                            '<div class="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-xs">' +
                                (t && t.name ? t.name.charAt(0).toUpperCase() : '?') +
                            '</div>' +
                            '<span class="font-bold text-sm text-zinc-800">' + (t ? t.name : 'Unknown User') + '</span>' +
                        '</div>' +
                        (id === teacher.id ? '<span class="px-3 py-1 bg-zinc-900 text-white font-bold text-xs rounded-full shadow-sm">You</span>' : '') +
                    '</div>';
                }).join('') +
            '</div>' +
        '</div>';
    } else {
        content += '<div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl">' +
            '<div class="bg-white app-border rounded-xl p-8 shadow-sm flex flex-col h-full">' +
                '<div class="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-6 shadow-sm"><i data-lucide="building" class="w-6 h-6"></i></div>' +
                '<h2 class="text-xl font-bold mb-3 text-zinc-900">Create a New School</h2>' +
                '<p class="text-sm text-zinc-500 mb-8 leading-relaxed flex-grow">Start a new school network from scratch. You will get an invite code to share with your colleagues.</p>' +
                '<form action="/teacher/school/create" method="POST" class="space-y-5">' +
                    '<div>' +
                        '<label class="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">School Name</label>' +
                        '<input type="text" name="name" required placeholder="e.g. Washington High School" class="w-full p-4 border border-zinc-200 rounded-xl focus:ring-2 focus:ring-indigo-600 focus:outline-none transition-shadow shadow-sm font-medium">' +
                    '</div>' +
                    '<button type="submit" class="w-full p-4 bg-zinc-950 text-white rounded-xl font-bold hover:shadow-lg hover:bg-zinc-800 transition-all active:scale-[0.98]">Create School</button>' +
                '</form>' +
            '</div>' +
            '<div class="bg-white app-border rounded-xl p-8 shadow-sm flex flex-col h-full">' +
                '<div class="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-6 shadow-sm"><i data-lucide="users" class="w-6 h-6"></i></div>' +
                '<h2 class="text-xl font-bold mb-3 text-zinc-900">Join an Existing School</h2>' +
                '<p class="text-sm text-zinc-500 mb-8 leading-relaxed flex-grow">Enter a 6-character invite code provided by a colleague to join their established network.</p>' +
                '<form action="/teacher/school/join" method="POST" class="space-y-5">' +
                    '<div>' +
                        '<label class="block text-xs font-bold text-zinc-400 uppercase tracking-widest mb-2">Invite Code</label>' +
                        '<input type="text" name="code" required placeholder="e.g. A1B2C3" class="w-full p-4 border border-zinc-200 rounded-xl font-mono uppercase tracking-widest focus:ring-2 focus:ring-emerald-600 focus:outline-none transition-shadow shadow-sm font-bold placeholder:font-sans placeholder:tracking-normal">' +
                    '</div>' +
                    '<button type="submit" class="w-full p-4 bg-emerald-600 text-white rounded-xl font-bold hover:shadow-lg hover:bg-emerald-700 transition-all active:scale-[0.98]">Join School</button>' +
                '</form>' +
            '</div>' +
        '</div>';
    }

    res.send(renderDashboard(content, teacher));
});

app.post("/teacher/school/create", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    const { name } = req.body;
    
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const schoolId = 'school_' + Date.now();
    
    db.schools[schoolId] = { id: schoolId, name, code, teacherIds: [teacher.id] };
    db.schoolsByCode[code] = schoolId;
    
    teacher.schoolId = schoolId;
    res.redirect("/teacher/school");
});

app.post("/teacher/school/join", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    const { code } = req.body;
    const cleanCode = code ? code.trim().toUpperCase() : "";
    
    const schoolId = db.schoolsByCode[cleanCode];
    if (schoolId && db.schools[schoolId]) {
        const school = db.schools[schoolId];
        if (!school.teacherIds.includes(teacher.id)) school.teacherIds.push(teacher.id);
        teacher.schoolId = schoolId;
    }
    res.redirect("/teacher/school");
});

app.get("/teacher/dashboard", async (req, res) => {
    const auth = getAuthedOAuthClient(req);
    if (!auth || !req.session.userId) return res.redirect("/");
    
    const user = db.users[req.session.userId];

    let emails = [];
    let gmailError = null;
    try {
        emails = await fetchEmails(auth);
    } catch (e) {
        gmailError = "Gmail Sync Temporarily Unavailable";
    }

    const emailHtml = emails.length > 0 
        ? emails.map(e => `
            <div class="p-3 bg-white border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors group">
                <div class="flex justify-between items-start mb-1">
                    <span class="text-[12px] font-bold text-zinc-900">${e.from.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                    <span class="text-[10px] text-zinc-400">${e.date}</span>
                </div>
                <div class="text-[12px] font-medium text-zinc-700 truncate">${e.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            </div>`).join("")
        : `<div class="p-8 text-center text-zinc-400 text-sm">${gmailError || "No emails found."}</div>`;

    const content = `
        <div class="mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="col-span-1 md:col-span-2 bg-zinc-950 rounded-xl p-6 text-white overflow-hidden relative">
                <div class="absolute -right-10 -top-10 w-40 h-40 bg-zinc-800 rounded-full blur-3xl opacity-50"></div>
                <h2 class="text-xl font-bold tracking-tight mb-1 relative z-10">Welcome back, ${user.name.split(' ')[0]}</h2>
                <p class="text-zinc-400 text-sm relative z-10">You have 2 pending items to review today.</p>
            </div>
            
            <div class="col-span-1 bg-white app-border rounded-xl p-5 flex flex-col justify-between">
                <div class="text-[11px] font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-1.5"><i data-lucide="key" class="w-3.5 h-3.5"></i> Class Code</div>
                <div class="flex flex-col gap-2 mt-2">
                    <div class="flex items-center justify-between">
                        <div class="text-3xl font-mono font-bold tracking-[0.2em] text-zinc-900">${user.classCode}</div>
                        <button onclick="navigator.clipboard.writeText('${user.classCode}'); const i = this.querySelector('i'); const old = i.getAttribute('data-lucide'); i.setAttribute('data-lucide', 'check'); lucide.createIcons(); setTimeout(() => { i.setAttribute('data-lucide', old); lucide.createIcons(); }, 2000)" class="p-2 bg-zinc-50 text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors" title="Copy Code"><i data-lucide="copy" class="w-4 h-4"></i></button>
                    </div>
                        <form action="/teacher/regenerate-code" method="POST" id="regen-code-form" class="mt-1 w-full" onsubmit="event.preventDefault(); showAppModal('Regenerate Code?', 'Are you sure? All current students will need the new code if they ever sign out.', () => this.submit());">
                            <button type="submit" class="w-full py-1.5 px-3 bg-red-50 text-red-600 text-xs font-bold rounded hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5">
                                <i data-lucide="refresh-cw" class="w-3 h-3"></i> Regenerate Code
                            </button>
                        </form>
                </div>
                <div class="text-[10px] text-zinc-500 mt-2">Share this securely with your students.</div>
            </div>
        </div>

        <div class="grid grid-cols-12 gap-8">
            <div class="col-span-12 lg:col-span-8">
                <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Command Center</h2>
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <a href="/teacher/roster" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                        <div class="p-2 bg-orange-50 text-accent rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="users" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Class Roster</div>
                    </a>
                    <a href="/teacher/email" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                        <div class="p-2 bg-green-50 text-green-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="mail-open" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Email Contacts</div>
                    </a>
                    <a href="/teacher/lessons/manage" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                        <div class="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="book-open" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Manage Lessons</div>
                    </a>
                    <a href="/teacher/lessons/create" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                            <div class="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="sparkles" class="w-5 h-5"></i></div>
                            <div class="text-left font-bold text-sm">Create Lesson</div>
                        </a>
                      <a href="/teacher/rubric/create" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                          <div class="p-2 bg-pink-50 text-pink-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="file-check-2" class="w-5 h-5"></i></div>
                          <div class="text-left font-bold text-sm">Create Rubric</div>
                      </a>
                </div>
                
                ${user.schoolId && db.schools[user.schoolId] ? (function() {
                    const school = db.schools[user.schoolId];
                    const colleagues = school.teacherIds.filter(id => id !== user.id);
                    const colleagueAssignments = Object.values(db.assignments || {}).filter(a => {
                        const l = db.lessons[a.lessonId];
                        return l && colleagues.includes(l.teacherId) && a.dueDate;
                    }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
                    
                    let html = '<div class="mt-8"><div class="flex items-center justify-between mb-4">' +
                        '<h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest">School Assignments (' + school.name + ')</h2>' +
                        '<a href="/teacher/school" class="text-xs font-bold text-indigo-600 hover:text-indigo-700">Manage School &rarr;</a>' +
                        '</div><div class="space-y-3">';
                        
                    if (colleagueAssignments.length === 0) {
                        html += '<div class="p-6 bg-zinc-50 border border-zinc-100 rounded-xl text-center text-sm text-zinc-500">No upcoming assignments from colleagues.</div>';
                    } else {
                        html += colleagueAssignments.map(a => {
                            const l = db.lessons[a.lessonId];
                            const t = db.users[l.teacherId];
                            const tName = t ? t.name : 'Unknown';
                            const dateStr = new Date(a.dueDate).toLocaleDateString();
                            
                            let iconHtml = '<i data-lucide="calendar" class="w-4 h-4"></i>';
                            let iconBg = 'bg-zinc-100 text-zinc-600';
                            let labelHtml = '';
                            
                            if (l.type === 'guide') {
                                iconHtml = '<i data-lucide="compass" class="w-4 h-4"></i>';
                                iconBg = 'bg-blue-50 text-blue-600';
                                labelHtml = '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded ml-2">Guide</span>';
                            }

                            return '<div class="p-4 bg-white app-border rounded-xl flex justify-between items-center shadow-sm">' +
                                '<div class="flex items-center gap-3">' +
                                '<div class="p-2 ' + iconBg + ' rounded-lg">' + iconHtml + '</div>' +
                                '<div><div class="font-bold text-sm text-zinc-900 flex items-center">' + l.title + labelHtml + '</div>' +
                                '<div class="text-xs text-zinc-500 mt-0.5">Teacher: ' + tName + '</div></div></div>' +
                                '<div class="text-xs font-bold px-2 py-1 bg-red-50 text-red-600 rounded">Due: ' + dateStr + '</div></div>';
                        }).join("");
                    }
                    html += '</div></div>';
                    return html;
                })() : '<div class="mt-8 p-6 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between shadow-sm">' +
                    '<div><h3 class="font-bold text-indigo-950 text-sm mb-1">Join a School Network</h3>' +
                    '<p class="text-xs text-indigo-800">Collaborate with other teachers and sync assignment schedules.</p></div>' +
                    '<a href="/teacher/school" class="px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow hover:bg-indigo-700 transition-colors" style="text-decoration: none;">Get Started</a></div>'}
            </div>

            <div class="col-span-12 lg:col-span-4 flex flex-col gap-8">
                <div>
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">Recent Chats</h2>
                    <div class="bg-white app-border rounded-xl overflow-hidden shadow-sm max-h-[350px] overflow-y-auto custom-scroll">
                        ${(() => {
                            if (!db.messages || db.messages.length === 0) return '<div class="p-8 text-center text-zinc-400 text-sm">No messages yet.</div>';
                            
                            const teacherMessages = db.messages.filter(m => m.recipientId === user.id || m.senderId === user.id);
                            const latestByStudent = {};
                            teacherMessages.forEach(m => {
                                const studentId = m.senderId === user.id ? m.recipientId : m.senderId;
                                const student = db.users[studentId];
                                if (student && student.role === 'student') {
                                    if (!latestByStudent[studentId] || latestByStudent[studentId].timestamp < m.timestamp) {
                                        latestByStudent[studentId] = { student, message: m, unread: m.recipientId === user.id && !m.read ? true : false };
                                    }
                                }
                            });
                            
                            const sorted = Object.values(latestByStudent).sort((a,b) => b.message.timestamp - a.message.timestamp);
                            if (sorted.length === 0) return '<div class="p-8 text-center text-zinc-400 text-sm">No messages yet.</div>';
                            
                            return sorted.map(item => `<div class="p-3 bg-white border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors cursor-pointer group" onclick="openChatFor('${item.student.name}')">
                                <div class="flex justify-between items-start mb-1">
                                    <span class="text-[12px] font-bold text-zinc-900 flex items-center gap-1">${item.student.name} ${item.unread ? '<div class="w-1.5 h-1.5 bg-red-500 rounded-full"></div>' : ''}</span>
                                    <span class="text-[10px] text-zinc-400">${new Date(item.message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                </div>
                                <div class="text-[12px] font-medium text-zinc-700 truncate">${item.message.senderId === user.id ? 'You: ' : ''}${item.message.message}</div>
                            </div>`).join("");
                        })()}
                    </div>
                </div>

                <div>
                    <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">Inbox Stream <a href="/teacher/email" class="text-[10px] text-accent hover:underline">View All</a></h2>        
                    <div class="bg-white app-border rounded-xl overflow-hidden shadow-sm max-h-[350px] overflow-y-auto custom-scroll">
                        ${emailHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
    res.send(renderDashboard(content, user));
});


// --- Class Roster Route ---
app.get("/teacher/roster", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.redirect("/");

    // Find students belonging to this teacher
    const students = Object.values(db.users).filter(u => u.role === 'student' && u.classCode === teacher.classCode);

    function getStudentGrade(studentId, classCode) {
        const assignments = Object.values(db.assignments).filter(a => a.classCode === classCode);
        if (assignments.length === 0) return 'N/A';
        let score = 0;
        let maxScore = 0;
        for (const a of assignments) {
            const lesson = db.lessons[a.lessonId];
            if (!lesson) continue;
            const progress = Object.values(db.studentProgress).find(p => p.studentId === studentId && p.assignmentId === a.id);
            const totalQuestions = (lesson.slides || []).filter(slide => slide.question).length;
            if (totalQuestions > 0) {
                maxScore += totalQuestions;
                if (progress && progress.answers) {
                    const correctAnswers = progress.answers.filter(ans => ans.correct).length;
                    score += correctAnswers;
                }
            }
        }
        if (maxScore === 0) return 'N/A';
        return Math.round((score / maxScore) * 100) + '%';
    }

    const studentCards = students.map(s => {
        // Randomly assign online status for visual demonstration
        const isOnline = Math.random() > 0.5;
        const statusColor = isOnline ? 'bg-green-500' : 'bg-zinc-300';
        const statusText = isOnline ? 'Online' : 'Offline';
        const gradeText = getStudentGrade(s.id, teacher.classCode);

        return `
        <div class="p-5 bg-white app-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
            <div class="flex items-center gap-4">
                <div class="relative">
                    <img src="${s.picture || 'https://via.placeholder.com/150'}" alt="${s.name}" class="w-12 h-12 rounded-full border border-zinc-200 object-cover">
                    <div class="absolute bottom-0 right-0 w-3.5 h-3.5 ${statusColor} border-2 border-white rounded-full" title="${statusText}"></div>
                </div>
                <div>
                    <div class="font-bold text-zinc-900">${s.name} <span class="ml-2 px-2 py-0.5 bg-zinc-100 text-zinc-600 rounded-full text-[10px] font-mono">Grade: ${gradeText}</span></div>
                    <div class="text-xs text-zinc-500">${s.email} &bull; ${statusText}</div>
                </div>
            </div>
            
            <div class="flex items-center gap-2">
                <button onclick="openChatFor('${s.name}')" class="px-3 py-1.5 bg-zinc-100 text-zinc-700 text-xs font-semibold rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-1.5">
                    <i data-lucide="message-square" class="w-3.5 h-3.5"></i> Message
                </button>
                <form action="/teacher/roster/remove" method="POST" class="inline" onsubmit="return confirm('Are you sure you want to remove ${s.name} from the class?');">
                    <input type="hidden" name="studentId" value="${s.id}">
                    <button type="submit" class="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5">
                        <i data-lucide="user-minus" class="w-3.5 h-3.5"></i> Remove
                    </button>
                </form>
            </div>
        </div>
        `;
    }).join("");

    const emptyState = `
        <div class="text-center py-16 bg-white app-border rounded-xl">
            <div class="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <i data-lucide="users" class="w-8 h-8 text-zinc-300"></i>
            </div>
            <h3 class="text-lg font-bold text-zinc-900 mb-1">No students yet</h3>
            <p class="text-sm text-zinc-500 mb-6">Share your class code <strong>${teacher.classCode}</strong> with students to have them join.</p>
        </div>
    `;

    var content = `
        <div class="mb-6 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <a href="/teacher/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50 transition-colors"><i data-lucide="arrow-left" class="w-4 h-4 text-zinc-600"></i></a>
                <div>
                    <h1 class="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
                        Class Roster
                    </h1>
                    <p class="text-sm text-zinc-500 mt-0.5">Manage your students and assignments</p>
                </div>
            </div>
            <div class="flex items-center gap-2 bg-zinc-50 px-4 py-2 rounded-lg border border-zinc-200 shadow-sm">
                <i data-lucide="key" class="w-4 h-4 text-zinc-400"></i>
                <span class="text-sm font-bold font-mono tracking-widest text-zinc-900">${teacher.classCode}</span>
            </div>
        </div>
        
        <div class="space-y-4 max-w-4xl">
            ${students.length > 0 ? studentCards : emptyState}
        </div>
    `;
    res.send(renderDashboard(content, teacher));
});

app.post("/teacher/roster/remove", express.urlencoded({ extended: true }), (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.redirect("/");
    
    const studentId = req.body.studentId;
    const student = db.users[studentId];
    
    if (student && student.classCode === teacher.classCode) {
        student.classCode = null; // Kick them out
    }
    
    res.redirect("/teacher/roster");
});

// --- Email Contacts AI Routes ---
app.get("/teacher/email", async (req, res) => {
    const auth = getAuthedOAuthClient(req);
    if (!auth) return res.redirect("/");

    let emails = [];
    try {
        emails = await fetchEmails(auth);
    } catch (e) {
        console.error(e);
    }

    const emailCards = emails.map(e => `
        <div class="p-4 bg-white border border-zinc-200 rounded-xl mb-4 hover:shadow-md transition-shadow cursor-pointer" onclick="openEmail(\`${e.id}\`)">
            <div class="flex justify-between items-start mb-2">
                <span class="font-bold text-zinc-900">${e.from.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
                <span class="text-xs text-zinc-500">${e.date}</span>
                <input type="hidden" id="raw-from-${e.id}" value="${e.rawFrom.replace(/"/g, '&quot;')}">
            </div>
            <div class="font-semibold text-zinc-800 text-sm mb-1" id="subject-${e.id}">${e.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            <div class="text-sm text-zinc-600 line-clamp-2" id="snippet-${e.id}">${e.snippet.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        </div>
    `).join("");

    const content = `
        <div class="mb-6 flex items-center justify-between">
            <h1 class="text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
                <i data-lucide="mail-open" class="w-6 h-6 text-green-600"></i> Email Contacts
            </h1>
            <a href="/teacher/dashboard" class="px-4 py-2 bg-zinc-100 text-zinc-700 text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors">
                Back to Dashboard
            </a>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 h-[700px]">
            <div class="col-span-1 overflow-y-auto custom-scroll pr-2">
                ${emailCards || '<div class="text-zinc-500">No emails found.</div>'}
            </div>
            <div class="col-span-1 md:col-span-2 bg-white app-border rounded-xl p-6 hidden flex flex-col h-full" id="email-view">
                <div class="flex-1 overflow-y-auto">
                    <h2 class="text-xl font-bold text-zinc-900 mb-2" id="ev-subject">Subject</h2>
                    <div class="text-sm text-zinc-500 mb-6 pb-4 border-b border-zinc-100" id="ev-from">From: ...</div>
                    <input type="hidden" id="ev-raw-from" value="">
                    
                    <div class="text-zinc-800 text-sm leading-relaxed mb-6" id="ev-body">
                        Body snippet goes here...
                    </div>
                </div>
                
                <div class="mt-4 pt-4 border-t border-zinc-100">
                    <div class="flex gap-3 mb-4">
                        <button onclick="runAiAction('summarize')" class="flex items-center gap-2 px-4 py-2 bg-purple-50 text-purple-700 font-medium text-sm rounded-lg hover:bg-purple-100 transition-colors">
                            <i data-lucide="sparkles" class="w-4 h-4"></i> Summarize
                        </button>
                        <button onclick="runAiAction('draft')" class="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 font-medium text-sm rounded-lg hover:bg-blue-100 transition-colors">
                            <i data-lucide="pen-tool" class="w-4 h-4"></i> Draft Response
                        </button>
                    </div>
                    
                    <div id="ai-output" class="hidden p-4 bg-zinc-50 border border-zinc-200 rounded-lg text-sm text-zinc-800 relative whitespace-pre-wrap">
                    </div>
                </div>
            </div>
            
            <div class="col-span-1 md:col-span-2 flex items-center justify-center text-zinc-400" id="email-placeholder">
                <div class="text-center">
                    <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
                    <p>Select an email to view</p>
                </div>
            </div>
        </div>

        <script>
            let currentEmail = null;
            function openEmail(id) {
                currentEmail = id;
                document.getElementById('email-placeholder').classList.add('hidden');
                document.getElementById('email-view').classList.remove('hidden');
                document.getElementById('email-view').classList.add('flex');
                
                const snippetNode = document.getElementById('snippet-' + id);
                const snippet = snippetNode.innerText;
                const subject = snippetNode.previousElementSibling.innerText;
                const from = snippetNode.previousElementSibling.previousElementSibling.querySelector('.font-bold').innerText;
                const rawFrom = document.getElementById('raw-from-' + id).value;
                
                document.getElementById('ev-subject').innerText = subject;
                document.getElementById('ev-from').innerText = "From: " + from;
                document.getElementById('ev-raw-from').value = rawFrom;
                document.getElementById('ev-body').innerText = snippet;
                
                document.getElementById('ai-output').classList.add('hidden');
                document.getElementById('ai-output').innerHTML = '';
            }

            async function runAiAction(action) {
                const outputDiv = document.getElementById('ai-output');
                outputDiv.classList.remove('hidden');
                outputDiv.innerHTML = '<div class="flex items-center gap-2 text-zinc-500"><i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Processing...</div>';
                lucide.createIcons();
                
                const body = document.getElementById('ev-body').innerText;
                const from = document.getElementById('ev-from').innerText.replace("From: ", "");
                
                try {
                    const res = await fetch('/api/ai/email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action, content: body, from })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    
                    if (action === 'draft') {
                        outputDiv.innerHTML = '<div class="font-bold text-xs uppercase text-zinc-500 mb-2">AI Suggested Draft</div>' +
                            '<textarea id="draft-content" class="w-full h-40 p-3 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-3">' + data.result + '</textarea>' +
                            '<button onclick="sendEmail()" class="px-4 py-2 bg-blue-600 text-white font-medium text-sm rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2">' +
                                '<i data-lucide="send" class="w-4 h-4"></i> Send Reply' +
                            '</button>';
                        lucide.createIcons();
                    } else {
                        outputDiv.innerHTML = '<div class="font-bold text-xs uppercase text-zinc-500 mb-2">AI Summary</div>' + data.result;
                    }
                } catch (err) {
                    outputDiv.innerHTML = '<div class="text-red-500">Error: ' + err.message + '</div>';
                }
            }

            async function sendEmail() {
                const btn = event.currentTarget;
                btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Sending...';
                lucide.createIcons();
                
                const to = document.getElementById('ev-raw-from').value;
                const subject = "Re: " + document.getElementById('ev-subject').innerText.replace(/^Re:\s*/i, '');
                const body = document.getElementById('draft-content').value;
                
                try {
                    const res = await fetch('/api/email/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ to, subject, body })
                    });
                    
                    if (!res.ok) {
                        const errData = await res.json();
                        throw new Error(errData.error || 'Failed to send email');
                    }
                    
                    btn.innerHTML = '<i data-lucide="check" class="w-4 h-4"></i> Sent Successfully!';
                    btn.classList.replace('bg-blue-600', 'bg-green-600');
                    btn.classList.replace('hover:bg-blue-700', 'hover:bg-green-700');
                    lucide.createIcons();
                } catch (e) {
                    btn.innerHTML = '<i data-lucide="x" class="w-4 h-4"></i> Error Sending';
                    btn.classList.replace('bg-blue-600', 'bg-red-600');
                    btn.classList.replace('hover:bg-blue-700', 'hover:bg-red-700');
                    lucide.createIcons();
                    showAppModal('Error', e.message);
                }
            }
        </script>
    `;
    res.send(renderDashboard(content));
});

app.post("/api/email/send", express.json(), async (req, res) => {
    try {
        const auth = getAuthedOAuthClient(req);
        if (!auth) return res.status(401).json({ error: "Not authenticated" });
        
        const { to, subject, body } = req.body;
        if (!to || !body) return res.status(400).json({ error: "Missing 'to' or 'body'" });
        
        const gmail = google.gmail({ version: "v1", auth });
        
        const utf8Subject = `=?utf-8?B?${Buffer.from(subject || "No Subject").toString('base64')}?=`;
        const messageParts = [
            `To: ${to}`,
            `Subject: ${utf8Subject}`,
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset="UTF-8"',
            'Content-Transfer-Encoding: 7bit',
            '',
            body
        ];
        const message = messageParts.join('\n');
        
        const encodedMessage = Buffer.from(message)
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
            
        await gmail.users.messages.send({
            userId: 'me',
            requestBody: { raw: encodedMessage }
        });
        
        res.json({ success: true });
    } catch (e) {
        console.error("Gmail Send Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/ai/email", express.json(), async (req, res) => {
    try {
        const { action, content, from } = req.body;
        if (!content) return res.status(400).json({ error: "Missing content" });

        let context = "";
        if (req.session.userId && db.users[req.session.userId]) {
            const teacher = db.users[req.session.userId];
            const students = Object.values(db.users).filter(u => u.role === 'student' && u.classCode === teacher.classCode);
            
            function getGrade(studentId) {
                let score = 0, max = 0;
                const assigns = Object.values(db.assignments).filter(a => a.classCode === teacher.classCode);
                for (const a of assigns) {
                    const l = db.lessons[a.lessonId];
                    if (!l) continue;
                    const p = Object.values(db.studentProgress).find(pr => pr.studentId === studentId && pr.assignmentId === a.id);
                    const tq = (l.slides || []).filter(s => s.question).length;
                    if (tq > 0) {
                        max += tq;
                        if (p && p.answers) score += p.answers.filter(ans => ans.correct).length;
                    }
                }
                return max === 0 ? 'N/A' : Math.round((score/max)*100) + '%';
            }

            let foundStudent = null;
            // Try to find if 'from' or 'content' contains a student's email or name
            foundStudent = students.find(s => 
                (from && (from.includes(s.email) || from.includes(s.name))) || 
                (content && (content.includes(s.email) || content.includes(s.name)))
            );
            
            if (students.length > 0) {
                const rosterInfo = students.map(s => `${s.name} (Email: ${s.email}, Grade: ${getGrade(s.id)})`).join('; ');
                context += `\\n\\nCRITICAL CONTEXT: The following students ARE currently enrolled in your class:\n${rosterInfo}\n\nIf the email asks about any of these students, firmly acknowledge that they are your student, use their listed grade, and DO NOT claim you cannot find them.`;
            }

            if (foundStudent) {
                context += `\\n\\nNote: The email is related to your student: ${foundStudent.name} (Email: ${foundStudent.email}).`;

                const recentChats = db.messages.filter(m => m.senderId === foundStudent.id || m.recipientId === foundStudent.id)
                    .slice(-5)
                    .map(m => `${m.senderId === foundStudent.id ? foundStudent.name : 'Teacher'}: ${m.message}`)
                    .join('\\n');
                if (recentChats) {
                    context += `\\nRecent chat history with ${foundStudent.name}:\\n${recentChats}`;
                }
            }
        }

        let prompt = "";
        if (action === "summarize") {
            prompt = "Summarize the following student/parent email concisely in 1-3 bullet points. DO NOT include any introductory or concluding text (e.g. 'Here is the summary:'). ONLY output the bullet points.\\n\\n" + content + context;
        } else if (action === "draft") {
            prompt = "Write a polite, professional, and helpful reply to the following email from a teacher's perspective.\\n\\nEmail: " + content + "\\n" + context + "\\n\\nDraft the response:";
        } else {
            return res.status(400).json({ error: "Invalid action" });
        }

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
        }).catch(async err => {
            return await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "qwen-2.5-8b-instruct",
            });
        });

        res.json({ result: completion.choices[0].message.content });
    } catch (e) {
        console.error("Groq Error:", e);
        res.status(500).json({ error: e.message });
    }
});


// --- AI Rubric Routes ---
app.get("/teacher/rubric/create", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.redirect("/");

    let content = `
    <div class="mb-6 flex items-center gap-3">
        <a href="/teacher/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50">
            <i data-lucide="arrow-left" class="w-4 h-4"></i>
        </a>
        <h1 class="text-2xl font-bold text-zinc-900">Create Rubric</h1>
    </div>

    <div class="max-w-3xl mx-auto bg-white app-border rounded-xl p-8 shadow-sm">
        <form id="rubricForm" class="space-y-6" onsubmit="generateRubric(event)">
            <div>
                <label class="block text-sm font-bold text-zinc-900 mb-2">Assignment Name *</label>
                <input type="text" id="assignmentName" required class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none" placeholder="e.g. History Essay">
            </div>
            <div>
                <label class="block text-sm font-bold text-zinc-900 mb-2">Assignment Description *</label>
                <textarea id="assignmentDesc" required class="w-full p-3 border border-zinc-200 rounded-lg h-32 resize-none focus:ring-2 focus:ring-zinc-950 focus:outline-none" placeholder="Explain what the assignment is..."></textarea>
            </div>
            <div>
                <label class="block text-sm font-bold text-zinc-900 mb-2">What are you looking for? (Optional)</label>
                <textarea id="assignmentCriteria" class="w-full p-3 border border-zinc-200 rounded-lg h-24 resize-none focus:ring-2 focus:ring-zinc-950 focus:outline-none" placeholder="e.g. 5 paragraphs, strong thesis, proper MLA formatting..."></textarea>
            </div>
            
            <button type="submit" id="submitBtn" class="w-full p-4 bg-zinc-950 text-white rounded-xl font-bold hover:shadow-lg hover:bg-zinc-800 transition-all flex items-center justify-center gap-2">
                <i data-lucide="sparkles" class="w-5 h-5"></i> Generate Rubric
            </button>
        </form>

        <div id="loadingState" class="hidden text-center py-12">
            <i data-lucide="loader-2" class="w-8 h-8 text-zinc-400 animate-spin mx-auto mb-4"></i>
            <p class="text-zinc-600 font-medium">AI is crafting your rubric...</p>
        </div>

        <div id="rubricOutput" class="hidden mt-8 pt-8 border-t border-zinc-100">
            <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-bold text-zinc-900">Generated Rubric</h2>
                <button type="button" onclick="copyRubric()" class="px-4 py-2 bg-zinc-100 text-zinc-700 rounded-lg font-medium hover:bg-zinc-200 transition-colors flex items-center gap-2 text-xs shadow-sm">
                    <i data-lucide="copy" class="w-3.5 h-3.5"></i> Copy Board
                </button>
            </div>
            <div id="rubricContent" class="prose prose-sm max-w-none prose-table:border-collapse prose-th:bg-zinc-100 prose-td:border prose-td:border-zinc-200 prose-th:border prose-th:border-zinc-200 prose-th:p-3 prose-td:p-3 prose-table:w-full prose-table:text-sm"></div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
        async function generateRubric(e) {
            e.preventDefault();
            const btn = document.getElementById('submitBtn');
            const loading = document.getElementById('loadingState');
            const output = document.getElementById('rubricOutput');
            const content = document.getElementById('rubricContent');

            btn.disabled = true;
            btn.classList.add('opacity-50');
            loading.classList.remove('hidden');
            output.classList.add('hidden');

            try {
                const res = await fetch('/api/ai/rubric', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: document.getElementById('assignmentName').value,
                        desc: document.getElementById('assignmentDesc').value,
                        criteria: document.getElementById('assignmentCriteria').value
                    })
                });

                const data = await res.json();
                
                if (data.error) throw new Error(data.error);
                
                content.innerHTML = marked.parse(data.rubric);
                lucide.createIcons();
                output.classList.remove('hidden');
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                btn.disabled = false;
                btn.classList.remove('opacity-50');
                loading.classList.remove('hidden');
            }
        }
        
        function copyRubric() {
             const text = document.getElementById('rubricContent').innerText;
             navigator.clipboard.writeText(text);
             const btn = event.currentTarget;
             const originalHtml = btn.innerHTML;
             btn.innerHTML = '<i data-lucide="check" class="w-3.5 h-3.5 text-green-600"></i> Copied!';
             lucide.createIcons();
             setTimeout(() => { btn.innerHTML = originalHtml; lucide.createIcons(); }, 2000);
        }
    </script>
    `;
    
    res.send(renderDashboard(content, teacher));
});

app.post("/api/ai/rubric", express.json(), async (req, res) => {
    try {
        const { name, desc, criteria } = req.body;
        
        const prompt = `You are an expert teacher creating a grading rubric.
Assignment Name: ${name}
Assignment Description: ${desc}
${criteria ? 'Specific Requirements / What the teacher is looking for: ' + criteria : ''}

Please generate a professional, highly-organized grading rubric in a Markdown table format. 
Columns should represent skill levels (e.g., Excellent, Proficient, Needs Improvement, Incomplete).
Rows should represent different grading criteria (e.g., Content, Grammar, Formatting) based on the description provided.

ONLY return the markdown table and absolutely NO other conversational text.`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
        }).catch(async () => {
             return await groq.chat.completions.create({
                 messages: [{ role: "user", content: prompt }],
                 model: "qwen-2.5-8b-instruct",
             });
        });

        res.json({ rubric: completion.choices[0].message.content });
    } catch (e) {
        console.error("Groq Rubric Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// --- Lessons and Progress Routes ---
app.get("/teacher/lessons/manage", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.redirect("/");

    const allAssignments = Object.values(db.assignments || {}).filter(a => a.classCode === teacher.classCode);
    
    let content = `
        <div class="mb-6 flex items-center justify-between">
            <div class="flex items-center gap-3">
                <a href="/teacher/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i>
                </a>
                <h1 class="text-2xl font-bold text-zinc-900">Manage Lessons</h1>
            </div>
            <a href="/teacher/lessons/create" class="px-4 py-2 bg-zinc-950 text-white rounded-lg font-medium hover:bg-zinc-800 flex items-center gap-2 text-sm shadow-sm transition-colors">
                <i data-lucide="plus" class="w-4 h-4"></i> Create Lesson
            </a>
        </div>
        
        <div class="space-y-4 max-w-4xl">
            ${allAssignments.length > 0 ? allAssignments.map(assignment => {    
                const lesson = db.lessons[assignment.lessonId];
                if (!lesson) return '';
                
                let icon = '<i data-lucide="book-open" class="w-6 h-6"></i>';
                let iconBg = 'bg-indigo-50 text-indigo-600';
                let label = '';
                
                if (lesson.type === 'guide') {
                    icon = '<i data-lucide="compass" class="w-6 h-6"></i>';
                    iconBg = 'bg-blue-50 text-blue-600';
                    label = '<span class="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] uppercase font-bold rounded ml-2">Guide</span>';
                } else if (lesson.type === 'test') {
                    icon = '<i data-lucide="file-warning" class="w-6 h-6"></i>';
                    iconBg = 'bg-red-50 text-red-600';
                    label = '<span class="px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] uppercase font-bold rounded ml-2">Test</span>';
                }

                return `
                    <div class="p-5 bg-white app-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
                        <div class="flex items-center gap-4">
                            <div class="p-3 ${iconBg} rounded-lg">
                                ${icon}
                            </div>
                            <div>
                                <div class="font-bold text-zinc-900 flex items-center">${lesson.title}${label}</div>
                                <div class="text-xs text-zinc-500 mt-1">        
                                    Assigned: ${new Date(assignment.assignedAt || lesson.createdAt || Date.now()).toLocaleDateString()} &bull; Due: ${assignment.dueDate ? new Date(assignment.dueDate).toLocaleDateString() : 'No Due Date'}   
                                </div>
                            </div>
                        </div>
                        <div class="flex items-center gap-2">
                            <form action="/teacher/lessons/delete" method="POST" class="inline" onsubmit="event.preventDefault(); showAppModal('Remove Lesson?', 'Are you sure you want to remove ${lesson.title.replace(/'/g, "\\'")}? This will also delete student progress for this assignment.', () => this.submit());">
                                <input type="hidden" name="assignmentId" value="${assignment.id}">
                                <button type="submit" class="px-3 py-1.5 bg-red-50 text-red-600 text-xs font-semibold rounded-lg hover:bg-red-100 transition-colors flex items-center gap-1.5">
                                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> Remove
                                </button>
                            </form>
                        </div>
                    </div>
                `;
            }).join('') : `
                <div class="text-center py-16 bg-white app-border rounded-xl text-zinc-500">
                    <i data-lucide="inbox" class="w-12 h-12 mx-auto mb-3 opacity-50"></i>
                    <p>No lessons currently assigned to this class.</p>
                </div>
            `}
        </div>
    `;
    res.send(renderDashboard(content, teacher));
});

app.post("/teacher/lessons/delete", express.urlencoded({ extended: true }), (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.redirect("/");

    const assignmentId = req.body.assignmentId;
    const assignment = db.assignments[assignmentId];
    
    if (assignment && assignment.classCode === teacher.classCode) {
        // Find lesson ID to also delete progress optionally, but for now we just delete assignment. 
        // We will remove the assignment and the progress documents for this assignment.
        delete db.assignments[assignmentId];

        // Also cleanup student progress for this assignment
        for (const [progId, prog] of Object.entries(db.studentProgress || {})) {
            if (prog.assignmentId === assignmentId) {
                delete db.studentProgress[progId];
            }
        }
    }

    res.redirect("/teacher/lessons/manage?msg=lesson_removed");
});

app.get("/teacher/lessons/create", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.redirect("/");

    let content = `
        
          <div class="mb-6 flex items-center justify-between">
              <div class="flex items-center gap-3">
                  <a href="/teacher/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50">
                      <i data-lucide="arrow-left" class="w-4 h-4"></i>
                  </a>
                  <h1 class="text-2xl font-bold text-zinc-900">Create New Lesson</h1>
              </div>
              
              <div class="flex items-center gap-2">
                  <form action="/api/lessons/assign-examples" method="POST" class="inline">
                      <button type="submit" class="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg font-medium hover:bg-indigo-100 flex items-center gap-2 text-sm shadow-sm transition-colors">
                          <i data-lucide="book-open" class="w-4 h-4"></i> Assign Example Lessons
                      </button>
                  </form>
                  <input type="file" id="import-json-file" accept=".json" class="hidden" onchange="handleImportJson(event)">
                  <button onclick="document.getElementById('import-json-file').click()" class="px-4 py-2 bg-white border border-zinc-200 text-zinc-700 rounded-lg font-medium hover:bg-zinc-50 flex items-center gap-2 text-sm shadow-sm transition-colors">
                      <i data-lucide="upload" class="w-4 h-4"></i> Import JSON
                  </button>
              </div>
          </div>

          <script>
            async function handleImportJson(event) {
                const file = event.target.files[0];
                if (!file) return;
                
                try {
                    const text = await file.text();
                    const json = JSON.parse(text);
                    
                    const response = await fetch('/api/lessons/import', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(json)
                    });
                    
                    if (response.ok) {
                        showAppModal('Success', 'Lesson imported successfully!', () => {
                            window.location.href = '/teacher/dashboard';
                        });
                    } else {
                        const error = await response.json();
                        showAppModal('Error', 'Failed to import: ' + (error.error || 'Unknown error'));
                    }
                } catch (e) {
                    showAppModal('Error', 'Invalid JSON file: ' + e.message);
                }
                
                // Clear the input so it can be used again
                event.target.value = '';
            }
          </script>


        <div class="max-w-4xl">
            <form action="/api/lessons/create" method="POST" class="space-y-6">
                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Assignment Type *</label>
                    <select id="assignmentTypeToggle" name="type" class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none" onchange="toggleAssignmentType()">
                        <option value="lesson">Normal Lesson</option>
                        <option value="guide">Guide</option>
                                        <option value="test">Test</option>
                    </select>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Title *</label>
                    <input type="text" name="title" required placeholder="e.g., The Industrial Revolution"
                           class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none">
                </div>

                <div id="guide-builder-section" class="hidden">
                    <div class="bg-blue-50 border border-blue-200 rounded-xl p-6 shadow-sm mb-6 text-blue-900">
                        <div class="font-bold flex items-center gap-2 mb-2"><i data-lucide="info" class="w-5 h-5"></i> Please install our extension!</div>
                        <p class="text-sm">To create a guide, you need the ClassLoop extension. For your students to complete Guides, they need the ClassLoop extension.</p>
                        <a href="https://github.com/VivaanCode/Groundwork" target="_blank" class="text-blue-700 underline font-medium mt-2 inline-block">https://github.com/VivaanCode/ClassLoop</a>
                    </div>
                    <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                        <label class="block text-sm font-bold text-zinc-900 mb-2">Guide URL *</label>
                        <input type="url" id="guideUrlInput" name="guideURL" placeholder="https://example.com/guide..."
                               class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none">
                    </div>
                </div>

                <div id="lesson-builder-section" class="space-y-6">
                    <div class="bg-white app-border rounded-xl p-6 shadow-sm">      
                        <label class="block text-sm font-bold text-zinc-900 mb-2">Lesson Content (Markdown) *</label>
                    <textarea id="lessonContentInput" name="content" required rows="10" placeholder="Write your lesson content here..."
                              class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none resize-none"></textarea>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                    <h3 class="font-bold text-zinc-900 mb-4">Lesson Slides</h3>
                    <div id="slides-container" class="space-y-4 mb-4">
                        <div class="slide-item p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
                            <input type="text" name="slides[]" placeholder="Slide 1 title" class="w-full p-2 border border-zinc-200 rounded mb-2">
                            <textarea name="slide-content[]" placeholder="Slide content..." rows="3" class="w-full p-2 border border-zinc-200 rounded resize-none"></textarea>
                            
                            <label class="block text-sm font-medium text-zinc-700 mt-4 mb-2">Checkpoint Question (Optional)</label>
                            <input type="text" name="questions[]" placeholder="Ask a checkpoint question..." class="w-full p-2 border border-zinc-200 rounded mb-2">
                            <div class="flex gap-2 mb-2">
                                <input type="text" name="question-option-1[]" placeholder="Option A" class="flex-1 p-2 border border-zinc-200 rounded text-sm">
                                <input type="text" name="question-option-2[]" placeholder="Option B" class="flex-1 p-2 border border-zinc-200 rounded text-sm">
                            </div>
                            <div class="flex gap-2 mb-2">
                                <input type="text" name="question-option-3[]" placeholder="Option C" class="flex-1 p-2 border border-zinc-200 rounded text-sm">
                                <input type="text" name="question-option-4[]" placeholder="Option D" class="flex-1 p-2 border border-zinc-200 rounded text-sm">
                            </div>
                            <label class="block text-sm font-medium text-zinc-700 mb-2">Correct Answer (A, B, C, or D)</label>
                            <input type="text" name="question-answer[]" placeholder="A, B, C, or D" class="w-full p-2 border border-zinc-200 rounded text-sm uppercase">
                        </div>
                    </div>
                    <button type="button" onclick="addSlide()" class="px-4 py-2 bg-zinc-100 text-zinc-700 rounded font-medium hover:bg-zinc-200">
                        + Add Slide
                    </button>
                    </div>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm mb-6">
                    <label class="block text-sm font-bold text-zinc-900 mb-2">Due Date</label>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="date" id="dueDateInput" name="dueDate" class="w-full p-3 border border-zinc-200 rounded-lg focus:ring-2 focus:ring-zinc-950 focus:outline-none">
                        <div id="dateWarning" class="p-3 bg-amber-50 rounded-lg border border-amber-200 text-sm text-amber-800 hidden">
                            <div class="font-bold flex items-center gap-2"><i data-lucide="alert-triangle" class="w-4 h-4"></i> Schedule Conflict Warning</div>
                            <div id="dateWarningText" class="mt-1 text-xs"></div>
                        </div>
                    </div>
                </div>

                <div class="flex gap-3">
                    <button type="submit" class="flex-1 py-3 bg-zinc-950 text-white rounded-lg font-bold hover:bg-zinc-800">
                        Create & Assign Lesson
                    </button>
                    <a href="/teacher/dashboard" class="flex-1 py-3 bg-zinc-100 text-zinc-700 rounded-lg font-bold hover:bg-zinc-200 text-center">
                        Cancel
                    </a>
                </div>
            </form>
        </div>

        <script>
            function toggleAssignmentType() {
                var type = document.getElementById('assignmentTypeToggle').value;
                var guideSection = document.getElementById('guide-builder-section');
                var lessonSection = document.getElementById('lesson-builder-section');
                var lessonContentInput = document.getElementById('lessonContentInput');
                var guideUrlInput = document.getElementById('guideUrlInput');
                
                if (type === 'guide') {
                    guideSection.classList.remove('hidden');
                    lessonSection.classList.add('hidden');
                    if(lessonContentInput) lessonContentInput.required = false;
                    if(guideUrlInput) guideUrlInput.required = true;
                } else {
                    guideSection.classList.add('hidden');
                    lessonSection.classList.remove('hidden');
                    if(lessonContentInput) lessonContentInput.required = true;
                    if(guideUrlInput) guideUrlInput.required = false;
                }
            }

            
            async function generateAiSlides() {
                const title = document.querySelector('input[name="title"]').value.trim();
                const description = document.getElementById('lessonContentInput').value.trim();
                const firstSlideInput = document.querySelector('input[name="slides[]"]');
                const firstSlideContent = document.querySelector('textarea[name="slide-content[]"]');
                const firstSlideQuestion = document.querySelector('input[name="questions[]"]');
                
                if (!title || !description || !firstSlideInput || !firstSlideInput.value.trim() || !firstSlideContent.value.trim()) {
                    alert('Please fill out the lesson title, description, and the content of the first slide before generating more slides with AI.');
                    return;
                }
                
                const slideCountInput = document.getElementById('ai-slide-count');
                const count = parseInt(slideCountInput.value) || 3;
                
                const btn = document.getElementById('btn-generate-slides');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Generating...';
                btn.disabled = true;
                
                // Construct first slide payload
                const parentSlide = firstSlideInput.closest('.slide-item');
                const qOptions = parentSlide.querySelectorAll('input[name^="question-option-"]');
                const qAnswer = parentSlide.querySelector('input[name="question-answer[]"]');
                
                const firstSlide = {
                    title: firstSlideInput.value.trim(),
                    content: firstSlideContent.value.trim(),
                    question: firstSlideQuestion ? firstSlideQuestion.value.trim() : '',
                    options: Array.from(qOptions).map(o => o.value.trim()),
                    answer: qAnswer ? qAnswer.value.trim().toUpperCase() : ''
                };

                try {
                    const response = await fetch('/api/ai/generate-slides', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, description, firstSlide, count })
                    });
                    
                    if (!response.ok) throw new Error('API Error');
                    
                    const newSlides = await response.json();
                    
                    for (const slide of newSlides) {
                        const nextCount = document.querySelectorAll('.slide-item').length + 1;
                        let slideHtml = '<div class="slide-item p-4 bg-purple-50/50 border border-purple-200 rounded-lg mt-4 shadow-sm">';
                        slideHtml += '<div class="flex items-center gap-2 mb-2"><i data-lucide="sparkles" class="w-4 h-4 text-purple-600"></i><span class="text-xs font-bold text-purple-600 uppercase tracking-wider">AI Generated Slide</span></div>';
                        slideHtml += '<input type="text" name="slides[]" placeholder="Slide ' + nextCount + ' title" value="' + (slide.title || '').replace(/"/g, '&quot;') + '" class="w-full p-2 border border-zinc-200 rounded mb-2">';
                        slideHtml += '<textarea name="slide-content[]" placeholder="Slide content..." rows="3" class="w-full p-2 border border-zinc-200 rounded resize-none">' + (slide.content || '') + '</textarea>';
                        slideHtml += '<label class="block text-sm font-medium text-zinc-700 mt-4 mb-2">Checkpoint Question (Optional)</label>';
                        slideHtml += '<input type="text" name="questions[]" placeholder="Ask a checkpoint question..." value="' + (slide.question || '').replace(/"/g, '&quot;') + '" class="w-full p-2 border border-zinc-200 rounded mb-2">';
                        slideHtml += '<div class="flex gap-2 mb-2">';
                        slideHtml += '<input type="text" name="question-option-1[]" placeholder="Option A" value="' + (slide.options && slide.options[0] ? slide.options[0] : '').replace(/"/g, '&quot;') + '" class="flex-1 p-2 border border-zinc-200 rounded text-sm">';
                        slideHtml += '<input type="text" name="question-option-2[]" placeholder="Option B" value="' + (slide.options && slide.options[1] ? slide.options[1] : '').replace(/"/g, '&quot;') + '" class="flex-1 p-2 border border-zinc-200 rounded text-sm">';
                        slideHtml += '</div><div class="flex gap-2 mb-2">';
                        slideHtml += '<input type="text" name="question-option-3[]" placeholder="Option C" value="' + (slide.options && slide.options[2] ? slide.options[2] : '').replace(/"/g, '&quot;') + '" class="flex-1 p-2 border border-zinc-200 rounded text-sm">';
                        slideHtml += '<input type="text" name="question-option-4[]" placeholder="Option D" value="' + (slide.options && slide.options[3] ? slide.options[3] : '').replace(/"/g, '&quot;') + '" class="flex-1 p-2 border border-zinc-200 rounded text-sm">';
                        slideHtml += '</div><label class="block text-sm font-medium text-zinc-700 mb-2">Correct Answer (A, B, C, or D)</label>';
                        slideHtml += '<input type="text" name="question-answer[]" placeholder="A, B, C, or D" value="' + (slide.answer || '') + '" class="w-full p-2 border border-zinc-200 rounded text-sm uppercase">';
                        slideHtml += '</div>';
                        document.getElementById('slides-container').insertAdjacentHTML('beforeend', slideHtml);
                    }
                    
                    // Re-initialize lucide icons for new slides
                    if (window.lucide) {
                        lucide.createIcons();
                    }
                    
                    // Scroll to bottom
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    
                } catch(err) {
                    alert('Error generating slides: ' + err.message);
                } finally {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                    if (window.lucide) lucide.createIcons();
                }
            }
            
            function addSlide() {
                const count = document.querySelectorAll('.slide-item').length + 1;
                const html = '<div class="slide-item p-4 bg-zinc-50 border border-zinc-200 rounded-lg mt-4"> <input type="text" name="slides[]" placeholder="Slide ' + count + ' title" class="w-full p-2 border border-zinc-200 rounded mb-2"> <textarea name="slide-content[]" placeholder="Slide content..." rows="3" class="w-full p-2 border border-zinc-200 rounded resize-none"></textarea> <label class="block text-sm font-medium text-zinc-700 mt-4 mb-2">Checkpoint Question (Optional)</label> <input type="text" name="questions[]" placeholder="Ask a checkpoint question..." class="w-full p-2 border border-zinc-200 rounded mb-2"> <div class="flex gap-2 mb-2"> <input type="text" name="question-option-1[]" placeholder="Option A" class="flex-1 p-2 border border-zinc-200 rounded text-sm"> <input type="text" name="question-option-2[]" placeholder="Option B" class="flex-1 p-2 border border-zinc-200 rounded text-sm"> </div> <div class="flex gap-2 mb-2"> <input type="text" name="question-option-3[]" placeholder="Option C" class="flex-1 p-2 border border-zinc-200 rounded text-sm"> <input type="text" name="question-option-4[]" placeholder="Option D" class="flex-1 p-2 border border-zinc-200 rounded text-sm"> </div> <label class="block text-sm font-medium text-zinc-700 mb-2">Correct Answer (A, B, C, or D)</label> <input type="text" name="question-answer[]" placeholder="A, B, C, or D" class="w-full p-2 border border-zinc-200 rounded text-sm uppercase"> </div>';
                document.getElementById('slides-container').insertAdjacentHTML('beforeend', html);
            }
        </script>
    `;
    res.send(renderDashboard(content, teacher));
});

app.post("/api/lessons/assign-examples", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.status(403).send("Forbidden");

    const defaultLessonId1 = "lesson_def_1_" + Math.random().toString(36).substring(2, 9);
    db.lessons[defaultLessonId1] = {
        id: defaultLessonId1,
        title: "Introduction to History",
        content: "Welcome to history class! Let's learn about the past.",
        slides: [
            {
                title: "What is History?",
                content: "History is the study of past events. It helps us understand our world today by seeing how people lived in the past.",
                question: {
                    text: "What do historians study?",
                    options: ["The Future", "The Present", "The Past", "Space"],
                    correctAnswer: "C"
                }
            },
            {
                title: "Primary Sources",
                content: "Primary sources are firsthand accounts of historical events. They include letters, diaries, photographs, and original documents from the time period being studied.",
                question: {
                    text: "Which of these is a primary source?",
                    options: ["A textbook", "A diary of a soldier", "A modern movie", "A Wikipedia article"],
                    correctAnswer: "B"
                }
            },
            {
                title: "Secondary Sources",
                content: "Secondary sources are interpretations or analyses based on primary sources. Examples include history textbooks, biographies, and historical documentaries.",
                question: {
                    text: "What makes a source secondary?",
                    options: ["It is from the actual time period", "It interprets primary sources after the fact", "It is fake", "It is written by a famous person"],
                    correctAnswer: "B"
                }
            }
        ]
    };
    
    const defaultLessonId2 = "lesson_def_2_" + Math.random().toString(36).substring(2, 9);
    db.lessons[defaultLessonId2] = {
        id: defaultLessonId2,
        title: "Basic Algebra",
        content: "An intro to solving equations.",
        slides: [
            {
                title: "Variables",
                content: "A variable is a letter used to represent an unknown number. Usually, we use 'x' or 'y'.",
                question: {
                    text: "What does a variable represent?",
                    options: ["A known number", "An unknown number", "A shape", "An operation"],
                    correctAnswer: "B"
                }
            },
            {
                title: "Solving Simple Equations",
                content: "To solve an equation, whatever you do to one side, you must do to the other. To isolate x, use opposite operations.",
                question: {
                    text: "If x + 2 = 5, what is x?",
                    options: ["1", "2", "3", "4"],
                    correctAnswer: "C"
                }
            },
            {
                title: "Multiplication with Equations",
                content: "When a number is right next to a variable, like 3x, it means multiplication (3 times x). To solve 3x = 12, divide both sides by 3.",
                question: {
                    text: "If 4x = 20, what is x?",
                    options: ["4", "5", "6", "10"],
                    correctAnswer: "B"
                }
            }
        ]
    };

    const assignmentId1 = "assign_def_1_" + Math.random().toString(36).substring(2, 9);
    db.assignments[assignmentId1] = {
        id: assignmentId1,
        classCode: teacher.classCode,
        lessonId: defaultLessonId1,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    const assignmentId2 = "assign_def_2_" + Math.random().toString(36).substring(2, 9);
    db.assignments[assignmentId2] = {
        id: assignmentId2,
        classCode: teacher.classCode,
        lessonId: defaultLessonId2,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };


    const defaultLessonId3 = "lesson_def_3_" + Math.random().toString(36).substring(2, 9);
    db.lessons[defaultLessonId3] = {
        id: defaultLessonId3,
        title: "Example Test: General Knowledge",
        content: "A short test to demonstrate the testing functionality. Make sure you don't exit fullscreen!",
        type: "test",
        slides: [
            {
                title: "Question 1",
                content: "Please answer the following question.",
                question: {
                    text: "What is the capital of France?",
                    options: ["London", "Berlin", "Paris", "Madrid"],
                    correctAnswer: "C"
                }
            },
            {
                title: "Question 2",
                content: "Careful, remember not to leave the test window.",
                question: {
                    text: "Which planet is known as the Red Planet?",
                    options: ["Earth", "Mars", "Jupiter", "Venus"],
                    correctAnswer: "B"
                }
            }
        ]
    };

    const assignmentId3 = "assign_def_3_" + Math.random().toString(36).substring(2, 9);
    db.assignments[assignmentId3] = {
        id: assignmentId3,
        classCode: teacher.classCode,
        lessonId: defaultLessonId3,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    const defaultLessonId4 = "lesson_def_4_" + Math.random().toString(36).substring(2, 9);
    db.lessons[defaultLessonId4] = {
        id: defaultLessonId4,
        title: "Example Guide Lesson",
        content: "This is an example of a guide that runs inside an actual site.",
        type: "guide",
        guideURL: "https://is.gd/ZHCymn"
    };

    const assignmentId4 = "assign_def_4_" + Math.random().toString(36).substring(2, 9);
    db.assignments[assignmentId4] = {
        id: assignmentId4,
        classCode: teacher.classCode,
        lessonId: defaultLessonId4,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    };

    res.redirect("/teacher/dashboard?msg=examples_assigned");
});

app.post("/teacher/regenerate-code", express.urlencoded({ extended: true }), (req, res) => {
    if (!req.session.userId) return res.redirect("/");
    const user = db.users[req.session.userId];
    if (user.role !== 'teacher') return res.redirect("/");
    
    // Remove old code from dictionary
    if (user.classCode) {
        delete db.teachersByCode[user.classCode];
    }
    
    // Generate new code
    const newCode = generateCode();
    user.classCode = newCode;
    db.teachersByCode[newCode] = user.id;
    
    res.redirect("/teacher/dashboard?msg=code_regenerated");
});


app.post("/api/ai/generate-slides", express.json(), async (req, res) => {
    try {
        const { title, description, firstSlide, count } = req.body;
        
        const prompt = `You are an engaging teaching assistant AI creating slides for a lesson.
Lesson Title: ${title}
Lesson Description: ${description}

The teacher has already created the foundation (Slide 1):
Title: ${firstSlide.title}
Content: ${firstSlide.content}
${firstSlide.question ? `Checkpoint Question: ${firstSlide.question}
Options: A) ${firstSlide.options[0]}, B) ${firstSlide.options[1]}, C) ${firstSlide.options[2]}, D) ${firstSlide.options[3]}
Correct Answer: ${firstSlide.answer}` : ''}

CRITICAL REQUIREMENT: Complete the presentation by generating EXACTLY ${count} MORE sequential slides that logically follow Slide 1. DO NOT REWRITE OR INCLUDE SLIDE 1.
Output MUST BE ONLY A RAW JSON ARRAY of objects, with NO markdown formatting (no \`\`\`json blocks), no code block ticks, and no conversational text whatsoever. JUST THE VALID JSON ARRAY.
Each slide object in the array MUST match this EXACT schema:
[
  {
      "title": "A short engaging slide title",
      "content": "A paragraph explaining the topic clearly to students",
      "question": "A multiple choice checkpoint question string (or empty string if none)",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "answer": "A" // Must be exactly A, B, C, or D if question exists (empty string if no question)
  }
]`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7
        }).catch(async (e) => {
             console.error('Groq versatile failed, falling back to mixtral:', e);
             return await groq.chat.completions.create({
                 messages: [{ role: "user", content: prompt }],
                 model: "qwen-2.5-8b-instruct",
                 temperature: 0.7
             });
        });

        let responseText = completion.choices[0].message.content.trim();
        // Defensive cleanup just in case LLM wraps in markdown code block
        if (responseText.startsWith('```json')) {
            responseText = responseText.substring(7);
        }
        if (responseText.startsWith('```')) {
            responseText = responseText.substring(3);
        }
        if (responseText.endsWith('```')) {
            responseText = responseText.substring(0, responseText.length - 3);
        }
        responseText = responseText.trim();
        
        try {
            const parsedSlides = JSON.parse(responseText);
            if (!Array.isArray(parsedSlides)) {
                return res.status(500).json({ error: "AI didn't return an array" });
            }
            res.json(parsedSlides);
        } catch(err) {
            console.error('Failed to parse AI JSON:', err, responseText);
            res.status(500).json({ error: "Failed to parse AI response." });
        }
    } catch(e) {
        console.error('AI Slide Gen Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/lessons/create", express.urlencoded({ extended: true }), (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const teacher = db.users[req.session.userId];
    if (teacher.role !== 'teacher') return res.status(403).send("Forbidden");

    const lessonId = "lesson_" + Math.random().toString(36).substring(2, 9);
    
    const getArr = (val) => Array.isArray(val) ? val : (val ? [val] : []);
    
    const titles = getArr(req.body['slides'] || req.body['slides[]']);
    const contents = getArr(req.body['slide-content'] || req.body['slide-content[]']);
    const questions = getArr(req.body['questions'] || req.body['questions[]']);
    const opt1 = getArr(req.body['question-option-1'] || req.body['question-option-1[]']);
    const opt2 = getArr(req.body['question-option-2'] || req.body['question-option-2[]']);
    const opt3 = getArr(req.body['question-option-3'] || req.body['question-option-3[]']);
    const opt4 = getArr(req.body['question-option-4'] || req.body['question-option-4[]']);
    const answers = getArr(req.body['question-answer'] || req.body['question-answer[]']);

    const slides = titles.map((title, idx) => ({
        id: idx,
        title,
        content: contents[idx] || '',
        question: questions[idx] && questions[idx].trim() !== '' ? {
            text: questions[idx],
            options: [opt1[idx], opt2[idx], opt3[idx], opt4[idx]],
            correctAnswer: (answers[idx] || '').toUpperCase()
        } : null
    }));

    db.lessons[lessonId] = {
        id: lessonId,
        teacherId: teacher.id,
        title: req.body.title,
        content: req.body.content,
        classCode: teacher.classCode,
        slides,
        dueDate: req.body.dueDate || null,
        createdAt: new Date(),
        type: req.body.type || 'lesson',
        guideURL: req.body.guideURL || null
    };

    const assignmentId = "assign_" + Math.random().toString(36).substring(2, 9);
    db.assignments[assignmentId] = {
        id: assignmentId,
        lessonId,
        classCode: teacher.classCode,
        assignedAt: new Date(),
        dueDate: req.body.dueDate
    };

    res.redirect("/teacher/dashboard?msg=lesson_created");
});

app.get("/student/study-groups/:assignmentId", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const student = db.users[req.session.userId];
    if (student.role !== 'student') return res.redirect("/");

    const assignmentId = req.params.assignmentId;
    const assignment = db.assignments[assignmentId];
    if (!assignment || assignment.classCode !== student.classCode) return res.status(403).send("Forbidden");
    
    const lesson = db.lessons[assignment.lessonId];
    if (!lesson) return res.status(404).send("Lesson not found");
    if (lesson.type === 'guide' && lesson.guideURL) {
        return res.redirect(lesson.guideURL);
    }

    const peers = Object.values(db.studentProgress)
        .filter(p => p.assignmentId === assignmentId && p.studentId !== student.id)
        .map(p => ({
            progress: p,
            user: db.users[p.studentId]
        }))
        .filter(p => p.user && p.user.classCode === student.classCode);

    let content = `
        <div class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <a href="/student/lesson/${assignmentId}" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50 transition-colors">
                    <i data-lucide="arrow-left" class="w-4 h-4 text-zinc-600"></i>
                </a>
                <div>
                    <h1 class="text-2xl font-bold text-zinc-900">Study Groups</h1>
                    <div class="text-sm text-zinc-500 font-medium">${lesson.title}</div>
                </div>
            </div>
        </div>
        
        <div class="bg-white app-border rounded-xl p-8 shadow-sm max-w-3xl mx-auto mt-4">
            <div class="text-center mb-8">
                <div class="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="users" class="w-8 h-8"></i>
                </div>
                <h2 class="text-xl font-bold text-zinc-900">Find a Study Partner</h2>
                <p class="text-zinc-500 text-sm mt-2 max-w-lg mx-auto">Connect with classmates who are also working on this lesson.</p>
            </div>
            
            <div class="space-y-4">
                ${peers.length > 0 ? peers.map(p => `
                    <div class="flex items-center justify-between p-4 border border-zinc-100 rounded-xl hover:border-zinc-300 transition-all bg-white shadow-sm hover:shadow-md">
                        <div class="flex items-center gap-4">
                            <img src="${p.user.picture || 'https://via.placeholder.com/150'}" alt="${p.user.name}" class="w-10 h-10 rounded-full border border-zinc-200 object-cover">
                            <div>
                                <h3 class="font-bold text-zinc-900 text-sm">${p.user.name}</h3>
                                <p class="text-xs text-zinc-500 mt-0.5">Progress: Slide ${(p.progress.progress || 0) + 1} of ${lesson.slides.length}</p>
                            </div>
                        </div>
                        <span class="text-[10px] font-bold px-2 py-1 bg-emerald-100 text-emerald-700 rounded-lg flex items-center gap-1 uppercase tracking-widest">
                            <i data-lucide="circle-dot" class="w-3 h-3"></i> Working
                        </span>
                    </div>
                `).join('') : `
                    <div class="text-center py-8 text-zinc-500 border border-dashed border-zinc-200 rounded-xl bg-zinc-50 text-sm">
                        No other students have started this lesson yet. Be the first!
                    </div>
                `}
            </div>
        </div>
    `;

    res.send(renderDashboard(content, student));
});

app.get(["/student/lesson/:assignmentId", "/student/test/:assignmentId"], (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const student = db.users[req.session.userId];
    
    const assignment = db.assignments[req.params.assignmentId];
    if (!assignment || assignment.classCode !== student.classCode) return res.status(403).send("Forbidden");
    
    const lesson = db.lessons[assignment.lessonId];
    if (!lesson) return res.status(404).send("Lesson not found");
    
    let progress = Object.values(db.studentProgress).find(p => 
        p.studentId === student.id && p.assignmentId === req.params.assignmentId
    );
    
    if (!progress) {
        progress = {
            id: "prog_" + Math.random().toString(36).substring(2, 9),
            studentId: student.id,
            assignmentId: req.params.assignmentId,
            progress: 0,
            answers: [],
            completedAt: null
        };
        db.studentProgress[progress.id] = progress;
    }
    
    const currentSlideIdx = progress.progress || 0;
    const currentSlide = lesson.slides[currentSlideIdx] || {};
    const hasQuestion = currentSlide.question;
    const totalSlides = lesson.slides.length;
    const isTest = lesson.type === 'test' || assignment.type === 'test';
    
    let content = `
        ${isTest ? `
        <style>
            nav { display: none !important; }
            main { padding-top: 2rem !important; max-w-full !important; margin: 0 !important; width: 100%; height: 100vh; overflow: auto; }
            body { background-color: white !important; }
        </style>
        <script>
            // Attempt to automatically enter fullscreen for tests
            document.addEventListener('click', function _fullscreen() {
                 if(document.documentElement.requestFullscreen && !document.fullscreenElement) {
                      document.documentElement.requestFullscreen().catch(e => console.log('Could not enter fullscreen', e));
                 }
                 document.removeEventListener('click', _fullscreen);
            });
        </script>
        ` : ''}
        <div class="mb-4 flex items-center justify-between">
            <a href="/student/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50">
                <i data-lucide="arrow-left" class="w-4 h-4"></i>
            </a>
            <h1 class="text-xl font-bold text-zinc-900 flex-1 ml-4">${lesson.title} ${isTest ? '<span class="ml-2 px-2 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-lg uppercase">Test Mode</span>' : ''}</h1>
            <div class="flex items-center gap-2 text-sm font-medium text-zinc-500">
                <div class="w-32 h-2 bg-zinc-200 rounded-full overflow-hidden">
                    <div class="h-full bg-accent transition-all" style="width: ${((currentSlideIdx) / totalSlides * 100)}%"></div>
                </div>
                <span>${currentSlideIdx + 1} of ${totalSlides}</span>
            </div>
        </div>
        
        <div class="max-w-6xl mx-auto grid grid-cols-1 ${isTest ? '' : 'lg:grid-cols-3'} gap-6">
            <div class="${isTest ? 'bg-white app-border rounded-xl p-8 shadow-sm flex flex-col items-center max-w-3xl mx-auto w-full' : 'lg:col-span-2 bg-white app-border rounded-xl p-8 shadow-sm'}">
                <h2 class="text-2xl font-bold text-zinc-950 mb-6 w-full">${currentSlide.title || 'Content'}</h2>
                <div class="prose prose-sm max-w-none text-zinc-700 mb-8 w-full">
                    ${(currentSlide.content || '').replace(/\n/g, '<br>')}
                </div>
                
                ${hasQuestion ? `
                    <div class="mt-8 p-6 bg-zinc-50 border border-zinc-200 rounded-xl w-full">
                        <h3 class="font-bold text-zinc-900 mb-4">${currentSlide.question.text}</h3>
                        <div class="space-y-2" id="answers-container">
                            ${currentSlide.question.options.map((opt, idx) => {
                                if (!opt) return '';
                                const letter = String.fromCharCode(65 + idx);
                                return `
                                <label class="flex items-center p-3 bg-white border border-zinc-200 rounded-lg cursor-pointer hover:border-accent transition-colors">
                                    <input type="radio" name="answer" value="${letter}" class="mr-3" required>
                                    <span><strong>${letter}.</strong> ${opt}</span>
                                </label>`;
                            }).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
            
            ${!isTest ? `
            <div class="lg:col-span-1">
                <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mt-0 shadow-sm relative sticky top-6">
                    <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="sparkles" class="w-4 h-4 text-indigo-600"></i>
                        <span class="font-bold text-indigo-900 text-sm">AI Help</span>
                    </div>
                    <p class="text-xs text-indigo-800 mb-4">Stuck? Let AI guide you to the answer without giving it away.</p>
                    <button onclick="getAiHelp()" class="w-full py-2 px-3 bg-indigo-600 text-white text-xs font-bold rounded hover:bg-indigo-700 transition-colors">
                        Get AI Hint
                    </button>
                    <div id="ai-response" class="mt-3 text-xs text-indigo-900 hidden space-y-2 p-3 bg-white/50 rounded-lg"></div>
                </div>

                <div class="bg-emerald-50 border border-emerald-100 rounded-xl p-4 mt-6 shadow-sm sticky top-[220px]">
                    <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="users" class="w-4 h-4 text-emerald-600"></i>
                        <span class="font-bold text-emerald-900 text-sm">Study Groups</span>
                    </div>
                    <p class="text-xs text-emerald-800 mb-4">Find classmates working on this right now.</p>
                    <a href="/student/study-groups/${req.params.assignmentId}" class="block w-full py-2 px-3 bg-emerald-600 text-white text-center text-xs font-bold rounded hover:bg-emerald-700 transition-colors" style="text-decoration:none;">
                        Find a Group
                    </a>
                </div>
            </div>
            ` : ''}
        </div>
        
        <div class="max-w-6xl mx-auto mt-8 flex gap-3 justify-between ${isTest ? 'max-w-3xl' : 'max-w-4xl'}">
            <button onclick="prevSlide()" class="px-6 py-3 bg-zinc-100 text-zinc-700 font-bold rounded-lg hover:bg-zinc-200" 
                    ${currentSlideIdx === 0 ? 'disabled style="opacity:0.5;cursor:not-allowed"' : ''}>
                ← Previous
            </button>
            
            ${hasQuestion ? `
                <button onclick="submitAnswer()" class="px-6 py-3 bg-accent text-white font-bold rounded-lg hover:bg-orange-600">
                    Check Answer
                </button>
            ` : `
                <button onclick="nextSlide()" class="px-6 py-3 bg-zinc-950 text-white font-bold rounded-lg hover:bg-zinc-800">
                    ${currentSlideIdx === totalSlides - 1 ? 'Finish' : 'Next →'}
                </button>
            `}
        </div>
        
        <script>
            const assignmentId = '${req.params.assignmentId}';
            const totalSlides = ${totalSlides};
            let currentSlideIdx = ${currentSlideIdx};
            const isTestMode = ${isTest};
            
            // Rehydrate server-side data properly
            const slideData = ${JSON.stringify({
                title: currentSlide.title || '',
                content: currentSlide.content || '',
                question: hasQuestion ? currentSlide.question.text : '',
                options: hasQuestion ? currentSlide.question.options.join(', ') : ''
            })};
            const lessonTitle = ${JSON.stringify(lesson.title)};
            
            function goToSlide(idx) {
                fetch('/api/lesson-progress', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assignmentId, slideIndex: idx })
                }).then(() => location.reload());
            }
            
            function prevSlide() {
                if (currentSlideIdx > 0) goToSlide(currentSlideIdx - 1);
            }
            
            function nextSlide() {
                if (currentSlideIdx < totalSlides - 1) {
                    goToSlide(currentSlideIdx + 1);
                } else {
                    fetch('/api/lesson-progress', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ assignmentId, slideIndex: totalSlides })
                    }).then(() => {
                        window.postMessage({ type: "CLASSLOOP_END_TEST" }, "*"); 
                        window.location.href = '/student/dashboard';
                    });
                }
            }
            
            function submitAnswer() {
                const selected = document.querySelector('input[name="answer"]:checked');
                if (!selected) {
                    showAppModal('Attention', 'Please select an answer');
                    return;
                }
                
                fetch('/api/lesson-answer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ assignmentId, slideIndex: currentSlideIdx, answer: selected.value })
                }).then(r => r.json()).then(data => {
                    if (isTestMode) {
                        // Test mode: move on to next slide automatically without showing right/wrong feedback
                        if (currentSlideIdx < totalSlides - 1) {
                            goToSlide(currentSlideIdx + 1);
                        } else {
                            fetch('/api/lesson-progress', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ assignmentId, slideIndex: totalSlides })
                            }).then(() => {
                                window.postMessage({ type: "CLASSLOOP_END_TEST" }, "*");
                                window.location.href = '/student/dashboard';
                            });
                        }
                    } else {
                        // Normal mode: Show right/wrong
                        if (data.correct) {
                            showAppModal('Great Job!', 'Correct! 🎉', () => {
                                if (currentSlideIdx < totalSlides - 1) {
                                    goToSlide(currentSlideIdx + 1);
                                } else {
                                    fetch('/api/lesson-progress', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ assignmentId, slideIndex: totalSlides })
                                    }).then(() => {
                                        window.location.href = '/student/dashboard';
                                    });
                                }
                            });
                        } else {
                            showAppModal('Oops!', 'Incorrect. Take another look or use the AI Help!');
                        }
                    }
                });
            }
            
            function getAiHelp() {
                const responseDiv = document.getElementById('ai-response');
                if (!responseDiv) return;
                responseDiv.innerHTML = '<div class="flex items-center gap-2"><i data-lucide="loader" class="w-3 h-3 animate-spin"></i> Analyzing...</div>';
                responseDiv.classList.remove('hidden');
                
                const selected = document.querySelector('input[name="answer"]:checked');
                const userAnswer = selected ? selected.value : null;

                fetch('/api/ai/lesson-help', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        lessonTitle: lessonTitle, 
                        slideContent: slideData.title + ': ' + slideData.content,
                        question: slideData.question,
                        options: slideData.options,
                        userAnswer: userAnswer
                    })
                }).then(r => r.json()).then(data => {
                    if (data.error) {
                         responseDiv.innerHTML = '<strong>Error:</strong> ' + data.error;
                    } else {
                         responseDiv.innerHTML = '<strong>AI Hint:</strong><br>' + data.result;
                         lucide.createIcons();
                    }
                }).catch(err => {
                    responseDiv.innerHTML = 'Error getting help. Try again.';
                });
            }
        </script>
    `;
    res.send(renderDashboard(content, student));
});

app.post("/api/lesson-progress", express.json(), (req, res) => {
    const { assignmentId, slideIndex } = req.body;
    const progress = Object.values(db.studentProgress).find(p => p.assignmentId === assignmentId);
    if (progress) {
        progress.progress = slideIndex;
    }
    res.json({ success: true });
});

app.post("/api/lesson-answer", express.json(), (req, res) => {
    const { assignmentId, slideIndex, answer } = req.body;
    const assignment = db.assignments[assignmentId];
    if (!assignment) return res.json({ correct: false });
    const lesson = db.lessons[assignment.lessonId];
    if (!lesson) return res.json({ correct: false });
    const slide = lesson.slides[slideIndex];
    if (!slide || !slide.question) return res.json({ correct: false });
    
    // Safely check the answers, supporting both "correctAnswer" and "answer" properties for backward compatibility
    const truth = slide.question.correctAnswer || slide.question.answer || "";
    const userAns = answer || "";
    let isCorrect = userAns.toUpperCase() === truth.toUpperCase();
    
    const studentId = req.session.userId;
    if (studentId) {
        let progress = Object.values(db.studentProgress).find(p => p.studentId === studentId && p.assignmentId === assignmentId);
        if (progress) {
            const existingAnswer = progress.answers.find(a => a.slideIndex === slideIndex);
            if (!existingAnswer) {
                progress.answers.push({ slideIndex, answer, correct: isCorrect });
            } else if (!existingAnswer.correct) {
                // Allows retries, maybe? Depending on logic, let's just record it.
                existingAnswer.answer = answer;
                existingAnswer.correct = isCorrect;
            }
        }
    }

    res.json({ correct: isCorrect });
});

app.post("/api/ai/lesson-help", express.json(), async (req, res) => {
    try {
        const { lessonTitle, slideContent, question, options, userAnswer } = req.body;
        const prompt = `A student is stuck on a lesson. 
Lesson Title: ${lessonTitle}
Content Context: ${slideContent}
Question they are stuck on: ${question} (${options})
User's current guess: ${userAnswer || 'None'}

Provide a 2-3 sentence CONSTRUCTIVE HINT. Do NOT give them the direct answer. Guide their reasoning.`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "qwen-2.5-8b-instruct",
        }).catch(async () => {
            return await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.3-70b-versatile",
            });
        });

        res.json({ result: completion.choices[0].message.content });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- Chat & Student Contact Teacher Routes ---

app.get("/student/research", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const user = db.users[req.session.userId];

    let content = `
        <div class="mb-8 flex items-center justify-between">
            <div class="flex items-center gap-4">
                <a href="/student/dashboard" class="p-2.5 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors"><i data-lucide="arrow-left" class="w-4 h-4 text-zinc-600"></i></a>
                <div>
                    <h1 class="text-2xl font-bold tracking-tight text-zinc-900">Academic Research Center</h1>
                    <p class="text-sm text-zinc-500 mt-0.5">Find scholarly articles, summarize research, and generate MLA citations</p>
                </div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 space-y-6">
                <!-- Search Box -->
                <div class="bg-slate-900 border-2 border-slate-800 shadow-lg rounded-xl p-8 relative overflow-hidden">
                    <div class="relative z-10">
                        <h2 class="text-xl font-bold text-white mb-2 flex items-center gap-2"><i data-lucide="book-open" class="w-5 h-5 text-indigo-300"></i>Scholar Research</h2>
                        <p class="text-slate-300 mb-6 text-sm">Search across millions of peer-reviewed papers, journals, and academic studies.</p>
                        <form id="search-form" class="flex flex-col sm:flex-row gap-3" onsubmit="event.preventDefault(); doResearchSearch();">
                            <input type="text" id="search-query" class="flex-1 p-4 bg-white/10 border border-slate-600 text-white placeholder-slate-400 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter topic, methodology, or authors..." required>
                            <button type="submit" class="px-8 py-4 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-500 transition-colors flex items-center justify-center gap-2 shadow-sm">
                                <i data-lucide="search" class="w-5 h-5"></i> Locate Papers
                            </button>
                        </form>
                    </div>
                    <div class="absolute -bottom-12 -right-10 text-slate-800/50 pointer-events-none">
                        <i data-lucide="graduation-cap" class="w-64 h-64"></i>
                    </div>
                </div>

                <!-- Citations & Summary Box -->
                <div id="ai-summary-box" class="bg-indigo-50 border border-indigo-100 rounded-xl p-6 shadow-sm hidden">
                    <div class="flex items-center gap-2 mb-4">
                        <i data-lucide="sparkles" class="w-5 h-5 text-indigo-600"></i>
                        <h3 class="font-bold text-indigo-900 text-lg">AI Research Synthesis & Citations</h3>
                    </div>
                    <div id="ai-summary-content" class="text-sm text-zinc-800 prose max-w-none"></div>
                </div>

                <!-- Results -->
                <div id="results-container" class="space-y-4"></div>
            </div>

            <!-- AI Sidebar -->
            <div class="lg:col-span-1 space-y-6">
                <!-- Chat with LLM -->
                <div class="bg-white border border-zinc-200 rounded-xl flex flex-col h-[500px] shadow-sm">
                    <div class="p-4 border-b border-zinc-100 bg-zinc-50 rounded-t-xl">
                        <h3 class="font-bold border-zinc-900 text-sm flex items-center gap-2"><i data-lucide="message-circle" class="w-4 h-4"></i> Research Assistant</h3>
                    </div>
                    <div id="chat-messages" class="flex-1 p-4 overflow-y-auto space-y-4 text-sm bg-white">
                        <div class="p-3 bg-zinc-100 rounded-lg text-zinc-800 w-[90%] float-left">Hi! Search for something first, and I can answer specific questions based on the results!</div>
                        <div class="clear-both"></div>
                    </div>
                    <div class="p-3 border-t border-zinc-100 bg-white rounded-b-xl">
                        <form id="chat-form" class="flex gap-2" onsubmit="event.preventDefault(); doResearchChat();">
                            <input type="text" id="chat-input" class="flex-1 p-2 border border-zinc-200 rounded focus:outline-none focus:border-zinc-400" placeholder="Ask about the results..." required disabled>
                            <button type="submit" id="chat-btn" class="p-2 bg-zinc-900 text-white rounded hover:bg-zinc-800 disabled:opacity-50" disabled><i data-lucide="send" class="w-4 h-4"></i></button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
        <script>
            window.cachedResults = [];

            window.doResearchSearch = async function() {
                const q = document.getElementById('search-query').value;
                const resultsContainer = document.getElementById('results-container');
                const summaryBox = document.getElementById('ai-summary-box');
                const summaryContent = document.getElementById('ai-summary-content');
                const chatInput = document.getElementById('chat-input');
                const chatBtn = document.getElementById('chat-btn');

                summaryBox.classList.add('hidden');
                resultsContainer.innerHTML = '<div class="p-8 text-center text-zinc-500"><i data-lucide="loader" class="w-8 h-8 mx-auto mb-2 animate-spin"></i> Locating academic sources...</div>';
                if (window.lucide) window.lucide.createIcons();

                // Call search
                try {
                    const res = await fetch('/api/research/search?q=' + encodeURIComponent(q));
                    const data = await res.json();
                    
                    if (!data.results || data.results.length === 0) {
                        resultsContainer.innerHTML = '<div class="p-8 text-center bg-white border border-zinc-200 rounded-xl">No research papers found for your query. Try different keywords.</div>';
                        return;
                    }

                    window.cachedResults = data.results.slice(0, 5); // take top 5
                    
                    let html = '';
                    window.cachedResults.forEach((r, idx) => {
                        html += '<div class="p-5 bg-white border border-zinc-200 rounded-xl hover:shadow-md transition-shadow">' +
                                '<div class="flex items-center gap-2 mb-1"><span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded uppercase tracking-wider">Research Source</span></div>' +
                                '<a href="' + r.url + '" target="_blank" class="text-blue-600 font-bold text-lg hover:underline">' + r.title + '</a>' +
                                '<div class="text-xs text-green-700 mb-2 truncate">' + r.url + '</div>' +
                                '<p class="text-sm text-zinc-600">' + r.description + '</p>' +
                            '</div>';
                    });
                    resultsContainer.innerHTML = html;

                    // Fetch AI summary using these results
                    summaryBox.classList.remove('hidden');
                    summaryContent.innerHTML = '<div class="p-4 text-center text-indigo-500"><i data-lucide="loader" class="w-5 h-5 mx-auto mb-2 animate-spin"></i> Synthesizing findings and generating citations...</div>';
                    if (window.lucide) window.lucide.createIcons();

                    const aiRes = await fetch('/api/research/summarize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: q, results: window.cachedResults })
                    });
                    const aiData = await aiRes.json();
                    if (aiData.result) {
                        summaryContent.innerHTML = marked.parse(aiData.result);
                        
                        // Enable chat
                        chatInput.disabled = false;
                        chatBtn.disabled = false;
                    } else {
                        summaryContent.innerHTML = 'Failed to generate summary.';
                    }

                } catch (err) {
                    console.error("Search UI Error:", err);
                    resultsContainer.innerHTML = '<div class="p-8 text-center text-red-500 bg-red-50 border border-red-200 rounded-xl">Error executing search.</div>';
                }
            };

            window.doResearchChat = async function() {
                const input = document.getElementById('chat-input');
                const msg = input.value;
                if (!msg.trim()) return;

                const messagesDiv = document.getElementById('chat-messages');

                // User message
                messagesDiv.innerHTML += '<div class="p-3 bg-zinc-900 border border-zinc-800 text-white rounded-lg w-[85%] float-right mb-4 shadow-sm">' + msg + '</div><div class="clear-both"></div>';
                input.value = '';

                // Loading bubble
                const loaderId = 'loader_' + Date.now();
                messagesDiv.innerHTML += '<div id="' + loaderId + '" class="p-3 bg-zinc-100 rounded-lg text-zinc-800 w-[85%] float-left mb-4"><i data-lucide="loader" class="w-3 h-3 inline animate-spin"></i></div><div class="clear-both"></div>';
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                if (window.lucide) window.lucide.createIcons();

                try {
                    const res = await fetch('/api/research/chat', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ message: msg, results: window.cachedResults })
                    });
                    const data = await res.json();
                    
                    document.getElementById(loaderId).remove();

                    messagesDiv.innerHTML += '<div class="p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-900 w-[85%] float-left mb-4 shadow-sm prose prose-sm max-w-none">' + marked.parse(data.reply) + '</div><div class="clear-both"></div>';
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                } catch (err) {
                    console.error("Chat UI error:", err);
                    document.getElementById(loaderId).innerText = "Error: Couldn't connect to AI.";
                }
            };
        </script>
    `;

    res.send(renderDashboard(content, user));
});

app.get("/api/research/search", async (req, res) => {
    try {
        const query = req.query.q;
        if (!query) return res.status(400).json({ error: "Missing query" });

        const searchQuery = query + ' "research paper" OR "study" OR "journal" OR "academic"';
        const searchUrl = "https://search.hackclub.com/res/v1/web/search?q=" + encodeURIComponent(searchQuery);
        const apiKey = process.env.SEARCH_KEY || "";

        const response = await fetch(searchUrl, {
            headers: {
                "Authorization": "Bearer " + apiKey,
                "Content-Type": "application/json"
            }
        });
        
        if (!response.ok) {
            return res.status(response.status).json({ error: "Failed from Hack Club API" });
        }

        const data = await response.json();
        // data structure usually: { results: [{ title, url, description, ... }] }
        
        res.json({ results: data.results || (data.web && data.web.results) || [] });

    } catch (e) {
        console.error("Research error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/research/summarize", express.json(), async (req, res) => {
    try {
        const { query, results } = req.body;
        if (!results || results.length === 0) return res.json({ result: "No results to summarize." });

        let contextText = results.map(r => `Title: ${r.title}\nURL: ${r.url}\nDescription: ${r.description}`).join("\n\n");

        const prompt = `A student is doing research on "${query}". I have the following search results:\n\n${contextText}\n\nPlease provide:\n1. A brief short summary (1-2 paragraphs) synthesizing these scholarly results.\n2. An auto-generated MLA Citation list for these web sources. For MLA citations of websites, do your best with the Title, URL, and assume today's date if date is missing.\n\nPlease format your entire response using Markdown. Use bolding for titles, italics where appropriate, and lists to make the citations clean and easy to read.`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
        }).catch(async (e) => {
            console.error("Fallback to mixtral", e);
            return await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "qwen-2.5-8b-instruct",
            });
        });

        res.json({ result: completion.choices[0].message.content });
    } catch (e) {
        console.error("Summary error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post("/api/research/chat", express.json(), async (req, res) => {
    try {
        const { message, results } = req.body;
        if (!message) return res.status(400).json({ error: "No message provided." });

        let contextText = (results || []).map(r => `Title: ${r.title}\nDescription: ${r.description}`).join("\n\n");

        const prompt = `I am a student researching. Use the following context from my search results to answer my question. If the answer is not in the context, use your general knowledge but state that it wasn't in the provided sources.\n\nSources:\n${contextText}\n\nStudent's Question: ${message}`;

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "llama-3.3-70b-versatile",
        }).catch(async () => {
            return await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "qwen-2.5-8b-instruct",
            });
        });

        res.json({ reply: completion.choices[0].message.content });
    } catch (e) {
        console.error("Chat error:", e);
        res.status(500).json({ error: e.message });
    }
});

// end of new routes

app.get("/student/contact-teacher", (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) return res.redirect("/");
    const user = db.users[req.session.userId];
    const teacherId = db.teachersByCode[user.classCode];
    const teacher = db.users[teacherId] || { name: 'Your Teacher', id: 'unknown', email: 'unknown' };

    let content = `
        <div class="mb-6 flex items-center gap-3">
            <a href="/student/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50 transition-colors">
                <i data-lucide="arrow-left" class="w-4 h-4 text-zinc-600"></i>
            </a>
            <div>
                <h1 class="text-2xl font-bold tracking-tight text-zinc-900">Contact ${teacher.name}</h1>
                <p class="text-sm text-zinc-500 mt-0.5">Live message your teacher.</p>
            </div>
        </div>
        
        <div class="max-w-2xl mx-auto">
            <div class="bg-white app-border rounded-xl p-6 shadow-sm">
               <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Direct Message</h2>
               <div id="chat-container" class="h-64 bg-zinc-50 rounded-lg border border-zinc-100 p-4 overflow-y-auto mb-4 custom-scroll space-y-3">
                   <div class="text-center text-[11px] font-medium text-zinc-400 my-2 uppercase tracking-wider">Chat started</div>
               </div>
               <div class="flex gap-2 relative">
                   <input type="text" id="message-input" placeholder="Message ${teacher.name}..." 
                          class="flex-1 p-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-all">
                   <button onclick="sendChatMessage()" class="px-5 bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors">
                       <i data-lucide="send" class="w-4 h-4"></i>
                   </button>
               </div>
            </div>
        </div>

        <script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
        <script>
            const socket = io();
            const teacherId = '${teacherId}';
            const studentId = '${user.id}';
            
            socket.emit('register', studentId);
            
            function addMessageToUI(sender, text, isSelf) {
                const chatContainer = document.getElementById('chat-container');
                const msgWrap = document.createElement('div');
                msgWrap.className = 'w-full flex ' + (isSelf ? 'justify-end' : 'justify-start');
                
                const msg = document.createElement('div');
                msg.className = 'p-3 rounded-lg text-sm max-w-[80%] ' + 
                                (isSelf ? 'bg-zinc-950 text-white' : 'bg-white border border-zinc-200 text-zinc-800');
                
                if (!isSelf) {
                    msg.innerHTML = '<div class="text-[10px] font-bold opacity-50 mb-1 uppercase">' + sender + '</div>';
                }
                
                msg.appendChild(document.createTextNode(text));
                msgWrap.appendChild(msg);
                
                chatContainer.appendChild(msgWrap);
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }

            socket.on('receive-message', (data) => {
                addMessageToUI(data.from, data.message, false);
            });
            
            function sendChatMessage() {
                const input = document.getElementById('message-input');
                const text = input.value.trim();
                if (!text) return;
                
                socket.emit('send-message', {
                    senderId: studentId,
                    recipientId: teacherId,
                    message: text
                });
                
                addMessageToUI('You', text, true);
                input.value = '';
            }
            
            document.getElementById('message-input').addEventListener('keypress', (e) => {
                if (e.key === 'Enter') sendChatMessage();
            });
        </script>
    `;
    res.send(renderDashboard(content, user));
});

const http = require('http');
const { Server } = require('socket.io');

const port = process.env.PORT || 3000;
const server = http.createServer(app);
const io = new Server(server);

// Connected sockets { userId: socketId }
const connectedUsers = {};

io.on('connection', (socket) => {
    socket.on('register', (userId) => {
        connectedUsers[userId] = socket.id;
    });

    socket.on('send-message', (data) => {
        // student -> teacher
        const { senderId, recipientId, message } = data;
        const senderInfo = db.users[senderId];
        const senderName = senderInfo ? senderInfo.name : 'Student';
        
        const recipientSocket = connectedUsers[recipientId];
        
        db.messages.push({
            senderId: senderId,
            recipientId: recipientId,
            message: message,
            timestamp: Date.now()
        });

        if (recipientSocket) {
            io.to(recipientSocket).emit('receive-message', {
                from: senderName,
                message: message,
                senderId: senderId
            });
        }
    });

    socket.on('teacher-reply', (data) => {
        // teacher -> student. But teacher only knows student's name from the UI currently
        const { senderId, recipientName, message } = data;
        
        // Find the student ID from name (rough approximation, could have duplicates)
        const teacher = db.users[senderId];
        if (!teacher) return;
        
        let recipientId = null;
        for (const uid in db.users) {
            const u = db.users[uid];
            if (u.role === 'student' && u.classCode === teacher.classCode && u.name === recipientName) {
                recipientId = u.id;
                break;
            }
        }
        
        if (recipientId) {
            db.messages.push({
                senderId: senderId,
                recipientId: recipientId,
                message: message,
                timestamp: Date.now()
            });

            const recipientSocket = connectedUsers[recipientId];
            if (recipientSocket) {
                io.to(recipientSocket).emit('receive-message', {
                    from: teacher.name,
                    message: message
                });
            }
        }
    });

    socket.on('disconnect', () => {
        for (const [userId, socketId] of Object.entries(connectedUsers)) {
            if (socketId === socket.id) {
                delete connectedUsers[userId];
                break;
            }
        }
    });
});



app.get('/api/markGuideCompleted', async (req, res) => {
    if (!req.session.userId || !db.users[req.session.userId]) {
        return res.redirect("/student/login");
    }

    const student = db.users[req.session.userId];
    const guideURL = req.query.guideURL;
    let assignment = null;

    if (guideURL) {
        // Find the assignment that has this guide URL and is assigned to the student's class
        assignment = Object.values(db.assignments).find(a => {
            if (a.classCode !== student.classCode) return false;
            const lesson = db.lessons[a.lessonId];
            return lesson && lesson.type === 'guide' && lesson.guideURL === guideURL;
        });

        // If exact match is not found, check if any assigned guides redirect to the provided guideURL
        if (!assignment) {
            const assignedGuides = Object.values(db.assignments).filter(a => {
                if (a.classCode !== student.classCode) return false;
                const lesson = db.lessons[a.lessonId];
                return lesson && lesson.type === 'guide' && lesson.guideURL;
            });

            for (const a of assignedGuides) {
                const lesson = db.lessons[a.lessonId];
                try {
                    // Fetch to resolve redirects and find final destination URL
                    const response = await fetch(lesson.guideURL, { method: 'GET', redirect: 'follow' });
                    const finalUrl = response.url;
                    
                    // Check if the final redirected URL matches the requested guideURL, ignoring trailing slashes
                    if (finalUrl === guideURL || finalUrl.replace(/\/$/, '') === guideURL.replace(/\/$/, '')) {
                        assignment = a;
                        break;
                    }
                } catch (err) {
                    console.error("Error chasing redirects for", lesson.guideURL, err);
                }
            }
        }
    }

    if (!assignment) {
        // Testing fallback: Mark all assigned guides as completed
        const assignedGuides = Object.values(db.assignments).filter(a => {
            if (a.classCode !== student.classCode) return false;
            const lesson = db.lessons[a.lessonId];
            return lesson && lesson.type === 'guide';
        });

        for (const a of assignedGuides) {
            const progressId = student.id + "_" + a.id;
            if (!db.studentProgress[progressId]) {
                db.studentProgress[progressId] = {
                    id: progressId,
                    studentId: student.id,
                    assignmentId: a.id,
                    progress: 100,
                    completed: true,
                    responses: {}
                };
            } else {
                db.studentProgress[progressId].completed = true;
                db.studentProgress[progressId].progress = 100;
            }
        }
        fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));
        return res.redirect("/student/dashboard");
    }

    const progressId = student.id + "_" + assignment.id;
    if (!db.studentProgress[progressId]) {
        db.studentProgress[progressId] = {
            id: progressId,
            studentId: student.id,
            assignmentId: assignment.id,
            progress: 100,
            completed: true,
            responses: {}
        };
    } else {
        db.studentProgress[progressId].completed = true;
        db.studentProgress[progressId].progress = 100;
    }
    
    fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));
    
    return res.redirect("/student/dashboard");
});


server.listen(port, () => console.log(`ClassLoop live at http://localhost:${port}`));
