"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Settings, 
  Play, 
  ArrowRight, 
  Check, 
  AlertTriangle, 
  Server, 
  X, 
  ExternalLink, 
  ShieldAlert, 
  CheckCircle2, 
  Wallet, 
  ChevronDown, 
  ChevronUp,
  FileCode,
  Folder,
  Terminal,
  Shield,
  CreditCard,
  CheckSquare,
  FileText,
  RotateCcw,
  RefreshCw,
  Loader2,
  User,
  LogOut,
  Lock,
  Zap,
  UserCheck
} from 'lucide-react';

import { 
  MOCK_REPOS, 
  MOCK_FILE_TREE, 
  SCAN_LOGS, 
  NORMAL_FINDINGS, 
  LOW_CONFIDENCE_FINDINGS, 
  PROPOSALS as MOCK_PROPOSALS, 
  RULES_CHECKS as MOCK_RULES_CHECKS,
  FileNode,
  Finding,
  ProposalPlan,
  RuleCheck
} from '@/components/mockData';

import ConfidenceBadge from '@/components/ConfidenceBadge';
import CodeViewerModal from '@/components/CodeViewerModal';

// Hardcoded files from demo-repo for "View in code" functionality
const DEMO_REPO_FILES: Record<string, { fileName: string; content: string }> = {
  "package.json": {
    fileName: "package.json",
    content: `{
  "name": "quicktalk",
  "version": "1.0.0",
  "description": "Team chat app with rooms, avatars and message history",
  "main": "server.js",
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "start": "node server.js",
    "migrate": "node db/migrate.js"
  },
  "dependencies": {
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "multer": "^1.4.5-lts.1",
    "pg": "^8.11.5",
    "socket.io": "^4.7.5"
  }
}`
  },
  "server.js": {
    fileName: "server.js",
    content: `require("dotenv").config();
const http = require("http");
const express = require("express");
const { Server } = require("socket.io");
const { pool } = require("./db/pool");
const profileRoutes = require("./routes/profile");
const messageRoutes = require("./routes/messages");

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/api/profile", profileRoutes);
app.use("/api/messages", messageRoutes);

io.on("connection", (socket) => {
  socket.on("join-room", async (roomId) => {
    socket.join(roomId);
    const { rows } = await pool.query(
      "SELECT sender, body, created_at FROM messages WHERE room_id = $1 ORDER BY created_at DESC LIMIT 50",
      [roomId]
    );
    socket.emit("history", rows.reverse());
  });

  socket.on("message", async ({ roomId, sender, body }) => {
    await pool.query(
      "INSERT INTO messages (room_id, sender, body) VALUES ($1, $2, $3)",
      [roomId, sender, body]
    );
    io.to(roomId).emit("message", { sender, body, created_at: new Date() });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(\`quicktalk listening on :\${PORT}\`));`
  }
};

export default function Dashboard() {
  // --- Data Source Mode (Real API vs Mock Walkthrough) ---
  const [dataSource, setDataSource] = useState<'real' | 'mock'>('real');

  // --- Screen State ---
  const [screen, setScreen] = useState<number>(0);
  const [selectedRepoId, setSelectedRepoId] = useState<string>('1');
  const [repoPathInput, setRepoPathInput] = useState<string>('');
  const [mode, setMode] = useState<'approval' | 'autonomy'>('approval');
  const [limit, setLimit] = useState<number>(50);
  const [category, setCategory] = useState<string>('Hosting');

  // --- Real Backend State ---
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<any | null>(null);
  const [isPolling, setIsPolling] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [interviewAnswers, setInterviewAnswers] = useState<Record<string, string>>({});
  const [backendHealth, setBackendHealth] = useState<any | null>(null);

  // --- Mock Scan State ---
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [currentScanningFile, setCurrentScanningFile] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // --- Accordion / Modal UI State ---
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);
  const [selectedFindingForModal, setSelectedFindingForModal] = useState<any | null>(null);

  // --- Mock Proposal/Rules States ---
  const [chosenProposalId, setChosenProposalId] = useState<string>('p-chosen');
  const [showAlternativeSelector, setShowAlternativeSelector] = useState<boolean>(false);
  const [hasRejected, setHasRejected] = useState<boolean>(false);

  const [rulesStatus, setRulesStatus] = useState<RuleCheck[]>([]);
  const [rulesCheckIndex, setRulesCheckIndex] = useState<number>(-1);
  const [isRulesCheckRunning, setIsRulesCheckRunning] = useState<boolean>(false);
  const [isCharged, setIsCharged] = useState<boolean>(false);
  const [paymentStep, setPaymentStep] = useState<string>('');
  const [haltedAtCheck, setHaltedAtCheck] = useState<number | null>(null);

  // --- Demo Control Panel State ---
  const [varLowConfidence, setVarLowConfidence] = useState<boolean>(false);
  const [varZeroFindings, setVarZeroFindings] = useState<boolean>(false);
  const [varHaltState, setVarHaltState] = useState<boolean>(false);
  const [isDemoPanelOpen, setIsDemoPanelOpen] = useState<boolean>(true);

  // --- Fetch Backend Health & Catalog on load ---
  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch('http://localhost:4000/health');
        if (res.ok) {
          const data = await res.json();
          setBackendHealth(data);
          if (data.wallet_limit_usd) {
            setLimit(Math.round(parseFloat(data.wallet_limit_usd)));
          }
          if (data.assigned_category) {
            // Capitalize category
            const cat = data.assigned_category;
            setCategory(cat.charAt(0).toUpperCase() + cat.slice(1));
          }
        }
      } catch (e) {
        console.warn('Backend is offline or unreachable at http://localhost:4000');
      }
    };
    fetchHealth();
  }, []);

  // --- Real Backend Polling Logic ---
  const pollRun = async (id: string) => {
    try {
      const res = await fetch(`http://localhost:4000/api/runs/${id}`);
      if (!res.ok) throw new Error("Failed to fetch run details from backend");
      const data = await res.json();
      setRun(data);

      // Automatically transition UI screen based on backend state
      if (dataSource === 'real') {
        switch (data.state) {
          case 'cloning':
          case 'exploring':
            setScreen(2);
            break;
          case 'awaiting_answers':
            setScreen(3);
            break;
          case 'analyzing':
          case 'proposing':
            // Stay in scanning/loading dashboard layout
            setScreen(2);
            break;
          case 'awaiting_decision':
            setScreen(4);
            break;
          case 'executing':
            setScreen(5);
            break;
          case 'completed':
            setScreen(6);
            setIsPolling(false);
            break;
          case 'halted':
            setScreen(5); // Show rules check state with the halt reason
            setIsPolling(false);
            break;
          case 'rejected':
            setScreen(4); // Show rejected status
            setIsPolling(false);
            break;
          case 'error':
            setErrorMessage(data.error || "An unknown backend error occurred");
            setIsPolling(false);
            break;
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message);
      setIsPolling(false);
    }
  };

  useEffect(() => {
    let interval: any = null;
    if (isPolling && runId && dataSource === 'real') {
      pollRun(runId);
      interval = setInterval(() => {
        pollRun(runId);
      }, 1500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isPolling, runId, dataSource]);

  // --- Handle Action: Connect Repository & Start Scan ---
  const handleStartScan = async () => {
    setErrorMessage(null);
    if (dataSource === 'mock') {
      setScreen(2);
      return;
    }

    try {
      // The slider is real: it becomes this run's hard spend ceiling on the
      // backend (deterministic spend-ceiling rule, checked before Prava).
      const payload: any = { mode, wallet_limit_usd: limit };
      if (repoPathInput.trim()) {
        payload.repo_path = repoPathInput.trim();
      }
      
      const res = await fetch('http://localhost:4000/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Could not start repository scan");
      }
      
      const newRun = await res.json();
      setRunId(newRun.id);
      setRun(newRun);
      setInterviewAnswers({});
      setIsPolling(true);
      setScreen(2);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // --- Handle Action: Submit Load Interview Answers ---
  const handleSubmitAnswers = async () => {
    if (dataSource === 'mock') {
      setScreen(4);
      return;
    }

    if (!runId) return;
    setErrorMessage(null);

    try {
      const res = await fetch(`http://localhost:4000/api/runs/${runId}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: interviewAnswers })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit interview answers");
      }

      // Transition to analyzing progress screen
      setScreen(2);
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // --- Handle Action: Submit Proposal Decision (Approve / Reject) ---
  const handleSubmitDecision = async (decision: 'approved' | 'rejected') => {
    if (dataSource === 'mock') {
      if (decision === 'approved') {
        setScreen(5);
      } else {
        setHasRejected(true);
      }
      return;
    }

    if (!runId) return;
    setErrorMessage(null);

    try {
      const res = await fetch(`http://localhost:4000/api/runs/${runId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to submit approval decision");
      }

      if (decision === 'rejected') {
        setHasRejected(true);
      } else {
        setScreen(5);
      }
    } catch (err: any) {
      setErrorMessage(err.message);
    }
  };

  // --- Auth guard: dashboard requires a signed-in user (demo-grade auth) ---
  const router = useRouter();
  const [authUser, setAuthUser] = useState<{ name: string; email: string } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('pr_user');
      if (!raw) {
        router.replace('/login');
        return;
      }
      setAuthUser(JSON.parse(raw));
    } catch {
      router.replace('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('pr_user');
    router.replace('/login');
  };

  // --- Auto-scroll logs terminal (mock logs + real activity rail) ---
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, run?.activity?.length]);

  // --- Real mode: track which file the agent is currently reading, so the
  //     real file tree highlights it exactly like the mock does ---
  useEffect(() => {
    if (dataSource !== 'real' || !run?.activity?.length) return;
    for (let i = run.activity.length - 1; i >= 0; i--) {
      const m = /read_file\(([^)]+)\)/.exec(run.activity[i]);
      if (m) {
        setCurrentScanningFile(m[1]);
        return;
      }
    }
  }, [dataSource, run?.activity?.length]);

  // --- Mock Scan Step Simulation ---
  useEffect(() => {
    if (screen === 2 && dataSource === 'mock') {
      setScanProgress(0);
      setLogs([]);
      setCurrentScanningFile('');
      
      let currentLogIdx = 0;
      
      const runScanStep = () => {
        if (currentLogIdx < SCAN_LOGS.length) {
          const stepData = SCAN_LOGS[currentLogIdx];
          setCurrentScanningFile(stepData.file);
          
          let lineIdx = 0;
          const streamLines = () => {
            if (lineIdx < stepData.lines.length) {
              const logLine = stepData.lines[lineIdx];
              setLogs(prev => [...prev, logLine]);
              lineIdx++;
              setTimeout(streamLines, 180);
            } else {
              setScanProgress(Math.round(((currentLogIdx + 1) / SCAN_LOGS.length) * 100));
              currentLogIdx++;
              setTimeout(runScanStep, 1000);
            }
          };
          streamLines();
        } else {
          setScanProgress(100);
          setTimeout(() => {
            setScreen(3);
          }, 1200);
        }
      };

      const delayStart = setTimeout(runScanStep, 500);
      return () => clearTimeout(delayStart);
    }
  }, [screen, dataSource]);

  // --- Mock Rules Check Sequence Simulator ---
  const runMockRulesCheckSequence = () => {
    setIsRulesCheckRunning(true);
    setRulesCheckIndex(-1);
    setRulesStatus(MOCK_RULES_CHECKS.map(c => ({ ...c, status: 'pending' })));
    setHaltedAtCheck(null);
    setIsCharged(false);
    setPaymentStep('');

    let checkIdx = 0;
    
    const runNextCheck = () => {
      if (checkIdx < MOCK_RULES_CHECKS.length) {
        if (varHaltState && checkIdx === 1) {
          setTimeout(() => {
            setRulesStatus(prev => {
              const updated = [...prev];
              updated[1] = { ...updated[1], status: 'failed' };
              return updated;
            });
            setRulesCheckIndex(1);
            setHaltedAtCheck(1);
            setIsRulesCheckRunning(false);
          }, 600);
          return;
        }

        setTimeout(() => {
          setRulesStatus(prev => {
            const updated = [...prev];
            updated[checkIdx] = { ...updated[checkIdx], status: 'success' };
            return updated;
          });
          setRulesCheckIndex(checkIdx);
          checkIdx++;
          runNextCheck();
        }, 550);
      } else {
        setTimeout(() => {
          setPaymentStep('💳 Charging via Prava...');
          
          setTimeout(() => {
            setPaymentStep('✅ Charge successful');
            setIsCharged(true);
            setTimeout(() => {
              setScreen(6);
            }, 1800);
          }, 2000);
        }, 600);
      }
    };

    runNextCheck();
  };

  useEffect(() => {
    if (screen === 5 && dataSource === 'mock') {
      runMockRulesCheckSequence();
    }
  }, [screen, dataSource, varHaltState]);

  // --- Mock Auto Advance in Autonomy Mode ---
  useEffect(() => {
    if (screen === 4 && mode === 'autonomy' && dataSource === 'mock') {
      const timer = setTimeout(() => {
        setScreen(5);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [screen, mode, dataSource]);

  // --- Parse findings from Real Backend Report ---
  const parseRealReportFindings = (report: any): Finding[] => {
    if (!report) return [];
    const list: Finding[] = [];
    
    if (report.runtime) {
      list.push({
        id: report.runtime.id || 'F_RUNTIME',
        title: `Runtime: ${report.runtime.value}`,
        tag: report.runtime.confidence,
        evidence: report.runtime.evidence,
        fileName: 'package.json',
        codeSnippet: DEMO_REPO_FILES['package.json'].content,
        highlightLines: [6, 7, 8]
      });
    }
    
    if (report.database) {
      const dbVal = report.database.value;
      const dbName = typeof dbVal === 'object' ? dbVal.type : dbVal;
      list.push({
        id: report.database.id || 'F_DATABASE',
        title: `Database: ${dbName}`,
        tag: report.database.confidence,
        evidence: report.database.evidence,
        fileName: 'package.json',
        codeSnippet: DEMO_REPO_FILES['package.json'].content,
        highlightLines: [17]
      });
    }
    
    if (report.concurrency) {
      list.push({
        id: report.concurrency.id || 'F_CONCURRENCY',
        title: `Concurrency: ${report.concurrency.value}`,
        tag: report.concurrency.confidence,
        evidence: report.concurrency.evidence,
        fileName: 'server.js',
        codeSnippet: DEMO_REPO_FILES['server.js'].content,
        highlightLines: [9, 10, 11]
      });
    }
    
    if (report.special_needs && Array.isArray(report.special_needs)) {
      report.special_needs.forEach((need: any) => {
        const val = need.value;
        const name = typeof val === 'object' ? val.need : val;
        const detail = typeof val === 'object' ? val.detail : '';
        
        let file = 'server.js';
        let hl = [11, 18];
        if (name === 'file-uploads' || name === 'multer') {
          file = 'package.json';
          hl = [16];
        }

        list.push({
          id: need.id,
          title: `Special Need: ${name}`,
          tag: need.confidence,
          evidence: `${detail ? detail + ' — ' : ''}${need.evidence}`,
          fileName: file,
          codeSnippet: DEMO_REPO_FILES[file].content,
          highlightLines: hl
        });
      });
    }
    
    if (report.load_class) {
      list.push({
        id: report.load_class.id || 'F_LOAD',
        title: `Load Class Estimate: ${report.load_class.value}`,
        tag: report.load_class.confidence,
        evidence: report.load_class.evidence,
      });
    }
    
    return list;
  };

  const getActiveFindings = (): Finding[] => {
    if (dataSource === 'mock') {
      return varZeroFindings 
        ? [] 
        : varLowConfidence 
          ? LOW_CONFIDENCE_FINDINGS 
          : NORMAL_FINDINGS;
    }
    return run?.report ? parseRealReportFindings(run.report) : [];
  };

  const activeFindings = getActiveFindings();

  const getRepoName = () => {
    if (dataSource === 'mock') {
      const r = MOCK_REPOS.find(rp => rp.id === selectedRepoId);
      return r ? r.name : 'express-postgres-socketio-app';
    }
    return run?.repo_name || repoPathInput || 'demo-repo';
  };

  // Helper to render File Tree nodes (Mock scan only)
  const renderFileNode = (node: FileNode, depth = 0) => {
    const isScanning = currentScanningFile === node.path || currentScanningFile.startsWith(node.path + '/');
    const isDirectMatch = currentScanningFile === node.path;

    return (
      <div key={node.path} style={{ paddingLeft: `${depth * 12}px` }} className="py-1">
        <div className={`flex items-center gap-2 rounded px-2 py-1 transition-all ${
          isDirectMatch 
            ? 'bg-[#FFD600]/15 text-[#FFD600] border-l-2 border-[#FFD600]' 
            : isScanning 
              ? 'text-[#F5F5F0] bg-[#141414]' 
              : 'text-[#888888] hover:text-[#F5F5F0]'
        }`}>
          {node.type === 'dir' ? (
            <Folder size={14} className={isScanning ? "text-[#FFD600]" : "text-[#555555]"} />
          ) : (
            <FileCode size={14} className={isScanning ? "text-[#FFD600]" : "text-[#555555]"} />
          )}
          <span className="font-mono text-xs tracking-wide">{node.name}</span>
          {isDirectMatch && (
            <span className="ml-auto w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-ping" />
          )}
        </div>
        {node.children && (
          <div className="border-l border-[#1D1D1D] ml-3 pl-1">
            {node.children.map(child => renderFileNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // --- Build a FileNode tree from the backend's flat file list (real mode) ---
  const buildTree = (paths: string[]): FileNode[] => {
    const root: FileNode[] = [];
    for (const path of paths) {
      const parts = path.split('/');
      let level = root;
      let acc = '';
      for (let i = 0; i < parts.length; i++) {
        acc = acc ? `${acc}/${parts[i]}` : parts[i];
        const isFile = i === parts.length - 1;
        let node = level.find(n => n.path === acc);
        if (!node) {
          node = { name: parts[i], path: acc, type: isFile ? 'file' : 'dir', ...(isFile ? {} : { children: [] }) };
          level.push(node);
        }
        if (!isFile) level = node.children!;
      }
    }
    const sortLevel = (nodes: FileNode[]) => {
      nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
      nodes.forEach(n => n.children && sortLevel(n.children));
    };
    sortLevel(root);
    return root;
  };
  const realTree: FileNode[] = React.useMemo(
    () => (run?.files?.length ? buildTree(run.files) : []),
    [run?.files]
  );

  // --- Turn raw agent activity lines into readable terminal entries.
  //     One tool call per line, mock-terminal style. ---
  const prettifyActivity = (line: string): { text: string; kind: 'read' | 'scan' | 'milestone' | 'error' | 'info' }[] => {
    const body = line.replace(/^\d{2}:\d{2}:\d{2}\s+/, '');
    if (/BLOCKED|FAILED|failed/i.test(body)) return [{ text: body, kind: 'error' }];
    if (/report ready|proposal:|4\/4 passed|Prava session|indexed \d+ files|load interview|answers received|clone complete|cloning /.test(body)) {
      return [{ text: body, kind: 'milestone' }];
    }
    if (/read_file|search_code|list_files|ask_user/.test(body)) {
      return body.split(', ').map(call => {
        const read = /read_file\(([^)]+)\)/.exec(call);
        if (read) return { text: `Reading ${read[1]}...`, kind: 'read' as const };
        const search = /search_code\(\/(.+)\/\)/.exec(call);
        if (search) return { text: `→ scanning for "${search[1]}"`, kind: 'scan' as const };
        if (call.startsWith('list_files')) return { text: 'Indexing repository files...', kind: 'read' as const };
        if (call.startsWith('ask_user')) return { text: 'Preparing founder interview...', kind: 'milestone' as const };
        return { text: call, kind: 'info' as const };
      });
    }
    return [{ text: body, kind: 'info' }];
  };
  const realLogEntries = React.useMemo(
    () => (run?.activity ?? []).flatMap((l: string) => prettifyActivity(l)),
    [run?.activity]
  );

  // --- Restart Flow ---
  const handleRestart = () => {
    setScreen(0);
    setRunId(null);
    setRun(null);
    setIsPolling(false);
    setErrorMessage(null);
    setInterviewAnswers({});
    setHasRejected(false);
    setShowAlternativeSelector(false);
    setLogs([]);
    setScanProgress(0);
    setHaltedAtCheck(null);
    setIsCharged(false);
    setPaymentStep('');
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] flex flex-col font-sans select-none pb-20 relative text-[#F5F5F0]">
      {/* Header */}
      <header className="h-[60px] border-b border-[#1D1D1D] flex items-center justify-between px-6 bg-[#0E0E0E] sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 bg-[#FFD600] rounded-sm shrink-0" />
          <span className="font-grotesk text-[13px] font-bold tracking-[2.5px] text-[#F5F5F0] uppercase">
            Pay Right
          </span>
          <span className="hidden md:inline font-mono text-[9px] text-[#555555] tracking-wider uppercase border-l border-[#2D2D2D] pl-3">
            powered by Prava
          </span>
        </div>
        
        <div className="flex items-center gap-4">
          {/* Connection Status Badge */}
          {dataSource === 'real' && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded border border-[#2D2D2D] font-mono text-[9px] text-[#888888] tracking-wider uppercase bg-[#141414]">
              {backendHealth ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
                  API ONLINE
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B35] animate-pulse" />
                  API OFFLINE
                </>
              )}
            </div>
          )}

          <div className="flex items-center bg-[#141414] border border-[#2D2D2D] rounded p-0.5">
            <button
              onClick={() => { setDataSource('real'); handleRestart(); }}
              className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase font-bold transition-all ${
                dataSource === 'real' ? 'bg-[#FFD600] text-[#0A0A0A]' : 'text-[#888888] hover:text-[#F5F5F0]'
              }`}
            >
              REAL API
            </button>
            <button
              onClick={() => { setDataSource('mock'); handleRestart(); }}
              className={`px-2 py-0.5 rounded font-mono text-[9px] uppercase font-bold transition-all ${
                dataSource === 'mock' ? 'bg-[#FFD600] text-[#0A0A0A]' : 'text-[#888888] hover:text-[#F5F5F0]'
              }`}
            >
              DEMO WALKTHROUGH
            </button>
          </div>

          {/* Signed-in user + logout */}
          {authUser && (
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-[#2D2D2D]">
              <div className="flex items-center gap-1.5 font-mono text-[10px] text-[#888888]">
                <User size={12} className="text-[#FFD600]" />
                <span className="text-[#F5F5F0] max-w-[120px] truncate">{authUser.name}</span>
              </div>
              <button
                onClick={handleLogout}
                title="Sign out"
                className="text-[#555555] hover:text-[#FF6B35] transition-colors"
              >
                <LogOut size={13} />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-[1000px] w-full mx-auto p-4 md:p-8 flex flex-col justify-center">
        {errorMessage && (
          <div className="bg-[#FF6B35]/15 border border-[#FF6B35] text-[#FF6B35] font-mono text-xs rounded p-4 mb-6 flex items-start gap-2.5">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-bold uppercase">System Error</div>
              <div className="mt-1">{errorMessage}</div>
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* SCREEN 0: LANDING */}
          {screen === 0 && (
            <motion.div 
              key="screen-0"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center justify-center text-center max-w-xl mx-auto py-12"
            >
              <span className="font-mono text-[10px] text-[#FFD600] tracking-[4px] uppercase bg-[#FFD600]/10 px-3 py-1 rounded-full mb-6">
                Automated Cloud Sourcing
              </span>
              <h1 className="font-grotesk text-3xl md:text-5xl font-bold tracking-tight mb-4 text-[#F5F5F0]">
                We read your code before you deploy
              </h1>
              <p className="text-sm md:text-base text-[#888888] max-w-md mb-8 leading-relaxed">
                Connect your repository. Our agent will analyze code dependencies, evaluate capacity requirements, audit compliance policies, and checkout plans automatically via Prava.
              </p>

              {/* Repository Selector / Path Config */}
              <div className="w-full bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-5 mb-8 text-left">
                <label className="block font-mono text-[10px] text-[#555555] tracking-wider uppercase mb-2">
                  Target Repository Path
                </label>
                
                {dataSource === 'mock' ? (
                  <div className="relative">
                    <select
                      value={selectedRepoId}
                      onChange={(e) => setSelectedRepoId(e.target.value)}
                      className="w-full bg-[#0A0A0A] border border-[#2D2D2D] text-xs font-mono text-[#F5F5F0] rounded p-3 pr-10 focus:outline-none focus:border-[#FFD600] cursor-pointer"
                    >
                      {MOCK_REPOS.map(repo => (
                        <option key={repo.id} value={repo.id}>
                          {repo.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888888] pointer-events-none" size={14} />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={repoPathInput}
                    onChange={(e) => setRepoPathInput(e.target.value)}
                    placeholder="Blank = bundled demo-repo · or paste a public GitHub URL"
                    className="w-full bg-[#0A0A0A] border border-[#2D2D2D] text-xs font-mono text-[#F5F5F0] rounded p-3 focus:outline-none focus:border-[#FFD600]"
                  />
                )}

                <div className="mt-2 text-[11px] text-[#555555] font-mono leading-normal">
                  {dataSource === 'mock' 
                    ? MOCK_REPOS.find(r => r.id === selectedRepoId)?.desc
                    : "Accepts a public GitHub URL (https://github.com/owner/repo), a local folder path, or blank for the bundled demo-repo."
                  }
                </div>
              </div>

              {/* Connect Button */}
              <button 
                onClick={() => setScreen(1)}
                className="group font-grotesk text-[11px] font-bold text-[#0A0A0A] bg-[#FFD600] tracking-[1.5px] px-8 py-3.5 hover:bg-[#F5F5F0] transition-colors flex items-center gap-2 rounded-sm"
              >
                CONNECT REPOSITORY
                <ArrowRight size={13} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </motion.div>
          )}

          {/* SCREEN 1: MODE SELECTION */}
          {screen === 1 && (
            <motion.div 
              key="screen-1"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-2xl mx-auto flex flex-col"
            >
              <h2 className="font-grotesk text-xl md:text-2xl font-bold tracking-wide mb-2 uppercase">
                Who approves the purchase?
              </h2>
              <p className="text-xs md:text-sm text-[#888888] mb-8 font-mono leading-relaxed">
                The agent scans your repo, asks a few questions, and picks the cheapest hosting
                plan that truly fits. Before any money moves, choose who gives the final go-ahead.
              </p>

              {/* Mode Cards */}
              <div className="grid md:grid-cols-2 gap-4 mb-8">
                {/* Approval Mode */}
                <div
                  onClick={() => setMode('approval')}
                  className={`bg-[#0F0F0F] border p-6 rounded-lg cursor-pointer transition-all duration-300 hover:-translate-y-0.5 flex flex-col ${
                    mode === 'approval'
                      ? 'border-[#FFD600] shadow-[0_0_15px_rgba(255,214,0,0.08)]'
                      : 'border-[#2D2D2D] opacity-60 hover:opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-grotesk text-xs font-bold tracking-wider text-[#F5F5F0] uppercase flex items-center gap-2">
                      <UserCheck size={14} className="text-[#FFD600]" />
                      Approval Mode
                    </span>
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      mode === 'approval' ? 'border-[#FFD600] bg-[#FFD600]/10' : 'border-[#444444]'
                    }`}>
                      {mode === 'approval' && <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600]" />}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-[#888888] mb-4">You get the final say.</p>
                  <ol className="flex flex-col gap-2.5 font-mono text-[10px] text-[#888888] leading-relaxed">
                    <li className="flex gap-2.5">
                      <span className="text-[#FFD600] font-bold shrink-0">1</span>
                      Agent scans your code and recommends a plan with evidence
                    </li>
                    <li className="flex gap-2.5">
                      <span className="text-[#FFD600] font-bold shrink-0">2</span>
                      <span><span className="text-[#F5F5F0]">You review the reasoning</span> and click Approve or Reject</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="text-[#FFD600] font-bold shrink-0">3</span>
                      You confirm the payment with your Prava passkey
                    </li>
                  </ol>
                  <span className="font-mono text-[9px] text-[#FFD600] tracking-wider uppercase mt-4 pt-3 border-t border-[#1D1D1D]">
                    Recommended — 2 human checkpoints
                  </span>
                </div>

                {/* Autonomy Mode */}
                <div
                  onClick={() => setMode('autonomy')}
                  className={`bg-[#0F0F0F] border p-6 rounded-lg cursor-pointer transition-all duration-300 hover:-translate-y-0.5 flex flex-col ${
                    mode === 'autonomy'
                      ? 'border-[#FFD600] shadow-[0_0_15px_rgba(255,214,0,0.08)]'
                      : 'border-[#2D2D2D] opacity-60 hover:opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-grotesk text-xs font-bold tracking-wider text-[#F5F5F0] uppercase flex items-center gap-2">
                      <Zap size={14} className="text-[#FF6B35]" />
                      Full Autonomy Mode
                    </span>
                    <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      mode === 'autonomy' ? 'border-[#FFD600] bg-[#FFD600]/10' : 'border-[#444444]'
                    }`}>
                      {mode === 'autonomy' && <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600]" />}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-[#888888] mb-4">The agent decides for you.</p>
                  <ol className="flex flex-col gap-2.5 font-mono text-[10px] text-[#888888] leading-relaxed">
                    <li className="flex gap-2.5">
                      <span className="text-[#FF6B35] font-bold shrink-0">1</span>
                      Agent scans your code and picks the plan on its own
                    </li>
                    <li className="flex gap-2.5">
                      <span className="text-[#FF6B35] font-bold shrink-0">2</span>
                      <span><span className="text-[#F5F5F0]">No approval screen</span> — the decision is auto-signed within your spend cap</span>
                    </li>
                    <li className="flex gap-2.5">
                      <span className="text-[#FF6B35] font-bold shrink-0">3</span>
                      One Prava passkey tap releases the money — that&apos;s payment security, not a decision, and the agent can never skip it
                    </li>
                  </ol>
                  <span className="font-mono text-[9px] text-[#FF6B35] tracking-wider uppercase mt-4 pt-3 border-t border-[#1D1D1D]">
                    Skips human review — cap still enforced by code
                  </span>
                </div>
              </div>

              {/* Guardrails — the limits that hold in BOTH modes */}
              <div className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-6 mb-8 flex flex-col gap-6">
                <div className="font-grotesk text-[11px] font-bold tracking-wider text-[#F5F5F0] uppercase flex items-center gap-2 -mb-2">
                  <Shield size={13} className="text-[#FFD600]" />
                  Guardrails — enforced by code in both modes
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-mono text-[10px] text-[#555555] tracking-wider uppercase">Hard spend ceiling (per month)</span>
                    <span className="font-mono text-xs font-bold text-[#FFD600] bg-[#FFD600]/10 px-2 py-0.5 rounded border border-[#FFD600]/25">
                      ${limit} USD
                    </span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="w-full accent-[#FFD600] bg-[#1D1D1D] rounded-lg appearance-none h-1.5 cursor-pointer"
                  />
                  <div className="flex justify-between text-[9px] text-[#555555] font-mono mt-1">
                    <span>$5</span>
                    <span>$50</span>
                    <span>$100</span>
                  </div>
                  <p className="mt-2.5 text-[10px] text-[#888888] font-mono leading-relaxed">
                    Any plan priced above this <span className="text-[#F5F5F0]">halts the run before Prava is ever contacted</span> —
                    checked by deterministic code the AI cannot override.
                    <span className="text-[#555555]"> (Most recommended plans cost $5–$25. Set this below the price to watch a live CAP_EXCEEDED halt.)</span>
                  </p>
                </div>

                <div>
                  <span className="block font-mono text-[10px] text-[#555555] tracking-wider uppercase mb-2">
                    Purchase category
                  </span>
                  <div className="flex items-center gap-2.5 bg-[#0A0A0A] border border-[#2D2D2D] rounded p-2.5">
                    <Lock size={12} className="text-[#FFD600] shrink-0" />
                    <span className="font-mono text-xs text-[#F5F5F0]">Hosting</span>
                    <span className="font-mono text-[9px] text-[#555555] uppercase tracking-wider ml-auto">Locked</span>
                  </div>
                  <p className="mt-2 text-[10px] text-[#888888] font-mono leading-relaxed">
                    This agent&apos;s mandate covers hosting only. If it ever proposed anything else,
                    the category-lock rule halts the purchase automatically.
                  </p>
                </div>
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => setScreen(0)}
                  className="font-grotesk text-[10px] font-bold text-[#888888] hover:text-[#F5F5F0] bg-transparent border border-[#2D2D2D] px-5 py-2.5 transition-colors uppercase tracking-wider rounded-sm"
                >
                  Back
                </button>
                <button 
                  onClick={handleStartScan}
                  className="font-grotesk text-[10px] font-bold text-[#0A0A0A] bg-[#FFD600] hover:bg-[#F5F5F0] px-6 py-2.5 transition-colors uppercase tracking-wider rounded-sm"
                >
                  Continue to Scan
                </button>
              </div>
            </motion.div>
          )}

          {/* SCREEN 2: SCAN/ANALYSIS PROGRESS */}
          {screen === 2 && (
            <motion.div 
              key="screen-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full flex flex-col"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-grotesk text-lg md:text-xl font-bold tracking-wide uppercase flex items-center gap-2">
                    Scanning {getRepoName()}
                  </h2>
                  <span className="font-mono text-[9px] text-[#888888] uppercase tracking-wider">
                    {dataSource === 'mock' 
                      ? "Analyzing static files and config trees"
                      : `State: ${run?.state || 'analyzing'} — Running OpenAI analysis agent...`
                    }
                  </span>
                </div>
                {dataSource === 'mock' && (
                  <div className="font-mono text-xs text-[#FFD600] bg-[#FFD600]/10 border border-[#FFD600]/20 px-2.5 py-0.5 rounded">
                    {scanProgress}%
                  </div>
                )}
              </div>

              {dataSource === 'mock' ? (
                /* Mock Panel UI: File Tree & Streaming Logs */
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  {/* Left panel: File Tree */}
                  <div className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-5 h-[340px] overflow-y-auto flex flex-col">
                    <div className="flex items-center gap-2 text-[#555555] font-mono text-[10px] tracking-wider uppercase pb-3 border-b border-[#1D1D1D] mb-3">
                      <Folder size={12} />
                      Project File Directory
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {MOCK_FILE_TREE.map(node => renderFileNode(node))}
                    </div>
                  </div>

                  {/* Right panel: Live Logs */}
                  <div className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-5 h-[340px] overflow-hidden flex flex-col">
                    <div className="flex items-center gap-2 text-[#555555] font-mono text-[10px] tracking-wider uppercase pb-3 border-b border-[#1D1D1D] mb-3">
                      <Terminal size={12} />
                      Streaming Agent Findings
                    </div>
                    <div 
                      ref={logContainerRef}
                      className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed text-[#888888]"
                    >
                      <AnimatePresence>
                        {logs.map((log, idx) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.15 }}
                            className={`py-1 border-b border-[#141414] ${
                              log && log.startsWith('→') 
                                ? 'text-[#FFD600] pl-3' 
                                : log && log.startsWith('Reading') 
                                  ? 'text-[#F5F5F0] font-medium' 
                                  : 'text-[#888888]'
                            }`}
                          >
                            {log}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>
              ) : (
                /* Real API UI: file tree + streaming findings, fed by live run data */
                <div className="grid md:grid-cols-2 gap-4 mb-6">
                  {/* Left panel: real project file tree */}
                  <div className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-5 h-[340px] overflow-y-auto flex flex-col">
                    <div className="flex items-center gap-2 text-[#555555] font-mono text-[10px] tracking-wider uppercase pb-3 border-b border-[#1D1D1D] mb-3">
                      <Folder size={12} />
                      Project File Directory
                      <span className="ml-auto text-[#888888] normal-case tracking-normal">
                        {run?.files?.length ? `${run.files.length} files` : ''}
                      </span>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {realTree.length > 0 ? (
                        realTree.map(node => renderFileNode(node))
                      ) : (
                        <div className="flex items-center gap-2 font-mono text-xs text-[#555555] py-2">
                          <Loader2 size={12} className="animate-spin text-[#FFD600]" />
                          {run?.state === 'cloning' ? 'Cloning repository...' : 'Indexing files...'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right panel: streaming agent findings (live activity, prettified) */}
                  <div className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-5 h-[340px] overflow-hidden flex flex-col">
                    <div className="flex items-center gap-2 text-[#555555] font-mono text-[10px] tracking-wider uppercase pb-3 border-b border-[#1D1D1D] mb-3">
                      <Terminal size={12} />
                      Streaming Agent Findings
                      <span className="ml-auto flex items-center gap-2 text-[#888888] normal-case tracking-normal">
                        <Loader2 size={11} className="text-[#FFD600] animate-spin" />
                        <span className="text-[#FFD600] font-bold">{runId}</span>
                      </span>
                    </div>
                    <div
                      ref={logContainerRef}
                      className="flex-1 overflow-y-auto font-mono text-[11px] leading-relaxed"
                    >
                      <AnimatePresence>
                        {realLogEntries.map((entry: { text: string; kind: string }, idx: number) => (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: -5 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.15 }}
                            className={`py-1 border-b border-[#141414] ${
                              entry.kind === 'read'
                                ? 'text-[#F5F5F0] font-medium'
                                : entry.kind === 'scan'
                                  ? 'text-[#FFD600] pl-3'
                                  : entry.kind === 'milestone'
                                    ? 'text-[#FFD600]'
                                    : entry.kind === 'error'
                                      ? 'text-[#FF6B35]'
                                      : 'text-[#888888]'
                            }`}
                          >
                            {entry.text}
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {realLogEntries.length === 0 && (
                        <div className="text-[#555555] py-1">connecting to agent…</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              <div className="w-full bg-[#1D1D1D] rounded-full h-1.5 mb-2 overflow-hidden">
                <motion.div 
                  className="bg-[#FFD600] h-full"
                  initial={{ width: '0%' }}
                  animate={{ width: dataSource === 'mock' ? `${scanProgress}%` : '50%' }}
                  transition={{ 
                    duration: dataSource === 'mock' ? 0.3 : 25,
                    ease: "easeOut"
                  }}
                />
              </div>
              <div className="flex justify-between font-mono text-[9px] text-[#555555] uppercase">
                <span>Scanning repository</span>
                <span>Connecting agent intelligence...</span>
              </div>
            </motion.div>
          )}

          {/* SCREEN 3: LOAD INTERVIEW */}
          {screen === 3 && (
            <motion.div 
              key="screen-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full flex flex-col"
            >
              <div className="mb-6">
                <h2 className="font-grotesk text-lg md:text-xl font-bold tracking-wide uppercase">
                  Load Capacity Interview
                </h2>
                <p className="font-mono text-[10px] text-[#888888] uppercase mt-1">
                  Answer business parameters below to compute expected server workload classes.
                </p>
              </div>

              <div className="flex flex-col gap-5 mb-8">
                {dataSource === 'mock' ? (
                  /* Mock Interview (Static) */
                  <div className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-6 font-mono text-xs flex flex-col gap-4">
                    <p className="font-bold text-[#F5F5F0]">1. What is the expected peak connection count?</p>
                    <div className="flex flex-col gap-2">
                      {["About a team of 10", "About a classroom of 100", "An audience of 1000s"].map((opt, i) => (
                        <label key={i} className="flex items-center gap-2.5 cursor-pointer text-[#888888] hover:text-[#F5F5F0]">
                          <input type="radio" name="mock_q1" defaultChecked={i === 1} className="accent-[#FFD600]" />
                          <span>{opt}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Real Interview (Dynamic from backend) */
                  run?.questions?.map((q: any) => (
                    <div key={q.q_id} className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-5 flex flex-col gap-4 font-mono text-xs">
                      <div className="font-bold text-[#F5F5F0] flex items-start gap-2">
                        <span className="text-[#FFD600]">{q.q_id}.</span>
                        <span>{q.question}</span>
                      </div>
                      <div className="flex flex-col gap-2.5 pl-5 border-l border-[#1D1D1D]">
                        {q.options.map((opt: string) => {
                          const isSelected = interviewAnswers[q.q_id] === opt;
                          return (
                            <label 
                              key={opt} 
                              className={`flex items-center gap-3 cursor-pointer text-xs p-2 rounded transition-colors ${
                                isSelected ? 'bg-[#FFD600]/5 text-[#FFD600]' : 'text-[#888888] hover:text-[#F5F5F0]'
                              }`}
                            >
                              <input 
                                type="radio" 
                                name={q.q_id}
                                checked={isSelected}
                                onChange={() => setInterviewAnswers(prev => ({ ...prev, [q.q_id]: opt }))}
                                className="accent-[#FFD600]" 
                              />
                              <span>{opt}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Navigation */}
              <div className="flex justify-between items-center">
                <button 
                  onClick={handleRestart}
                  className="font-grotesk text-[10px] font-bold text-[#888888] hover:text-[#F5F5F0] bg-transparent border border-[#2D2D2D] px-5 py-2.5 transition-colors uppercase tracking-wider rounded-sm"
                >
                  Restart
                </button>
                <button 
                  onClick={handleSubmitAnswers}
                  disabled={dataSource === 'real' && (!run?.questions || run.questions.some((q: any) => !interviewAnswers[q.q_id]))}
                  className="font-grotesk text-[10px] font-bold text-[#0A0A0A] bg-[#FFD600] hover:bg-[#F5F5F0] px-6 py-2.5 transition-colors uppercase tracking-wider rounded-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Submit & Compute Fit
                </button>
              </div>
            </motion.div>
          )}

          {/* SCREEN 4: FINDINGS & PROPOSAL SCREEN */}
          {screen === 4 && (
            <motion.div 
              key="screen-4"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full flex flex-col"
            >
              <div className="mb-6">
                <h2 className="font-grotesk text-lg md:text-xl font-bold tracking-wide uppercase">
                  Proposed Infrastructure Strategy
                </h2>
                <span className="font-mono text-[9px] text-[#888888] uppercase tracking-wider">
                  Review findings derived from your code and the recommended cloud purchase
                </span>
              </div>

              {/* Autonomy Mode Warning */}
              {mode === 'autonomy' && (
                <div className="bg-[#FF6B35]/5 border border-[#FF6B35]/30 text-[#FF6B35] rounded p-4 mb-6">
                  <div className="font-grotesk text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FF6B35] animate-pulse" />
                    Full Autonomy Mode Active
                  </div>
                  <div className="font-mono text-[10px] mt-1 text-[#FF6B35]/80">
                    {dataSource === 'mock'
                      ? "Proceeding automatically to rules compliance check in 2s..."
                      : `Decision auto-signed by the agent within your $${limit} cap — running rules compliance...`
                    }
                  </div>
                </div>
              )}

              {/* Main Content Layout */}
              <div className="grid md:grid-cols-12 gap-6 mb-8">
                {/* Left Panel: Findings Accordion */}
                <div className="md:col-span-7 flex flex-col gap-3">
                  <h3 className="font-mono text-[10px] text-[#555] uppercase tracking-wider mb-1">Derived Findings</h3>
                  
                  {activeFindings.length === 0 ? (
                    <div className="bg-[#0F0F0F] border border-dashed border-[#2D2D2D] rounded-lg p-8 text-center">
                      <ShieldAlert size={24} className="text-[#888888] mx-auto mb-2" />
                      <p className="font-mono text-xs text-[#555]">No code signals detected.</p>
                    </div>
                  ) : (
                    activeFindings.map((finding, fIdx) => {
                      const isExpanded = expandedFindingId === finding.id;
                      return (
                        <div
                          key={`${finding.id}-${fIdx}`}
                          id={`finding-${finding.id}`}
                          className={`bg-[#0F0F0F] border rounded transition-all overflow-hidden ${
                            isExpanded ? 'border-[#FFD600] ring-1 ring-[#FFD600]/20' : 'border-[#2D2D2D]'
                          }`}
                        >
                          {/* Header */}
                          <div 
                            onClick={() => setExpandedFindingId(isExpanded ? null : finding.id)}
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#141414] transition-colors gap-4"
                          >
                            <span className="font-grotesk text-xs font-bold text-[#F5F5F0] uppercase tracking-wider truncate">
                              {finding.title}
                            </span>
                            <div className="flex items-center gap-3 shrink-0">
                              <ConfidenceBadge tag={finding.tag as any} />
                              {isExpanded ? <ChevronUp size={14} className="text-[#888888]" /> : <ChevronDown size={14} className="text-[#888888]" />}
                            </div>
                          </div>

                          {/* Expanded content */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-2 border-t border-[#1D1D1D] bg-[#0A0A0A]/50 flex flex-col gap-3 font-mono text-[11px] text-[#888888]">
                              {finding.tag === 'assumption' ? (
                                <div className="flex items-start gap-2 text-[#9ca3af]">
                                  <span className="text-base select-none mt-[-3px]">⚪</span>
                                  <span>{finding.reasoning}</span>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-3">
                                  <div>
                                    <span className="text-[#555555] uppercase text-[9px] tracking-wider block mb-1">Evidence</span>
                                    <span className="text-[#F5F5F0]">{finding.evidence}</span>
                                  </div>
                                  {finding.codeSnippet && finding.fileName && (
                                    <button
                                      onClick={() => setSelectedFindingForModal(finding)}
                                      className="font-mono text-[10px] text-[#FFD600] hover:text-[#F5F5F0] flex items-center gap-1.5 mt-1 border border-[#FFD600]/30 hover:border-[#F5F5F0] bg-[#FFD600]/5 px-3 py-1.5 self-start transition-colors"
                                    >
                                      View in code →
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Right Panel: Proposals Chosen vs Rejected */}
                <div className="md:col-span-5 flex flex-col gap-4">
                  <h3 className="font-mono text-[10px] text-[#555] uppercase tracking-wider mb-1">Purchase Proposal</h3>

                  {/* Recommended Card */}
                  <div className="bg-[#0F0F0F] border border-[#FFD600] rounded-lg p-5 flex flex-col justify-between shadow-[0_0_20px_rgba(255,214,0,0.05)]">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <span className="font-mono text-[9px] text-[#22c55e] border border-[#22c55e]/30 bg-[#22c55e]/5 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                            Recommended Fit
                          </span>
                          <h3 className="font-grotesk text-base font-bold text-[#F5F5F0] mt-1.5">
                            {dataSource === 'mock' 
                              ? "Railway Pro" 
                              : `${run?.proposal?.recommended?.provider} ${run?.proposal?.recommended?.plan}`
                            }
                          </h3>
                        </div>
                        <div className="text-right">
                          <span className="font-grotesk text-lg font-bold text-[#FFD600] block">
                            ${dataSource === 'mock' ? '20' : run?.proposal?.recommended?.price}
                          </span>
                          <span className="font-mono text-[9px] text-[#555] uppercase">
                            /{dataSource === 'mock' ? 'mo' : run?.proposal?.recommended?.billing_cycle}
                          </span>
                        </div>
                      </div>

                      <div className="border-t border-[#1D1D1D] pt-4 flex flex-col gap-3.5">
                        {dataSource === 'mock' ? (
                          MOCK_PROPOSALS[0].points.map((p, idx) => (
                            <div key={idx} className="flex items-start gap-2">
                              <Check size={13} className="text-[#22c55e] shrink-0 mt-0.5" />
                              <div className="font-mono text-[11px] leading-normal text-[#888888]">
                                <span>{p.text} </span>
                                {p.findingId && (
                                  <button 
                                    onClick={() => setExpandedFindingId(p.findingId || null)}
                                    className="inline-flex items-center text-[9px] uppercase tracking-wider font-bold text-[#FFD600] border border-[#FFD600]/25 px-1 py-0.2 rounded ml-1 bg-[#FFD600]/5 hover:bg-[#FFD600]/20"
                                  >
                                    {p.findingId.toUpperCase()}
                                  </button>
                                )}
                              </div>
                            </div>
                          ))
                        ) : (
                          run?.proposal?.reasoning?.map((r: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-2">
                              <Check size={13} className="text-[#22c55e] shrink-0 mt-0.5" />
                              <div className="font-mono text-[11px] leading-normal text-[#888888]">
                                <span>{r.reason} </span>
                                {r.finding_ids?.map((fId: string) => (
                                  <button 
                                    key={fId}
                                    onClick={() => {
                                      setExpandedFindingId(fId);
                                      // Scroll to finding
                                      document.getElementById(`finding-${fId}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                    }}
                                    className="inline-flex items-center text-[9px] uppercase tracking-wider font-bold text-[#FFD600] border border-[#FFD600]/25 px-1 py-0.2 rounded ml-1 bg-[#FFD600]/5 hover:bg-[#FFD600]/20"
                                  >
                                    {fId}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Rejected Alternatives Section */}
                  <div className={`bg-[#0F0F0F] border rounded-lg p-5 flex flex-col justify-between transition-all ${
                    showAlternativeSelector ? 'border-[#FF6B35]' : 'border-[#2D2D2D]'
                  }`}>
                    <div>
                      <div className="flex justify-between items-start mb-3">
                        <span className="font-mono text-[9px] text-[#FF6B35] border border-[#FF6B35]/30 bg-[#FF6B35]/5 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
                          Rejected Alternatives
                        </span>
                      </div>
                      
                      <div className="border-t border-[#1D1D1D] pt-3 flex flex-col gap-3 font-mono text-[11px]">
                        {dataSource === 'mock' ? (
                          MOCK_PROPOSALS.filter(p => !p.isChosen).map(alt => (
                            <div key={alt.id} className="text-[#888888]">
                              <div className="flex justify-between text-xs font-bold text-[#F5F5F0] mb-1">
                                <span>{alt.name}</span>
                                <span className="text-[#FF6B35]">{alt.price}</span>
                              </div>
                              <p className="text-[10px] leading-relaxed text-[#FF6B35]/90 italic">
                                {alt.points[0].text}
                              </p>
                            </div>
                          ))
                        ) : (
                          run?.proposal?.alternatives?.map((alt: any, idx: number) => (
                            <div key={idx} className="text-[#888888] border-b border-[#141414] pb-2 last:border-b-0">
                              <div className="flex justify-between text-xs font-bold text-[#F5F5F0] mb-1">
                                <span>{alt.provider} {alt.plan}</span>
                                <span className="text-[#FF6B35]">${alt.price}/mo</span>
                              </div>
                              <p className="text-[10px] leading-relaxed text-[#888888] italic">
                                {alt.why_rejected}
                              </p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {showAlternativeSelector && (
                      <div className="mt-4 pt-3 border-t border-[#2D2D2D] flex flex-col gap-2">
                        <p className="font-mono text-[9px] text-[#FF6B35] uppercase">
                          Warning: Overriding the recommendation violates traceability validation checks.
                        </p>
                        <button 
                          onClick={() => handleSubmitDecision('rejected')}
                          className="font-grotesk text-[9px] font-bold text-[#0A0A0A] bg-[#FF6B35] hover:bg-[#F5F5F0] px-4 py-2 transition-colors uppercase tracking-wider w-full"
                        >
                          Force select and reject recommended
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons (Only in Approval Mode) */}
              {mode === 'approval' && (
                <div className="flex flex-col gap-4 border-t border-[#1D1D1D] pt-6">
                  {hasRejected && !showAlternativeSelector && (
                    <div className="bg-[#FF6B35]/5 border border-[#FF6B35]/20 p-4 rounded text-center font-mono text-[11px] text-[#FF6B35]">
                      No purchase made. Session terminated due to rejection.
                      <button 
                        onClick={handleRestart}
                        className="ml-3 font-bold underline cursor-pointer hover:text-[#F5F5F0]"
                      >
                        Restart Scan Flow
                      </button>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <button 
                      onClick={() => setScreen(3)}
                      className="font-grotesk text-[10px] font-bold text-[#888888] hover:text-[#F5F5F0] bg-transparent border border-[#2D2D2D] px-5 py-2.5 transition-colors uppercase tracking-wider rounded-sm"
                    >
                      Back
                    </button>
                    
                    {!hasRejected && (
                      <div className="flex gap-2.5">
                        <button 
                          onClick={() => setShowAlternativeSelector(prev => !prev)}
                          className="font-grotesk text-[10px] font-bold text-[#FF6B35] border border-[#FF6B35]/30 hover:bg-[#FF6B35]/5 px-5 py-2.5 transition-colors uppercase tracking-wider rounded-sm"
                        >
                          {showAlternativeSelector ? "Cancel Override" : "Reject Proposal"}
                        </button>
                        <button 
                          onClick={() => handleSubmitDecision('approved')}
                          className="font-grotesk text-[10px] font-bold text-[#0A0A0A] bg-[#FFD600] hover:bg-[#F5F5F0] px-6 py-2.5 transition-colors uppercase tracking-wider rounded-sm"
                        >
                          Approve Recommended Plan
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* SCREEN 5: RULES LAYER CHECK */}
          {screen === 5 && (
            <motion.div 
              key="screen-5"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full max-w-xl mx-auto flex flex-col"
            >
              <div className="text-center mb-8">
                <span className="font-mono text-[9px] text-[#FFD600] tracking-[3px] uppercase block mb-1">Security Audit</span>
                <h2 className="font-grotesk text-2xl font-bold uppercase tracking-wider text-[#F5F5F0]">
                  Rules Layer Verification
                </h2>
                <p className="font-mono text-[9px] text-[#555555] uppercase mt-1">
                  Validating purchase metadata against deterministic compliance filters
                </p>
              </div>

              {/* Rules Cards */}
              <div className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-6 mb-6 flex flex-col gap-4 font-mono text-xs">
                {dataSource === 'mock' ? (
                  /* Mock rules rendering */
                  MOCK_RULES_CHECKS.map((check, idx) => {
                    const localCheck = rulesStatus[idx];
                    const isPending = !localCheck || localCheck.status === 'pending';
                    const isSuccess = localCheck && localCheck.status === 'success';
                    const isFailed = localCheck && localCheck.status === 'failed';
                    const isActive = idx === rulesCheckIndex + 1 && isRulesCheckRunning;

                    return (
                      <div 
                        key={check.id}
                        className={`flex items-center justify-between p-3 border rounded transition-colors ${
                          isFailed 
                            ? 'border-[#FF6B35]/30 bg-[#FF6B35]/5 text-[#FF6B35]' 
                            : isSuccess 
                              ? 'border-[#22c55e]/20 bg-[#22c55e]/5 text-[#F5F5F0]' 
                              : isActive 
                                ? 'border-[#FFD600] bg-[#FFD600]/5 text-[#F5F5F0]'
                                : 'border-[#1D1D1D] text-[#555555]'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] shrink-0">
                            {isSuccess && <Check size={11} className="text-[#22c55e] stroke-[3px]" />}
                            {isFailed && <span className="text-[#FF6B35] font-bold">!</span>}
                            {isPending && !isActive && <span className="text-[#444]">-</span>}
                            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-[#FFD600] animate-ping" />}
                          </div>
                          <span className={`font-bold tracking-wide uppercase ${isSuccess ? 'text-[#F5F5F0]' : ''}`}>
                            {check.title}
                          </span>
                        </div>
                        <div className={`text-[11px] ${isSuccess ? 'text-[#22c55e]' : isFailed ? 'text-[#FF6B35]' : 'text-[#888888]'}`}>
                          {isFailed ? 'limit exceeded halt' : check.detail}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  /* Real rules checks rendering */
                  run?.rules?.checks?.map((check: any) => {
                    const isSuccess = check.passed === true;
                    return (
                      <div 
                        key={check.rule}
                        className={`flex items-center justify-between p-3 border rounded transition-colors ${
                          isSuccess 
                            ? 'border-[#22c55e]/20 bg-[#22c55e]/5 text-[#F5F5F0]' 
                            : 'border-[#FF6B35]/30 bg-[#FF6B35]/5 text-[#FF6B35]' 
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-5 h-5 rounded-full flex items-center justify-center border text-[10px] shrink-0">
                            {isSuccess ? (
                              <Check size={11} className="text-[#22c55e] stroke-[3px]" />
                            ) : (
                              <span className="text-[#FF6B35] font-bold">!</span>
                            )}
                          </div>
                          <span className={`font-bold tracking-wide uppercase ${isSuccess ? 'text-[#F5F5F0]' : ''}`}>
                            {check.rule.replace("-", " ")}
                          </span>
                        </div>
                        <div className={`text-[11px] ${isSuccess ? 'text-[#22c55e]' : 'text-[#FF6B35]'}`}>
                          {check.detail}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Prava Payment Session Button */}
                {dataSource === 'real' && run?.payment_url && run.state === 'executing' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-t border-[#1D1D1D] pt-5 mt-2 text-center"
                  >
                    {mode === 'autonomy' && (
                      <div className="font-mono text-[10px] text-[#888888] bg-[#0A0A0A] border border-[#2D2D2D] rounded p-3.5 mb-4 text-left leading-relaxed">
                        <span className="text-[#FFD600] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-1">
                          <Zap size={11} /> Full autonomy — the decision is already made
                        </span>
                        The agent approved this purchase itself, inside your ${limit} cap.
                        The passkey step below is <span className="text-[#F5F5F0]">Prava&apos;s payment security</span> —
                        it releases the money; it is not an approval screen.
                      </div>
                    )}
                    <span className="font-mono text-[10px] text-[#FFD600] tracking-wider uppercase block mb-3 animate-pulse">
                      {mode === 'autonomy' ? 'Passkey required to release funds' : 'Prava Payment Gateway Ready'}
                    </span>
                    <a
                      href={run.payment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 font-grotesk text-[11px] font-bold text-[#0A0A0A] bg-[#FFD600] hover:bg-[#F5F5F0] px-8 py-3.5 transition-colors uppercase tracking-wider rounded-sm shadow-lg shadow-[#FFD600]/10"
                    >
                      {mode === 'autonomy' ? 'Authorize with passkey' : 'Complete payment via Prava'}
                      <ExternalLink size={13} />
                    </a>
                    <span className="font-mono text-[9px] text-[#555] block mt-2">
                      (Opens sandbox interface in a new window)
                    </span>
                  </motion.div>
                )}

                {/* Mock payment steps */}
                {dataSource === 'mock' && paymentStep && (
                  <motion.div 
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="border-t border-[#1D1D1D] pt-4 mt-2 text-center text-[11px] font-bold tracking-wider uppercase text-[#FFD600]"
                  >
                    {paymentStep}
                  </motion.div>
                )}
              </div>

              {/* Halted Variant UI */}
              {(haltedAtCheck !== null || (dataSource === 'real' && run?.state === 'halted')) && (
                <div className="bg-[#FF6B35]/5 border border-[#FF6B35]/30 rounded-lg p-5 mb-6 text-left">
                  <div className="flex items-center gap-2 text-[#FF6B35] font-grotesk text-xs font-bold uppercase tracking-wider">
                    <ShieldAlert size={16} />
                    Audit Halted: Compliance Failure
                  </div>
                  <p className="font-mono text-[10px] text-[#888888] mt-2 leading-relaxed">
                    {dataSource === 'mock' 
                      ? "Proposed plan amount is $20/mo, but the checkout returned a checkout total of $24/mo due to regional taxes. Nothing was charged."
                      : run?.receipt?.halt_reason || "Check parameter constraints failed limit compliance check."
                    }
                  </p>
                  <div className="flex gap-2.5 mt-4">
                    <button 
                      onClick={dataSource === 'mock' ? runMockRulesCheckSequence : () => pollRun(runId!)}
                      className="font-grotesk text-[9px] font-bold text-[#0A0A0A] bg-[#FFD600] hover:bg-[#F5F5F0] px-4 py-2 transition-colors uppercase tracking-wider"
                    >
                      {dataSource === 'mock' ? 'Retry' : 'Refresh'}
                    </button>
                    <button 
                      onClick={handleRestart}
                      className="font-grotesk text-[9px] font-bold text-[#888888] hover:text-[#F5F5F0] border border-[#2D2D2D] px-4 py-2 transition-colors uppercase tracking-wider"
                    >
                      Restart Flow
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* SCREEN 6: FINAL REPORT / RECEIPT */}
          {screen === 6 && (
            <motion.div 
              key="screen-6"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              className="w-full flex flex-col max-w-2xl mx-auto"
            >
              <div className="flex items-center gap-2 mb-6">
                <CheckCircle2 className="text-[#22c55e]" size={20} />
                <h2 className="font-grotesk text-lg md:text-xl font-bold tracking-wide uppercase text-[#F5F5F0]">
                  Session Completed Successfully
                </h2>
              </div>

              {/* Single Scrollable Receipt container */}
              <div className="bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg p-6 md:p-8 flex flex-col gap-6 max-h-[70vh] overflow-y-auto">
                {/* 1. Transaction Receipt */}
                <div className="border-b border-[#2D2D2D] pb-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="font-mono text-[9px] text-[#555] uppercase block mb-0.5">
                        Payment Gateway: Prava tokenized API
                      </span>
                      <span className="font-grotesk text-base font-bold text-[#F5F5F0]">
                        Infrastructure Purchase Receipt
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-[9px] text-[#555] uppercase block">Confirmation No</span>
                      <span className="font-mono text-[11px] text-[#FFD600] font-bold">
                        {dataSource === 'mock' 
                          ? "#PRV-849-0182" 
                          : run?.receipt?.confirmation_id || `#PRV-${runId?.toUpperCase()}`
                        }
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mt-4 font-mono text-[11px] text-[#888888]">
                    <div>
                      <span className="text-[#555] block uppercase text-[9px]">Purchased Resource</span>
                      <span className="text-[#F5F5F0]">
                        {dataSource === 'mock' 
                          ? (chosenProposalId === 'p-chosen' ? 'Railway Pro Plan' : 'Vercel Serverless Plan')
                          : `${run?.proposal?.recommended?.provider} ${run?.proposal?.recommended?.plan}`
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-[#555] block uppercase text-[9px]">Transaction Date</span>
                      <span className="text-[#F5F5F0]">
                        {dataSource === 'mock' 
                          ? new Date().toISOString().split('T')[0]
                          : run?.receipt?.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-[#555] block uppercase text-[9px]">Category Lock</span>
                      <span className="text-[#F5F5F0]">{category}</span>
                    </div>
                    <div>
                      <span className="text-[#555] block uppercase text-[9px]">Billing Charge</span>
                      <span className="text-[#FFD600] font-bold">
                        {dataSource === 'mock' 
                          ? (chosenProposalId === 'p-chosen' ? '$20.00 /mo' : '$0.00 /mo')
                          : `$${run?.proposal?.recommended?.price} / ${run?.proposal?.recommended?.billing_cycle}`
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. Compiled Findings list */}
                <div>
                  <h3 className="font-mono text-[10px] text-[#555] uppercase tracking-wider mb-3">Linked Infrastructure Signals</h3>
                  <div className="flex flex-col gap-2">
                    {activeFindings.map((finding, fIdx) => (
                      <div key={`${finding.id}-${fIdx}`} className="flex justify-between items-center p-3 bg-[#0A0A0A] border border-[#1D1D1D] rounded font-mono text-xs text-[#888888]">
                        <span className="text-[#F5F5F0] font-medium">{finding.title}</span>
                        <ConfidenceBadge tag={finding.tag as any} />
                      </div>
                    ))}
                    {activeFindings.length === 0 && (
                      <span className="font-mono text-xs text-[#555] italic">No findings linked to session setup.</span>
                    )}
                  </div>
                </div>

                {/* 3. Compliance Audits */}
                <div className="border-t border-[#2D2D2D] pt-5">
                  <h3 className="font-mono text-[10px] text-[#555] uppercase tracking-wider mb-3">Compliance Audits</h3>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#888888]">
                    <div className="flex items-center gap-1.5"><Check size={11} className="text-[#22c55e]" /> Spend ceiling verified</div>
                    <div className="flex items-center gap-1.5"><Check size={11} className="text-[#22c55e]" /> Price match verified</div>
                    <div className="flex items-center gap-1.5"><Check size={11} className="text-[#22c55e]" /> Category locked</div>
                    <div className="flex items-center gap-1.5"><Check size={11} className="text-[#22c55e]" /> Finding tracing verified</div>
                  </div>
                </div>
              </div>

              {/* Restart session button */}
              <button 
                onClick={handleRestart}
                className="font-grotesk text-[10px] font-bold text-[#0A0A0A] bg-[#FFD600] hover:bg-[#F5F5F0] px-6 py-3.5 transition-colors uppercase tracking-wider rounded-sm mt-6 flex items-center justify-center gap-2 self-end"
              >
                <RotateCcw size={12} />
                Restart Demo Sequence
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* FLOATING DEMO CONTROL PANEL — mock walkthrough only, never in real runs */}
      {dataSource === 'mock' && (
      <div className={`fixed bottom-4 right-4 z-50 bg-[#0F0F0F] border border-[#2D2D2D] rounded-lg shadow-2xl overflow-hidden transition-all duration-300 w-[240px] flex flex-col font-mono text-[10px] ${
        isDemoPanelOpen ? 'max-h-[380px]' : 'max-h-[34px]'
      }`}>
        {/* Panel Header */}
        <div 
          onClick={() => setIsDemoPanelOpen(!isDemoPanelOpen)}
          className="flex items-center justify-between px-3 py-2 bg-[#141414] border-b border-[#2D2D2D] cursor-pointer"
        >
          <div className="flex items-center gap-1.5 font-bold uppercase text-[#FFD600] tracking-wider text-[9px]">
            <Settings size={12} className="animate-spin" style={{ animationDuration: '6s' }} />
            Demo Controls
          </div>
          <span className="text-[#555] font-bold hover:text-[#F5F5F0] transition-colors text-[9px] uppercase">
            {isDemoPanelOpen ? 'Collapse' : 'Expand'}
          </span>
        </div>

        {/* Panel Content */}
        {isDemoPanelOpen && (
          <div className="p-3 flex flex-col gap-3.5 bg-[#0F0F0F] text-[#888888] select-text">
            {/* Screen jump links */}
            <div>
              <span className="text-[#555] uppercase font-bold text-[8px] tracking-wider block mb-1.5">Direct Screen Jump</span>
              <div className="grid grid-cols-4 gap-1">
                {[0, 1, 2, 3, 4, 5, 6].map((num) => (
                  <button
                    key={num}
                    onClick={() => {
                      setScreen(num);
                      if (num === 4) {
                        setHasRejected(false);
                        setShowAlternativeSelector(false);
                      }
                    }}
                    className={`p-1 text-center font-bold border transition-colors ${
                      screen === num 
                        ? 'border-[#FFD600] bg-[#FFD600]/10 text-[#FFD600]' 
                        : 'border-[#2D2D2D] hover:border-[#F5F5F0] hover:text-[#F5F5F0]'
                    }`}
                  >
                    S{num}
                  </button>
                ))}
              </div>
            </div>

            {/* Config details */}
            <div className="border-t border-[#1D1D1D] pt-2">
              <span className="text-[#555] uppercase font-bold text-[8px] tracking-wider block mb-1.5">State Config</span>
              <div className="flex flex-col gap-1 text-[9px]">
                <div className="flex justify-between">
                  <span>Data Source:</span>
                  <span className="text-[#FFD600] uppercase font-bold">{dataSource}</span>
                </div>
                <div className="flex justify-between">
                  <span>Limit:</span>
                  <span className="text-[#F5F5F0]">${limit}</span>
                </div>
                <div className="flex justify-between">
                  <span>Mode:</span>
                  <span className="text-[#FFD600] uppercase font-bold">{mode}</span>
                </div>
                <div className="flex justify-between">
                  <span>Repo:</span>
                  <span className="text-[#F5F5F0] truncate max-w-[120px]">{getRepoName()}</span>
                </div>
              </div>
            </div>

            {/* Test Variant Toggles */}
            <div className="border-t border-[#1D1D1D] pt-2">
              <span className="text-[#555] uppercase font-bold text-[8px] tracking-wider block mb-1.5">Toggle Mock Variants</span>
              <div className="flex flex-col gap-2 text-[9px]">
                {/* Low confidence */}
                <label className="flex items-center gap-2 cursor-pointer text-[#888888] hover:text-[#F5F5F0] select-none">
                  <input
                    type="checkbox"
                    checked={varLowConfidence}
                    onChange={(e) => setVarLowConfidence(e.target.checked)}
                    className="accent-[#FFD600]"
                  />
                  <span>Low-Confidence Variant</span>
                </label>

                {/* Zero findings */}
                <label className="flex items-center gap-2 cursor-pointer text-[#888888] hover:text-[#F5F5F0] select-none">
                  <input
                    type="checkbox"
                    checked={varZeroFindings}
                    onChange={(e) => setVarZeroFindings(e.target.checked)}
                    className="accent-[#FFD600]"
                  />
                  <span>Zero Findings State</span>
                </label>

                {/* Halt-state */}
                <label className="flex items-center gap-2 cursor-pointer text-[#888888] hover:text-[#F5F5F0] select-none">
                  <input
                    type="checkbox"
                    checked={varHaltState}
                    onChange={(e) => setVarHaltState(e.target.checked)}
                    className="accent-[#FFD600]"
                  />
                  <span>Halt-State (Check 2 fail)</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Code Evidence Viewer Modal */}
      {selectedFindingForModal && (
        <CodeViewerModal
          isOpen={true}
          onClose={() => setSelectedFindingForModal(null)}
          fileName={selectedFindingForModal.fileName || ''}
          codeSnippet={selectedFindingForModal.codeSnippet || ''}
          highlightLines={selectedFindingForModal.highlightLines}
        />
      )}
    </div>
  );
}
