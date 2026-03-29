const fs = require('fs');

const html = \<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ClassLoop - AI-Powered Shared Classroom OS</title>

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
        <a href="#teacher-view" onclick="document.querySelector('[data-target=teacher-view]').click()" class="hover:text-zinc-950 transition-colors">Teacher Tools</a>
        <a href="#student-view" onclick="document.querySelector('[data-target=student-view]').click()" class="hover:text-zinc-950 transition-colors">Student Experience</a>
      </div>
      <div class="flex gap-2">
        <a href="/student/login" class="bg-zinc-100 text-zinc-900 border border-zinc-200 px-3.5 py-1.5 rounded-md text-[13px] font-medium hover:bg-zinc-200 transition-all">
          Student Login
        </a>
        <a href="/teacher/login" class="bg-zinc-950 text-white px-3.5 py-1.5 rounded-md text-[13px] font-medium hover:bg-zinc-800 transition-all">
          Teacher Login
        </a>
      </div>
    </div>
  </nav>

  <header class="pt-32 pb-12 px-6">
    <div class="max-w-3xl mx-auto text-center">
      <h1 class="text-4xl md:text-5xl font-semibold tracking-tighter text-zinc-950 mb-4 animate-in">
        The AI-Powered OS for Modern Classrooms.
      </h1>
      <p class="text-[17px] text-zinc-500 max-w-xl mx-auto animate-in delay-1 font-normal leading-relaxed">
        Streamline lesson creation, utilize AI-powered grading rubrics and slides, and give your students interactive lessons with AI tutoring built-in.
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
                <a href="/teacher/dashboard" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium bg-white app-border rounded-md shadow-sm"><i data-lucide="layout" class="w-4 h-4 text-zinc-400"></i> Dashboard</a>
                <a href="/teacher/lessons/create" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="file-plus" class="w-4 h-4"></i> Create Lesson</a>
                <a href="/teacher/rubric/create" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="table" class="w-4 h-4"></i> AI Rubric</a>
                <a href="/teacher/email" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="mail" class="w-4 h-4"></i> Mail Summary</a>
                <a href="/teacher/roster" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="users" class="w-4 h-4"></i> Edit Roster</a>
              </nav>
            </div>
            <div class="mt-auto p-3 bg-zinc-950 rounded-lg">
              <div class="text-[10px] font-bold text-zinc-500 uppercase mb-2">Platform Status</div>
              <div class="flex items-center gap-2 text-white text-[11px] font-medium">
                <div class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div> Groq AI Connected
              </div>
            </div>
          </div>

          <div class="flex-1 p-8 overflow-y-auto custom-scroll">
            <div class="grid grid-cols-12 gap-6">
              
              <div class="col-span-12 lg:col-span-8 space-y-8">
                <div>
                  <h3 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Lesson Orchestrator</h3>
                  <div class="p-6 bg-white app-border rounded-xl">
                    <div class="flex items-start justify-between mb-6">
                      <div>
                        <div class="text-sm font-semibold text-zinc-900">Generate Slides Instantly</div>
                        <p class="text-[13px] text-zinc-500 mt-1">Provide a topic/first slide and let AI do the heavy lifting.</p>
                      </div>
                      <div class="px-2 py-1 bg-purple-50 text-purple-700 text-[10px] font-bold rounded border border-purple-100 flex items-center gap-1"><i data-lucide="sparkles" class="w-3 h-3"></i> AI Powered</div>
                    </div>
                    <div class="space-y-2 mb-6">
                      <div class="flex items-center justify-between p-2.5 bg-zinc-50 rounded-md text-[12px] border border-zinc-100">
                        <span class="font-medium">1. Title & Description</span>
                        <span class="text-emerald-500 text-[10px]"><i data-lucide="check-circle" class="w-3.5 h-3.5 inline"></i> Done</span>
                      </div>
                      <div class="flex items-center justify-between p-2.5 bg-zinc-50 rounded-md text-[12px] border border-zinc-100">
                        <span class="font-medium">2. First Slide Context</span>
                        <span class="text-emerald-500 text-[10px]"><i data-lucide="check-circle" class="w-3.5 h-3.5 inline"></i> Done</span>
                      </div>
                    </div>
                    <a href="/teacher/lessons/create" class="block w-full py-2 bg-zinc-950 text-white text-[12px] font-medium text-center rounded-md hover:bg-zinc-800 transition-colors">
                      Generate 3 AI Slides
                    </a>
                  </div>
                </div>

                <div class="p-6 bg-zinc-50 border border-zinc-200 rounded-xl">
                  <div class="flex items-center gap-2 mb-4">
                    <i data-lucide="link" class="w-4 h-4 text-zinc-400"></i>
                    <h3 class="text-sm font-semibold">External Guides</h3>
                  </div>
                  <p class="text-[13px] text-zinc-600 leading-relaxed mb-6">
                    Easily link direct external tasks without disrupting your students' workflow using our Guide assignment type.
                  </p>
                  <a href="/teacher/lessons/create" class="text-[12px] font-semibold text-zinc-950 flex items-center gap-1.5 hover:gap-2 transition-all">
                    Create Guide <i data-lucide="arrow-right" class="w-3.5 h-3.5"></i>
                  </a>
                </div>
              </div>

              <div class="col-span-12 lg:col-span-4 space-y-6">
                <h3 class="text-[13px] font-bold text-zinc-400 uppercase tracking-widest">Teacher-Assist Tools</h3>
                
                <div class="p-4 bg-white app-border rounded-xl space-y-4">
                  <div class="flex items-center gap-2">
                    <i data-lucide="table" class="w-4 h-4 text-zinc-400"></i>
                    <span class="text-[13px] font-semibold">AI Rubrics</span>
                  </div>
                  <p class="text-[11px] text-zinc-500 line-clamp-3">Create grading matrices instantly. Give your assignment name and description to get a markdown table.</p>
                  <a href="/teacher/rubric/create" class="block w-full py-2 border border-zinc-200 text-zinc-950 text-[12px] font-medium text-center rounded-md hover:bg-zinc-50 transition-colors">Create Matrix</a>
                </div>

                <div class="p-4 bg-white app-border rounded-xl space-y-4">
                  <div class="flex items-center gap-2">
                    <i data-lucide="mail" class="w-4 h-4 text-zinc-400"></i>
                    <span class="text-[13px] font-semibold">Inbox Manager</span>
                  </div>
                  <p class="text-[11px] text-zinc-500">Overwhelmed? Let AI read and extract actionable items from your email stream.</p>
                  <a href="/teacher/email" class="block w-full py-2 bg-zinc-100 text-zinc-950 text-[12px] font-medium text-center rounded-md hover:bg-zinc-200 transition-colors">Summarize Inbox</a>
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
                <a href="/student/dashboard" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium bg-white app-border rounded-md shadow-sm"><i data-lucide="layout" class="w-4 h-4 text-zinc-400"></i> Dashboard</a>
                <a href="/student/help" class="flex items-center gap-2.5 px-2 py-1.5 text-[13px] font-medium text-zinc-500 hover:text-zinc-900"><i data-lucide="help-circle" class="w-4 h-4"></i> Support</a>
              </nav>
            </div>
            
            <div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
              <div class="flex items-center gap-2 mb-3">
                <div class="bg-blue-50 p-1.5 rounded-md border border-blue-100"><i data-lucide="check-circle" class="w-4 h-4 text-blue-800"></i></div>
                <h4 class="font-semibold text-gray-900 text-sm">Progress</h4>
              </div>
              <div class="bg-gray-50 rounded-lg p-3 border border-gray-100 mb-2">
                <span class="text-xs font-bold text-gray-900 block mb-1">Industrial Revolution</span>
                <p class="text-[10px] text-gray-500 mb-2 font-light">3 out of 5 slides completed.</p>
                <div class="w-full bg-zinc-200 h-1.5 rounded-full overflow-hidden">
                   <div class="bg-blue-500 h-full w-3/5"></div>
                </div>
              </div>
              <a href="/student/dashboard" class="text-[10px] text-blue-600 font-bold uppercase tracking-wider hover:underline w-full text-center block">Resume</a>
            </div>

            <div class="bg-white rounded-xl app-border shadow-sm p-5">
              <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                  <div class="bg-zinc-100 p-1.5 rounded-md app-border"><i data-lucide="book-open" class="w-4 h-4 text-zinc-700"></i></div>
                  <h4 class="font-semibold text-zinc-900 text-sm">Class News</h4>
                </div>
              </div>
              <div class="p-3 bg-zinc-50 rounded-lg app-border mb-4">
                 <p class="text-[10px] text-zinc-500 line-clamp-2 leading-relaxed">Don't forget to review your assignments before Friday.</p>
              </div>
            </div>
          </div>

          <div class="flex-1 p-8 overflow-y-auto custom-scroll">
             <div class="max-w-2xl mx-auto space-y-6">
                <h2 class="text-xl font-bold text-zinc-900 mb-6">Your Assignments</h2>

                <div class="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                   <div class="flex justify-between items-start mb-3">
                      <div class="flex items-center gap-2">
                         <i data-lucide="notebook" class="w-5 h-5 text-indigo-500"></i>
                         <h3 class="font-bold text-zinc-900">Interactive Lesson</h3>
                      </div>
                      <span class="bg-indigo-50 text-indigo-700 px-2 py-1 text-[10px] font-bold rounded">Active</span>
                   </div>
                   <p class="text-sm text-zinc-600 mb-4">Complete checkpoints as you read through your teacher's slides. You will have an AI tutor helping you.</p>
                   <a href="/student/dashboard" class="bg-zinc-950 text-white text-xs font-semibold px-4 py-2 rounded-md hover:bg-zinc-800 inline-block">Start Lesson</a>
                </div>

                <div class="bg-white border border-zinc-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-all">
                   <div class="flex justify-between items-start mb-3">
                      <div class="flex items-center gap-2">
                         <i data-lucide="compass" class="w-5 h-5 text-blue-500"></i>
                         <h3 class="font-bold text-zinc-900">External Guide</h3>
                      </div>
                      <span class="bg-blue-50 text-blue-700 px-2 py-1 text-[10px] font-bold rounded">Pending</span>
                   </div>
                   <p class="text-sm text-zinc-600 mb-4">Teacher assigned link mapped directly to a trusted site.</p>
                   <a href="/student/dashboard" class="bg-zinc-100 text-zinc-900 border border-zinc-200 text-xs font-semibold px-4 py-2 rounded-md hover:bg-zinc-200 inline-block">Open Resource</a>
                </div>
             </div>
          </div>
        </div>

        <div id="guided-view" class="view-panel hidden flex-1 flex-col bg-white overflow-hidden">
          
          <div class="h-8 bg-zinc-50 border-b border-zinc-100 text-[10px] font-bold text-zinc-600 uppercase tracking-[0.1em] flex items-center justify-center shrink-0">
            Interactive Video Lesson
          </div>

          <div class="flex-1 flex overflow-hidden">
            <div class="flex-[3] p-8 md:p-12 overflow-y-auto custom-scroll relative bg-white">
              
              <div class="max-w-2xl mx-auto pb-20">
                <div class="flex items-center gap-2 mb-6">
                  <span class="px-2 py-1 bg-zinc-100 text-zinc-600 rounded text-[10px] font-bold uppercase tracking-wider">Unit 4</span>
                  <h2 class="text-2xl font-bold text-zinc-950 tracking-tight">The Industrial Revolution</h2>
                </div>

                <div class="w-full aspect-video bg-zinc-950 rounded-xl mb-8 relative overflow-hidden group border border-zinc-200 shadow-sm cursor-pointer">
                  <img src="https://images.unsplash.com/photo-1534398079244-67c8ad691c1b?auto=format&fit=crop&q=80&w=800" class="absolute inset-0 w-full h-full object-cover opacity-70 group-hover:scale-105 group-hover:opacity-50 transition-all duration-700" alt="Video Placeholder">
                  <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
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
                    <i data-lucide="help-circle" class="w-3 h-3"></i> Checkpoint
                  </div>
                  <h3 class="text-[15px] font-bold text-zinc-950 mt-3 mb-5 text-center leading-snug">Based on the text and video, where did most people work before the rise of factories?</h3>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                    <button class="p-3 border border-zinc-200 rounded-lg text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-900 transition-all text-left">In large cities</button>
                    <button class="p-3 border border-zinc-200 rounded-lg text-[13px] font-medium text-zinc-600 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-900 transition-all text-left">On farms / at home</button>
                  </div>
                  <div class="flex items-center justify-between pt-4 border-t border-zinc-100">
                     <button class="text-[12px] font-semibold text-accent flex items-center gap-1.5 hover:underline"><i data-lucide="sparkles" class="w-4 h-4"></i> Get AI Hint</button>
                     <button class="px-5 py-2 bg-zinc-100 text-zinc-400 text-[12px] font-bold rounded-md cursor-not-allowed">Continue</button>
                  </div>
                </div>
              </div>
            </div>

            <div class="w-64 sidebar-bg border-l border-zinc-100 flex flex-col hidden md:flex">
              <div class="p-5 border-b border-zinc-100">
                <div class="flex items-center justify-between mb-4">
                  <div class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Linked Materials</div>
                  <span class="text-[9px] font-bold bg-zinc-200/50 text-zinc-500 px-1.5 py-0.5 rounded">Active</span>
                </div>
                
                <div class="space-y-3">
                  <a href="/student/dashboard" class="flex items-center justify-between p-2.5 bg-white app-border rounded-lg shadow-sm hover:border-zinc-300 transition-all group block">
                    <div class="flex items-center gap-2.5">
                      <div class="bg-blue-50 p-1.5 rounded text-blue-600"><i data-lucide="file-text" class="w-3.5 h-3.5"></i></div>
                      <div>
                        <div class="text-[12px] font-bold text-zinc-900 leading-none">Class Notes</div>
                        <div class="text-[9px] text-zinc-400 font-medium mt-1">Required</div>
                      </div>
                    </div>
                  </a>
                </div>
              </div>

              <div class="p-5">
                <div class="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 flex items-center justify-between">
                  AI Helpers <span class="w-2 h-2 bg-emerald-500 rounded-full"></span>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <button class="p-3 bg-white app-border rounded-xl flex flex-col items-center gap-2 hover:bg-zinc-50 transition-all shadow-sm">
                    <div class="bg-purple-50 text-purple-600 p-2 rounded-lg"><i data-lucide="sparkles" class="w-4 h-4"></i></div>
                    <span class="text-[11px] font-semibold text-zinc-700">Tutor</span>
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
      <div>&copy; 2026 ClassLoop Systems. Built for the modern classroom.</div>
      <div class="flex gap-6 mt-4 md:mt-0 font-medium">
        <a href="/student/login" class="hover:text-zinc-900 transition-colors">Student Demo</a>
        <a href="/teacher/login" class="hover:text-zinc-900 transition-colors">Teacher Demo</a>
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
</html>\;

fs.writeFileSync('frontend/landing.html', html, 'utf8');
console.log('Updated landing HTML');
