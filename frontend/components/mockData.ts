export interface FileNode {
  name: string;
  type: 'file' | 'dir';
  children?: FileNode[];
  path: string;
}

export interface ScanLog {
  file: string;
  lines: string[];
}

export interface Finding {
  id: string;
  title: string;
  tag: 'derived' | 'derived-from-code' | 'inferred' | 'user-provided' | 'assumption';
  evidence?: string;
  fileName?: string;
  codeSnippet?: string;
  highlightLines?: number[];
  reasoning?: string;
}

export interface ProposalPlan {
  id: string;
  name: string;
  price: string;
  isChosen: boolean;
  points: {
    text: string;
    findingId?: string;
    isCompatible: boolean;
    tag?: 'derived' | 'derived-from-code' | 'inferred' | 'user-provided' | 'assumption';
  }[];
}

export interface RuleCheck {
  id: string;
  title: string;
  detail: string;
  status: 'pending' | 'success' | 'failed';
}

export const MOCK_REPOS = [
  { id: '1', name: 'express-postgres-socketio-app', desc: 'Node.js backend with real-time websocket updates and PostgreSQL storage', path: 'demo-repo' },
  { id: '2', name: 'python-flask-sqlite-api', desc: 'Lightweight REST API using Flask and SQLite database', path: 'python-repo' }
];

export const MOCK_FILE_TREE: FileNode[] = [
  { name: 'package.json', type: 'file', path: 'package.json' },
  { name: 'server.js', type: 'file', path: 'server.js' },
  {
    name: 'src',
    type: 'dir',
    path: 'src',
    children: [
      { name: 'db.js', type: 'file', path: 'src/db.js' },
      { name: 'config.js', type: 'file', path: 'src/config.js' },
      {
        name: 'routes',
        type: 'dir',
        path: 'src/routes',
        children: [
          { name: 'auth.js', type: 'file', path: 'src/routes/auth.js' },
          { name: 'users.js', type: 'file', path: 'src/routes/users.js' }
        ]
      },
      {
        name: 'migrations',
        type: 'dir',
        path: 'src/migrations',
        children: [
          { name: '0001_init.sql', type: 'file', path: 'src/migrations/0001_init.sql' },
          { name: '0002_add_sessions.sql', type: 'file', path: 'src/migrations/0002_add_sessions.sql' }
        ]
      }
    ]
  }
];

export const SCAN_LOGS: ScanLog[] = [
  {
    file: 'package.json',
    lines: [
      'Reading package.json...',
      '→ Found dependency: express',
      '→ Found dependency: pg (PostgreSQL driver)',
      '→ Found dependency: socket.io (Websockets)'
    ]
  },
  {
    file: 'server.js',
    lines: [
      'Reading server.js...',
      '→ HTTP Server wrapper detected on line 5',
      '→ Websocket server detected at line 12 (socket.io)',
      '→ Long-running process server.listen detected'
    ]
  },
  {
    file: 'src/db.js',
    lines: [
      'Reading src/db.js...',
      '→ Found pg connection Pool setup',
      '→ Database environment variable DATABASE_URL referenced'
    ]
  },
  {
    file: 'src/config.js',
    lines: [
      'Reading src/config.js...',
      '→ Environment variables loaded via dotenv',
      '→ Port configured via process.env.PORT || 3000'
    ]
  },
  {
    file: 'src/routes/auth.js',
    lines: [
      'Reading src/routes/auth.js...',
      '→ Scanning Auth routes. No special infrastructure required'
    ]
  },
  {
    file: 'src/routes/users.js',
    lines: [
      'Reading src/routes/users.js...',
      '→ Scanning Users routes. No special infrastructure required'
    ]
  },
  {
    file: 'src/migrations/0001_init.sql',
    lines: [
      'Reading src/migrations/0001_init.sql...',
      '→ Schema DDL commands detected. SQL tables setup matches relational schema'
    ]
  },
  {
    file: 'src/migrations/0002_add_sessions.sql',
    lines: [
      'Reading src/migrations/0002_add_sessions.sql...',
      '→ SQL table alter statements found. Relational structure confirmed'
    ]
  }
];

export const NORMAL_FINDINGS: Finding[] = [
  {
    id: 'f1',
    title: 'Database: PostgreSQL',
    tag: 'derived-from-code',
    evidence: 'pg dependency + migrations/ folder found in package.json',
    fileName: 'package.json',
    codeSnippet: `{
  "name": "express-socket-io-app",
  "version": "1.0.0",
  "dependencies": {
    "express": "^4.18.2",
    "pg": "^8.11.3",
    "socket.io": "^4.7.2"
  }
}`,
    highlightLines: [5, 6]
  },
  {
    id: 'f2',
    title: 'Websockets Support',
    tag: 'derived-from-code',
    evidence: 'Websocket server detected at line 12 in server.js',
    fileName: 'server.js',
    codeSnippet: `const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on('connection', (socket) => {
  console.log('client connected:', socket.id);
});`,
    highlightLines: [3, 7, 8, 9]
  },
  {
    id: 'f3',
    title: 'Database Connection Pool config',
    tag: 'inferred',
    evidence: 'process.env.DATABASE_URL check in src/db.js requires connection pooling setup',
    fileName: 'src/db.js',
    codeSnippet: `const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

module.exports = pool;`,
    highlightLines: [4, 5, 6, 7]
  },
  {
    id: 'f4',
    title: 'Persistent Server Environment',
    tag: 'derived-from-code',
    evidence: 'Persistent connection listener required due to websocket listener in server.js',
    fileName: 'server.js',
    codeSnippet: `io.on('connection', (socket) => {
  console.log('client connected:', socket.id);
});

server.listen(process.env.PORT || 3000, () => {
  console.log('Server is running');
});`,
    highlightLines: [5, 6, 7]
  },
  {
    id: 'f5',
    title: 'SSL Certificate Policy',
    tag: 'assumption',
    reasoning: 'No direct code evidence — judgment call based on auth cookie validation paths which require secure SSL endpoints in production.'
  }
];

export const LOW_CONFIDENCE_FINDINGS: Finding[] = [
  {
    id: 'f1',
    title: 'Database: PostgreSQL',
    tag: 'assumption',
    reasoning: 'No direct database connection setup seen, assumed Postgres based on migrations folder structures.'
  },
  {
    id: 'f2',
    title: 'Websockets Support',
    tag: 'assumption',
    reasoning: 'No direct WebSocket config found, assumed websocket usage based on dependencies analysis.'
  },
  {
    id: 'f3',
    title: 'Database Connection Pool config',
    tag: 'assumption',
    reasoning: 'No connection pool configuration code detected, assumed default pool size of 20.'
  },
  {
    id: 'f4',
    title: 'Persistent Server Environment',
    tag: 'assumption',
    reasoning: 'No server listen configuration found, assuming server hosting type matches Node default.'
  },
  {
    id: 'f5',
    title: 'SSL Certificate Policy',
    tag: 'assumption',
    reasoning: 'No security setup seen, assuming automated SSL certificate provisioning.'
  }
];

export const PROPOSALS: ProposalPlan[] = [
  {
    id: 'p-chosen',
    name: 'Railway Pro',
    price: '$20/mo',
    isChosen: true,
    points: [
      { text: 'Supports persistent websocket server connections', findingId: 'f4', isCompatible: true, tag: 'derived-from-code' },
      { text: 'Includes managed PostgreSQL database provisioning', findingId: 'f1', isCompatible: true, tag: 'derived-from-code' },
      { text: 'Automatic SSL provisioned by default', findingId: 'f5', isCompatible: true, tag: 'assumption' }
    ]
  },
  {
    id: 'p-rejected',
    name: 'Vercel Serverless',
    price: '$0/mo',
    isChosen: false,
    points: [
      { text: 'Kills idle connections after 10s — incompatible with websockets', findingId: 'f4', isCompatible: false, tag: 'derived-from-code' },
      { text: 'Does not provision native SQL database hosting directly', findingId: 'f1', isCompatible: false, tag: 'derived-from-code' }
    ]
  }
];

export const RULES_CHECKS: RuleCheck[] = [
  { id: 'c1', title: 'Spend ceiling', detail: '$20 ≤ $50 limit', status: 'pending' },
  { id: 'c2', title: 'Price match', detail: 'charge == approved', status: 'pending' },
  { id: 'c3', title: 'Category lock', detail: 'hosting only', status: 'pending' },
  { id: 'c4', title: 'Traceability', detail: 'linked to finding #4', status: 'pending' }
];
