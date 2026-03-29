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
            accent: '#E67E22'
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
    .sidebar-bg { background-color: #f9f9f9; }
    
    .tab-active {
      color: #18181b;
      background: #fff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.05), 0 1px 1px rgba(0,0,0,0.02);
      border: 1px solid #e4e4e7;
    }

    .spotlight-area {
      position: relative;
      z-index: 10;
      background: white;
      box-shadow: 0 0 0 8px white, 0 0 0 9999px rgba(9, 9, 11, 0.85);
      border-radius: 4px;
    }
  </style>
</head>
<body class="selection:bg-zinc-200">

  <nav class="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md border-b border-zinc-100">
    <div class="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-2">
        <div class="w-5 h-5 bg-zinc-950 flex items-center justify-center rounded-[3px]">
          <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
        </div>
        <span class="font-medium text-sm tracking-tight">ClassLoop</span>
      </div>
      <div class="hidden md:flex items-center gap-6 text-[13px] font-medium text-zinc-500">
        <a href="#" class="hover:text-zinc-950 transition-colors">Manifesto</a>
        <a href="#" class="hover:text-zinc-950 transition-colors">OS Features</a>
        <a href="#" class="hover:text-zinc-950 transition-colors">Changelog</a>
      </div>
      <div class="flex gap-2">
        <a href="/teacher/login" class="bg-zinc-950 text-white px-3.5 py-1.5 rounded-md text-[13px] font-medium hover:bg-zinc-800 transition-all font-semibold" style="text-decoration:none;">Teacher Login</a>
        <a href="/student/login" class="bg-white border border-zinc-200 text-zinc-900 px-3.5 py-1.5 rounded-md text-[13px] font-medium hover:bg-zinc-50 shadow-sm transition-all font-semibold" style="text-decoration:none;">Student Login</a>
    </div>
    </div>
  </nav>

  <header class="pt-32 pb-12 px-6">
    <div class="max-w-3xl mx-auto text-center">
      <h1 class="text-4xl md:text-5xl font-semibold tracking-tighter text-zinc-950 mb-4 animate-in">
        The OS for the shared classroom.
      </h1>
      <p class="text-[17px] text-zinc-500 max-w-xl mx-auto animate-in delay-1 font-normal leading-relaxed">
        Closing the loop between prep, delivery, and growth. A single system for teachers to automate admin and students to turn feedback into action.
      </p>
    </div>
  </header>

  <section class="pb-24 px-6">
    <div class="max-w-[1100px] mx-auto">
      
      <div class="flex justify-center mb-8 animate-in delay-2 sticky top-20 z-40">
        <div class="bg-zinc-100/80 backdrop-blur-md p-1 rounded-lg inline-flex border border-zinc-200 shadow-sm">
          <button data-target="teacher-view" class="tab-btn active tab-active px-5 py-1.5 rounded-md text-[13px] font-medium transition-all flex items-center gap-2">
            Teacher
          </button>
          <button data-target="student-view" class="tab-btn px-5 py-1.5 rounded-md text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-all flex items-center gap-2">
            Student
          </button>
          <button data-target="guided-view" class="tab-btn px-5 py-1.5 rounded-md text-[13px] font-medium text-zinc-500 hover:text-zinc-900 transition-all flex items-center gap-2">
            Guided Lesson
          </button>
        </div>
      </div>

      <div class="bg-white rounded-xl app-border shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden min-h-[700px] flex flex-col relative animate-in delay-2">
        
        <div class="h-10 border-b border-zinc-100 flex items-center px-4 gap-1.5 bg-zinc-50/50">
          <div class="w-2.5 h-2.5 rounded-full bg-zinc-200"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-zinc-200"></div>
          <div class="w-2.5 h-2.5 rounded-full bg-zinc-200"></div>
          <div class="mx-auto flex items-center gap-1.5 text-[10px] font-medium text-zinc-400 bg-white border border-zinc-200 px-3 py-0.5 rounded shadow-sm">
            <i data-lucide="lock" class="w-2.5 h-2.5"></i> classloop.xyz
          </div>
        </div>

        <div id="teacher-view" class="view-panel flex-1 flex flex-col md:flex-row h-full">
          <div class="w-full md:w-56 sidebar-bg border-r border-zinc-100 p-5 flex flex-col">
            <div class="mb-8">
              <div class="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Command Center</div>
              <nav class="space-y-1">
                <a href="#" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium bg-white app-border rounded-md shadow-sm"><i data-lucide="layout" class="w-4 h-4 text-zinc-400"></i> Radar</a>
                <a href="#" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="calendar" class="w-4 h-4"></i> Bridge</a>
                <a href="#" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="zap" class="w-4 h-4"></i> Assists</a>
              </nav>
            </div>
            <div class="mt-auto p-3 bg-zinc-950 rounded-lg">
              <div class="text-[10px] font-bold text-zinc-500 uppercase mb-2">Sync Status</div>
              <div class="flex items-center gap-2 text-white text-[11px] font-medium">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Canvas Connected
              </div>
            </div>
          </div>

          <div class="flex-1 p-8 overflow-y-auto custom-scroll">
            <div class="grid grid-cols-12 gap-6">
              
              <div class="col-span-12 lg:col-span-8 space-y-8">
                <div>
                  <h3 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">The Curriculum Bridge</h3>
                  <div class="p-6 bg-white app-border rounded-xl">
                    <div class="flex items-start justify-between mb-6">
                      <div>
                        <div class="text-sm font-semibold text-zinc-900">High-Stress Zone Detected</div>
                        <p class="text-[13px] text-zinc-500 mt-1">Cohort 8A has 3 overlapping assessments.</p>
                      </div>
                      <div class="px-2 py-1 bg-red-50 text-red-700 text-[10px] font-bold rounded border border-red-100">Conflict: Oct 14</div>
                    </div>
                    <div class="space-y-2 mb-6">
                      <div class="flex items-center justify-between p-2.5 bg-zinc-50 rounded-md text-[12px] border border-zinc-100">
                        <span class="font-medium">Industrial Rev Essay (History)</span>
                        <span class="text-zinc-400 text-[10px]">Your Class</span>
                      </div>
                      <div class="flex items-center justify-between p-2.5 bg-zinc-50 rounded-md text-[12px] border border-zinc-100">
                        <span class="font-medium">Force & Motion Test (Physics)</span>
                        <span class="text-zinc-400 text-[10px]">Mrs. Davis</span>
                      </div>
                    </div>
                    <button class="w-full py-2 bg-zinc-950 text-white text-[12px] font-medium rounded-md hover:bg-zinc-800 transition-colors">
                      Optimize Team Schedule
                    </button>
                  </div>
                </div>

                <div class="p-6 bg-zinc-50 border border-zinc-200 rounded-xl">
                  <div class="flex items-center gap-2 mb-4">
                    <i data-lucide="repeat" class="w-4 h-4 text-zinc-400"></i>
                    <h3 class="text-sm font-semibold">Cross-Curricular Mapping</h3>
                  </div>
                  <p class="text-[13px] text-zinc-600 leading-relaxed mb-6">
                    English 8 is starting <em>Oliver Twist</em> next week. It aligns with your <strong>Industrial Revolution</strong> unit.
                  </p>
                  <button class="text-[12px] font-semibold text-zinc-950 flex items-center gap-1.5 hover:gap-2 transition-all">
                    Ping Mr. Allen (English) to sync <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                  </button>
                </div>
              </div>

              <div class="col-span-12 lg:col-span-4 space-y-6">
                <h3 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest">Teacher-Assist</h3>
                
                <div class="p-4 bg-white app-border rounded-xl space-y-4">
                  <div class="flex items-center gap-2">
                    <i data-lucide="file-text" class="w-4 h-4 text-zinc-400"></i>
                    <span class="text-[13px] font-semibold">Rubric Generator</span>
                  </div>
                  <textarea class="w-full p-3 bg-zinc-50 border border-zinc-100 rounded-lg text-[12px] focus:outline-none focus:ring-1 focus:ring-zinc-200 resize-none h-24" placeholder="Standard-aligned prompt..."></textarea>
                  <button class="w-full py-2 border border-zinc-200 text-zinc-950 text-[12px] font-medium rounded-md hover:bg-zinc-50 transition-colors">Create Matrix</button>
                </div>

                <div class="p-4 bg-white app-border rounded-xl space-y-4">
                  <div class="flex items-center gap-2">
                    <i data-lucide="layers" class="w-4 h-4 text-zinc-400"></i>
                    <span class="text-[13px] font-semibold">Differentiation</span>
                  </div>
                  <div class="flex gap-1">
                    <span class="flex-1 py-1.5 bg-zinc-100 text-zinc-600 text-[10px] font-bold text-center rounded">Remedial</span>
                    <span class="flex-1 py-1.5 bg-zinc-950 text-white text-[10px] font-bold text-center rounded">Standard</span>
                    <span class="flex-1 py-1.5 bg-zinc-100 text-zinc-600 text-[10px] font-bold text-center rounded">Adv</span>
                  </div>
                  <button class="w-full py-2 bg-zinc-100 text-zinc-950 text-[12px] font-medium rounded-md hover:bg-zinc-200 transition-colors">Rewrite Passage</button>
                </div>
              </div>

            </div>
          </div>
        </div>

        <div id="student-view" class="view-panel hidden flex-1 flex flex-col md:flex-row h-full">
          <div class="w-full md:w-56 sidebar-bg border-r border-zinc-100 p-5 flex flex-col">
            <div class="mb-8">
              <div class="text-[11px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Workspace</div>
              <nav class="space-y-1">
                <a href="#" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium bg-white app-border rounded-md shadow-sm"><i data-lucide="map" class="w-4 h-4 text-zinc-400"></i> Growth Map</a>
                <a href="#" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="check-circle" class="w-4 h-4"></i> Redo List</a>
                <a href="#" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="search" class="w-4 h-4"></i> Research</a>
              </nav>
            </div>
            
            <div class="bg-white rounded-xl border border-gray-100 shadow-subtle p-5 mb-6">
              <div class="flex items-center gap-2 mb-4">
                <div class="bg-indigo-50 p-1.5 rounded-md border border-indigo-100"><i data-lucide="users" class="w-4 h-4 text-indigo-800"></i></div>
                <h4 class="font-semibold text-gray-900 text-sm">Study Group Finder</h4>
              </div>
              <div class="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-3">
                <div class="flex justify-between items-start mb-1">
                  <span class="text-xs font-bold text-gray-900">Physics Chapter 4</span>
                  <span class="flex items-center gap-1 text-[10px] text-indigo-600 font-bold"><span class="w-1.5 h-1.5 bg-indigo-500 rounded-full"></span> 3 Online</span>
                </div>
                <p class="text-[10px] text-gray-500 mb-2 font-light">Discussing friction formulas.</p>
                <button class="w-full bg-white border border-gray-200 text-gray-700 text-xs font-semibold py-1.5 rounded hover:bg-gray-50 flex items-center justify-center gap-1.5 transition-colors">
                  <i data-lucide="layout" class="w-3 h-3"></i> Open Workspace
                </button>
              </div>
              <button class="text-[10px] text-indigo-600 font-bold uppercase tracking-wider hover:underline w-full text-center">Find groups</button>
            </div>

            <div class="bg-white rounded-xl app-border shadow-subtle p-5">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                  <div class="bg-zinc-100 p-1.5 rounded-md app-border"><i data-lucide="folder-kanban" class="w-4 h-4 text-zinc-700"></i></div>
                  <h4 class="font-semibold text-zinc-900 text-sm">Research Notes</h4>
                </div>
                <button class="text-[10px] font-bold text-zinc-400 hover:text-zinc-900 transition-colors uppercase tracking-widest"><i data-lucide="maximize-2" class="w-3.5 h-3.5"></i></button>
              </div>
              
              <div class="space-y-3 mb-4">
                <div class="p-3 bg-zinc-50 rounded-lg app-border hover:border-zinc-300 transition-colors cursor-pointer group">
                  <div class="flex justify-between items-start mb-1.5">
                     <span class="text-[11px] font-bold text-zinc-900 flex items-center gap-1.5"><i data-lucide="link" class="w-3 h-3 text-accent"></i> PBS: Industrial Age</span>
                     <span class="text-[9px] text-zinc-400 font-medium bg-white px-1.5 py-0.5 rounded border border-zinc-200 shadow-sm">Source A</span>
                  </div>
                  <p class="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed">Includes primary accounts of factory workers and timelines of technological advancements.</p>
                </div>

                <div class="p-3 bg-zinc-50 rounded-lg app-border hover:border-zinc-300 transition-colors cursor-pointer group">
                  <div class="flex justify-between items-start mb-1.5">
                     <span class="text-[11px] font-bold text-zinc-900 flex items-center gap-1.5"><i data-lucide="file-text" class="w-3 h-3 text-blue-500"></i> Factory Act 1833</span>
                     <span class="text-[9px] text-zinc-400 font-medium bg-white px-1.5 py-0.5 rounded border border-zinc-200 shadow-sm">PDF</span>
                  </div>
                  <p class="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed">Annotated pages 4-6 for the upcoming essay.</p>
                </div>
              </div>

              <button class="w-full border border-dashed border-zinc-200 text-zinc-500 text-[12px] font-medium py-2 rounded hover:bg-zinc-50 hover:text-zinc-900 transition-colors flex items-center justify-center gap-1.5">
                <i data-lucide="plus" class="w-3.5 h-3.5"></i> New Source Note
              </button>
            </div>

          </div>
        </div>

        <div id="guided-view" class="view-panel hidden flex-1 flex-col bg-white overflow-hidden">
          
          <div class="h-8 bg-red-50/80 border-b border-red-100 text-[10px] font-bold text-red-600 uppercase tracking-[0.1em] flex items-center justify-center shrink-0">
            <i data-lucide="lock" class="w-3 h-3 mr-1.5"></i> Focus Lock Active: Lesson Pauses if Tab Changes
          </div>

          <div class="flex-1 flex overflow-hidden">
            <div class="flex-[3] p-8 md:p-12 overflow-y-auto custom-scroll relative bg-white">
              
              <div class="max-w-2xl mx-auto pb-20">
                <div class="flex items-center gap-2 mb-6">
                  <span class="px-2 py-1 bg-zinc-100 text-zinc-600 rounded text-[10px] font-bold uppercase tracking-wider">Unit 4</span>
                  <h2 class="text-2xl font-bold text-zinc-950 tracking-tight">The Industrial Revolution</h2>
                </div>

                <div class="w-full aspect-video bg-zinc-950 rounded-xl mb-8 relative overflow-hidden group border border-zinc-200 shadow-sm cursor-pointer">
                  <img src="https://images.unsplash.com/photo-1534398079244-67c8ad691c1b?auto=format&fit=crop&q=80&w=800" class="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 group-hover:opacity-50 transition-all duration-700">
                  <div class="absolute inset-0 flex items-center justify-center">
                    <div class="w-14 h-14 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 group-hover:bg-white/30 transition-colors shadow-lg animate-in delay-1">
                      <i data-lucide="play" class="w-6 h-6 text-white fill-white ml-1"></i>
                    </div>
                  </div>
                  <div class="absolute bottom-4 left-4 flex items-center gap-2">
                    <span class="bg-black/60 backdrop-blur text-white text-[11px] font-semibold px-2.5 py-1 rounded">03:45</span>
                    <span class="bg-accent/90 backdrop-blur text-white text-[11px] font-semibold px-2.5 py-1 rounded flex items-center gap-1.5"><i data-lucide="eye" class="w-3.5 h-3.5"></i> Teacher Assigned</span>
                  </div>
                </div>

                <p class="text-[15px] text-zinc-600 leading-relaxed mb-6 font-light">
                  The transition from creating goods by hand to using machines was a pivotal moment in history. It altered not only the economy but also the social fabric of the time. Before this era, most people resided in small, rural communities where their daily existences revolved around farming.
                </p>

                <div class="relative bg-zinc-50 border-l-2 border-accent p-5 rounded-r-xl mb-12">
                  <div class="absolute -right-3 -top-3 w-7 h-7 bg-accent rounded-full flex items-center justify-center shadow-md animate-bounce">
                    <i data-lucide="mouse-pointer-2" class="w-3.5 h-3.5 text-white"></i>
                  </div>
                  <div class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <i data-lucide="video" class="w-3 h-3"></i> Teacher Spotlight
                  </div>
                  <p class="text-[14px] text-zinc-900 font-medium leading-relaxed">
                    Factories centralized production, meaning workers had to leave their homes to work in massive, highly structured environments for the very first time.
                  </p>
                </div>

                <div class="relative border border-zinc-200 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] p-6 z-10 animate-in delay-2">
                  <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-zinc-950 text-white text-[10px] font-bold uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                    <i data-lucide="hand" class="w-3 h-3"></i> Checkpoint
                  </div>
                  <h3 class="text-[15px] font-bold text-zinc-950 mt-3 mb-5 text-center leading-snug">Based on the text and video, where did most people work before the rise of factories?</h3>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                    <button class="p-3 border border-zinc-200 rounded-lg text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-900 transition-all text-left">In large cities</button>
                    <button class="p-3 border border-zinc-200 rounded-lg text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-900 transition-all text-left">On farms / at home</button>
                  </div>
                  <div class="flex items-center justify-between pt-4 border-t border-zinc-100">
                     <button class="text-[12px] font-semibold text-accent flex items-center gap-1.5 hover:underline"><i data-lucide="play-circle" class="w-4 h-4"></i> Teacher Audio Hint</button>
                     <button class="px-5 py-2 bg-zinc-100 text-zinc-400 text-[12px] font-bold rounded-md cursor-not-allowed">Continue Scroll</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="w-64 sidebar-bg border-l border-zinc-100 flex flex-col hidden md:flex">
              <div class="p-5 border-b border-zinc-100">
                <div class="flex items-center justify-between mb-4">
                  <div class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Unified Resources</div>
                  <span class="text-[9px] font-bold bg-zinc-200/50 text-zinc-500 px-1.5 py-0.5 rounded">Active</span>
                </div>
                
                <div class="space-y-3">
                  <div class="p-[2px] bg-gradient-to-b from-zinc-200 to-zinc-50 rounded-xl">
                    <div class="bg-white rounded-[10px] p-3 shadow-sm cursor-pointer hover:shadow-md transition-all group relative overflow-hidden">
                      <div class="absolute top-0 left-0 w-1 h-full bg-accent"></div>
                      <div class="flex items-start justify-between mb-1 pl-2">
                        <div class="flex items-center gap-2">
                          <div class="bg-blue-50 p-1.5 rounded text-blue-600"><i data-lucide="file-edit" class="w-3.5 h-3.5"></i></div>
                          <div>
                            <div class="text-[12px] font-bold text-zinc-900 leading-none">Guided Notes</div>
                            <div class="text-[9px] text-zinc-400 font-medium mt-1">Split-pane view</div>
                          </div>
                        </div>
                        <div class="bg-zinc-100 p-1 rounded text-zinc-500 group-hover:bg-zinc-200 transition-colors">
                          <i data-lucide="panel-right-open" class="w-3.5 h-3.5"></i>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center justify-between p-2.5 bg-white app-border rounded-lg shadow-sm cursor-pointer hover:border-zinc-300 transition-all group">
                    <div class="flex items-center gap-2.5">
                      <div class="bg-orange-50 p-1.5 rounded text-orange-600"><i data-lucide="globe" class="w-3.5 h-3.5"></i></div>
                      <div>
                        <div class="text-[12px] font-semibold text-zinc-800">PBS Archive</div>
                        <div class="text-[10px] text-zinc-400">Reference Link</div>
                      </div>
                    </div>
                    <i data-lucide="external-link" class="w-3 h-3 text-zinc-300 group-hover:text-zinc-600"></i>
                  </div>
                </div>
              </div>

              <div class="p-5">
                <div class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                  Teacher Assistants <span class="w-2 h-2 bg-emerald-500 rounded-full"></span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <button class="p-3 bg-white app-border rounded-xl flex flex-col items-center gap-2 hover:bg-zinc-50 transition-all shadow-sm">
                    <div class="bg-indigo-50 text-indigo-600 p-2 rounded-lg"><i data-lucide="book-open" class="w-4 h-4"></i></div>
                    <span class="text-[11px] font-semibold text-zinc-700">Vocab</span>
                  </button>
                  <button class="p-3 bg-white app-border rounded-xl flex flex-col items-center gap-2 hover:bg-zinc-50 transition-all shadow-sm">
                    <div class="bg-emerald-50 text-emerald-600 p-2 rounded-lg"><i data-lucide="lightbulb" class="w-4 h-4"></i></div>
                    <span class="text-[11px] font-semibold text-zinc-700">Hints</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <footer class="py-12 border-t border-zinc-100">
    <div class="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-[12px] text-zinc-400">
      <div>&copy; 2024 ClassLoop Systems. Built for the future of EdTech.</div>
      <div class="flex gap-6 mt-4 md:mt-0 font-medium">
        <a href="#" class="hover:text-zinc-900 transition-colors">Privacy</a>
        <a href="#" class="hover:text-zinc-900 transition-colors">Terms</a>
        <a href="#" class="hover:text-zinc-900 transition-colors">Contact</a>
      </div>
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

          tabs.forEach(t => {
            t.classList.remove('active', 'tab-active');
            t.classList.add('text-zinc-500');
          });

          tab.classList.add('active', 'tab-active');
          tab.classList.remove('text-zinc-500');

          views.forEach(v => {
            v.classList.add('hidden');
          });

          const activeView = document.getElementById(targetId);
          if (activeView) {
            activeView.classList.remove('hidden');
          }
        });
      });
    });
    
    // Auto-login restoration
    if (window.location.search.includes('cleartoken=1')) {
        localStorage.removeItem('classloop_login_token');
        window.history.replaceState({}, document.title, window.location.pathname);
    } else {
        const token = localStorage.getItem('classloop_login_token');
        if (token) {
            window.location.href = '/api/auth/restore?token=' + encodeURIComponent(token);
        }
    }
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

                                if (lesson.type === 'guide') {
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

                                if (lesson.type === 'guide') {
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
            const totalQuestions = lesson.slides.filter(slide => slide.question).length;
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
                    const tq = l.slides.filter(s => s.question).length;
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
                model: "mixtral-8x7b-32768",
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
                 model: "mixtral-8x7b-32768",
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
                 model: "mixtral-8x7b-32768",
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

app.get("/student/lesson/:assignmentId", (req, res) => {
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
    
    let content = `
        <div class="mb-4 flex items-center justify-between">
            <a href="/student/dashboard" class="p-2 bg-white app-border rounded-lg hover:bg-zinc-50">
                <i data-lucide="arrow-left" class="w-4 h-4"></i>
            </a>
            <h1 class="text-xl font-bold text-zinc-900 flex-1 ml-4">${lesson.title}</h1>
            <div class="flex items-center gap-2 text-sm font-medium text-zinc-500">
                <div class="w-32 h-2 bg-zinc-200 rounded-full overflow-hidden">
                    <div class="h-full bg-accent transition-all" style="width: ${((currentSlideIdx) / totalSlides * 100)}%"></div>
                </div>
                <span>${currentSlideIdx + 1} of ${totalSlides}</span>
            </div>
        </div>
        
        <div class="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 bg-white app-border rounded-xl p-8 shadow-sm">
                <h2 class="text-2xl font-bold text-zinc-950 mb-6">${currentSlide.title || 'Content'}</h2>
                <div class="prose prose-sm max-w-none text-zinc-700 mb-8">
                    ${(currentSlide.content || '').replace(/\n/g, '<br>')}
                </div>
                
                ${hasQuestion ? `
                    <div class="mt-8 p-6 bg-zinc-50 border border-zinc-200 rounded-xl">
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
        </div>
        
        <div class="max-w-4xl mx-auto mt-8 flex gap-3 justify-between">
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
                    ${currentSlideIdx === totalSlides - 1 ? 'Finish Lesson' : 'Next →'}
                </button>
            `}
        </div>
        
        <script>
            const assignmentId = '${req.params.assignmentId}';
            const totalSlides = ${totalSlides};
            let currentSlideIdx = ${currentSlideIdx};
            
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
                });
            }
            
            function getAiHelp() {
                const responseDiv = document.getElementById('ai-response');
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



app.post('/api/markGuideCompleted', express.json(), (req, res) => {
    const { guideURL } = req.body;
    
    if (!req.session.userId || !db.users[req.session.userId]) {
        return res.status(401).json({ error: "Please log in first", redirect: "/student/login" });
    }

    const student = db.users[req.session.userId];

    // Find the assignment that has this guide URL and is assigned to the student's class
    const assignment = Object.values(db.assignments).find(a => {
        if (a.classCode !== student.classCode) return false;
        const lesson = db.lessons[a.lessonId];
        return lesson && lesson.type === 'guide' && lesson.guideURL === guideURL;
    });

    if (!assignment) {
        return res.status(403).json({ error: "This Account does not have this Guide assigned." });
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
    
    return res.status(200).json({ success: true, redirect: "/student/dashboard" });
});


server.listen(port, () => console.log(`ClassLoop live at http://localhost:${port}`));