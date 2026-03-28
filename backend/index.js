require('dotenv').config();
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_KEY });
const express = require("express");
const session = require("express-session");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

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

// --- In-Memory DB ---
const db = {
    users: {}, // googleId -> { id, role, name, email, picture, classCode }
    teachersByCode: {} // code -> googleId
};
function generateCode() { return Math.random().toString(36).substring(2, 8).toUpperCase(); }

// --- OAuth Setup ---
const credentialsPath = path.join(__dirname, "credentials.json");
const rawCredentials = JSON.parse(fs.readFileSync(credentialsPath, "utf8"));
const oauthConfig = rawCredentials.web || rawCredentials.installed;

const configuredRedirectUri = (oauthConfig.redirect_uris || [])[0] || `http://localhost:${envPort || fallbackPort}/auth/google/callback`;

function createOAuthClient() {
    return new google.auth.OAuth2(oauthConfig.client_id, oauthConfig.client_secret, configuredRedirectUri);
}

function getAuthedOAuthClient(req) {
    if (!req.session.tokens) return null;
    const client = createOAuthClient();
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
        return {
            id: m.id,
            from: (headers.find(h => h.name === "From")?.value || "Unknown").split('<')[0].trim(),
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
            <a href="/logout" class="text-[13px] font-medium text-zinc-500 hover:text-red-600 transition-colors">Sign Out</a>
        </div>
    ` : `<a href="/logout" class="text-[13px] font-medium text-zinc-500 hover:text-red-600 transition-colors">Sign Out</a>`;

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
</body>
</html>`;
}

// --- Routes ---

app.get("/", (req, res) => {
    res.send(renderLandingPage());
});

app.get("/student/login", (req, res) => {
    const url = createOAuthClient().generateAuthUrl({
        access_type: "offline",
        scope: ["openid", "email", "profile"],
        prompt: "consent",
        state: "student"
    });
    res.redirect(url);
});

app.get("/teacher/login", (req, res) => {
    const url = createOAuthClient().generateAuthUrl({
        access_type: "offline",
        scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send", "openid", "email", "profile"],
        prompt: "consent",
        state: "teacher"
    });
    res.redirect(url);
});

app.get("/auth/google/callback", async (req, res) => {
    const { code, state } = req.query;
    try {
        const client = createOAuthClient();
        const { tokens } = await client.getToken(code);
        client.setCredentials(tokens);
        
        const oauth2 = google.oauth2({ version: 'v2', auth: client });
        const userInfo = await oauth2.userinfo.get();
        const profile = userInfo.data;
        const userId = profile.id;

        let user = db.users[userId];
        if (!user) {
            user = {
                id: userId,
                role: state || 'student',
                name: profile.name,
                email: profile.email,
                picture: profile.picture,
                classCode: state === 'teacher' ? generateCode() : null
            };
            db.users[userId] = user;
            if (state === 'teacher') {
                db.teachersByCode[user.classCode] = userId;
            }
        }
        
        req.session.tokens = tokens;
        req.session.userId = userId;

        if (user.role === 'teacher') res.redirect("/teacher/dashboard");
        else res.redirect("/student/dashboard");
    } catch (e) { res.status(500).send("Auth failed: " + e.message); }
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

    const content = `
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
                        <div class="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer group">
                            <div class="flex items-center gap-3">
                                <div class="p-2 bg-orange-100 text-accent rounded-md group-hover:scale-110 transition-transform"><i data-lucide="book-open" class="w-4 h-4"></i></div>
                                <div>
                                    <div class="font-bold text-sm text-zinc-900">The Industrial Revolution</div>
                                    <div class="text-[11px] font-medium text-zinc-500 mt-0.5">History &bull; Due Friday</div>
                                </div>
                            </div>
                            <button class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100">Resume</button>
                        </div>
                        <div class="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-100 rounded-lg hover:border-zinc-300 transition-colors cursor-pointer group">
                            <div class="flex items-center gap-3">
                                <div class="p-2 bg-blue-100 text-blue-600 rounded-md group-hover:scale-110 transition-transform"><i data-lucide="pen-tool" class="w-4 h-4"></i></div>
                                <div>
                                    <div class="font-bold text-sm text-zinc-900">Forces & Motion Essay</div>
                                    <div class="text-[11px] font-medium text-zinc-500 mt-0.5">Physics &bull; Due Next Week</div>
                                </div>
                            </div>
                            <button class="px-3 py-1.5 bg-white border border-zinc-200 text-xs font-semibold rounded shadow-sm hover:bg-zinc-100">Start</button>
                        </div>
                    </div>
                </div>

                <div class="bg-white app-border rounded-xl p-6 shadow-sm">
                   <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Teacher Chat</h2>
                   <div class="h-48 bg-zinc-50 rounded-lg border border-zinc-100 p-4 overflow-y-auto mb-4 custom-scroll">
                       <div class="text-center text-[11px] font-medium text-zinc-400 my-2 uppercase tracking-wider">Conversation started</div>
                   </div>
                   <div class="flex gap-2">
                       <input type="text" placeholder="Message ${teacher.name}..." class="flex-1 p-3 text-sm border border-zinc-200 rounded-lg focus:outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-all">
                       <button class="px-5 bg-zinc-950 text-white rounded-lg hover:bg-zinc-800 transition-colors"><i data-lucide="send" class="w-4 h-4"></i></button>
                   </div>
                </div>
            </div>

            <div class="col-span-12 lg:col-span-4 space-y-6">
                <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-8 text-center relative overflow-hidden">
                    <div class="absolute -right-4 -top-4 w-24 h-24 bg-indigo-200/50 rounded-full blur-2xl"></div>
                    <i data-lucide="life-buoy" class="w-10 h-10 text-indigo-500 mx-auto mb-4 relative z-10"></i>
                    <h3 class="text-lg font-bold text-indigo-950 mb-2 relative z-10">Stuck on a concept?</h3>
                    <p class="text-[13px] text-indigo-800 mb-6 relative z-10 leading-relaxed">Don't stay blocked. Access AI tools, peer networks, and your teacher to overcome roadblocks.</p>
                    <a href="/student/help" class="block w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg relative z-10">
                        Get Help Now
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
            <button class="p-6 bg-white app-border rounded-xl text-left hover:shadow-lg hover:-translate-y-1 transition-all group flex flex-col h-full">
                <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-5"><i data-lucide="users" class="w-6 h-6"></i></div>
                <h3 class="font-bold text-lg text-zinc-900 mb-2">Find Study Group</h3>
                <p class="text-[13px] text-zinc-500 leading-relaxed flex-1">Connect with peers working on the same topics. Join a live voice or text channel.</p>
            </button>
            
            <button class="p-6 bg-white app-border rounded-xl text-left hover:shadow-lg hover:-translate-y-1 transition-all group flex flex-col h-full">
                <div class="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-5"><i data-lucide="sparkles" class="w-6 h-6"></i></div>
                <h3 class="font-bold text-lg text-zinc-900 mb-2">Get AI Help</h3>
                <p class="text-[13px] text-zinc-500 leading-relaxed flex-1">Ask the ClassLoop assistant to explain concepts simply or check your work.</p>
            </button>

            <button class="p-6 bg-white app-border rounded-xl text-left hover:shadow-lg hover:-translate-y-1 transition-all group flex flex-col h-full">
                <div class="w-12 h-12 bg-green-50 text-green-600 rounded-xl flex items-center justify-center mb-5"><i data-lucide="message-square" class="w-6 h-6"></i></div>
                <h3 class="font-bold text-lg text-zinc-900 mb-2">Contact Teacher</h3>
                <p class="text-[13px] text-zinc-500 leading-relaxed flex-1">Send a direct priority message to your instructor for specific clarifications.</p>
            </button>
        </div>
    `;
    res.send(renderDashboard(content, user));
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
                <div class="flex items-center justify-between mt-2">
                    <div class="text-3xl font-mono font-bold tracking-[0.2em] text-zinc-900">${user.classCode}</div>
                    <button class="p-2 bg-zinc-50 text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors" title="Copy Code"><i data-lucide="copy" class="w-4 h-4"></i></button>
                </div>
                <div class="text-[10px] text-zinc-500 mt-2">Share this securely with your students.</div>
            </div>
        </div>

        <div class="grid grid-cols-12 gap-8">
            <div class="col-span-12 lg:col-span-8">
                <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Command Center</h2>
                <div class="grid grid-cols-2 gap-4">
                    <a href="/teacher/roster" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                        <div class="p-2 bg-orange-50 text-accent rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="users" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Class Roster</div>
                    </a>
                    <a href="/teacher/email" class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group block" style="text-decoration:none; color:inherit;">
                        <div class="p-2 bg-green-50 text-green-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="mail-open" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Email Contacts</div>
                    </a>
                    <button class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group">
                        <div class="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="sparkles" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Lesson Generator</div>
                    </button>
                    <button class="p-5 bg-white app-border rounded-xl flex flex-col items-start gap-3 hover:shadow-md transition-all group">
                        <div class="p-2 bg-purple-50 text-purple-600 rounded-lg group-hover:scale-110 transition-transform"><i data-lucide="scroll-text" class="w-5 h-5"></i></div>
                        <div class="text-left font-bold text-sm">Rubric Creator</div>
                    </button>
                </div>
            </div>

            <div class="col-span-12 lg:col-span-4">
                <h2 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">Inbox Stream <a href="/teacher/email" class="text-[10px] text-accent hover:underline">View All</a></h2>
                <div class="bg-white app-border rounded-xl overflow-hidden shadow-sm max-h-[350px] overflow-y-auto custom-scroll">
                    ${emailHtml}
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

    const studentCards = students.map(s => {
        // Randomly assign online status for visual demonstration
        const isOnline = Math.random() > 0.5;
        const statusColor = isOnline ? 'bg-green-500' : 'bg-zinc-300';
        const statusText = isOnline ? 'Online' : 'Offline';

        return `
        <div class="p-5 bg-white app-border rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:shadow-md transition-shadow">
            <div class="flex items-center gap-4">
                <div class="relative">
                    <img src="${s.picture || 'https://via.placeholder.com/150'}" alt="${s.name}" class="w-12 h-12 rounded-full border border-zinc-200 object-cover">
                    <div class="absolute bottom-0 right-0 w-3.5 h-3.5 ${statusColor} border-2 border-white rounded-full" title="${statusText}"></div>
                </div>
                <div>
                    <div class="font-bold text-zinc-900">${s.name}</div>
                    <div class="text-xs text-zinc-500">${s.email} &bull; ${statusText}</div>
                </div>
            </div>
            
            <div class="flex items-center gap-2">
                <button class="px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5">
                    <i data-lucide="book-open" class="w-3.5 h-3.5"></i> Assign
                </button>
                <button class="px-3 py-1.5 bg-zinc-100 text-zinc-700 text-xs font-semibold rounded-lg hover:bg-zinc-200 transition-colors flex items-center gap-1.5">
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

    const content = `
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
            </div>
            <div class="font-semibold text-zinc-800 text-sm mb-1">${e.subject.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
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
                
                document.getElementById('ev-subject').innerText = subject;
                document.getElementById('ev-from').innerText = "From: " + from;
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
                
                try {
                    const res = await fetch('/api/ai/email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action, content: body })
                    });
                    const data = await res.json();
                    if (data.error) throw new Error(data.error);
                    
                    outputDiv.innerHTML = '<div class="font-bold text-xs uppercase text-zinc-500 mb-2">' + (action === 'summarize' ? 'AI Summary' : 'AI Suggested Draft') + '</div>' + data.result;
                } catch (err) {
                    outputDiv.innerHTML = '<div class="text-red-500">Error: ' + err.message + '</div>';
                }
            }
        </script>
    `;
    res.send(renderDashboard(content));
});

app.post("/api/ai/email", express.json(), async (req, res) => {
    try {
        const { action, content } = req.body;
        if (!content) return res.status(400).json({ error: "Missing content" });

        let prompt = "";
        if (action === "summarize") {
            prompt = "Summarize the following student/parent email concisely in 1-3 bullet points:\\n\\n" + content;
        } else if (action === "draft") {
            prompt = "Write a polite, professional, and helpful reply to the following email from a teacher's perspective.\\n\\nEmail: " + content;
        } else {
            return res.status(400).json({ error: "Invalid action" });
        }

        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "qwen-2.5-8b-instruct",
        }).catch(async err => {
            return await groq.chat.completions.create({
                messages: [{ role: "user", content: prompt }],
                model: "llama-3.3-70b-versatile",
            });
        });

        res.json({ result: completion.choices[0].message.content });
    } catch (e) {
        console.error("Groq Error:", e);
        res.status(500).json({ error: e.message });
    }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`ClassLoop live at http://localhost:${port}`));