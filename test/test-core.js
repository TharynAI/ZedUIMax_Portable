/**
 * test-core.js - Test core functionality of ZedUI
 *
 * Run with: node test/test-core.js
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const PROJECT_ROOT = path.resolve(__dirname, '..');

// Colors for output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    passed++;
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}${error.message}${RESET}`);
    failed++;
  }
}

function skip(name, reason) {
  console.log(`${YELLOW}↷${RESET} ${name}`);
  console.log(`  ${YELLOW}${reason}${RESET}`);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function isNativeAbiMismatch(error) {
  return error && /NODE_MODULE_VERSION|ERR_DLOPEN_FAILED|different Node\.js version/.test(String(error.message || error));
}

console.log('\n=== ZedUI Core Tests ===\n');

// Test 1: Session Store Module
test('Session store module loads', () => {
  const sessionStore = require('../dist/main/main/session-store.js');
  assert(sessionStore.getAllProjects, 'getAllProjects function exists');
  assert(sessionStore.getSessions, 'getSessions function exists');
  assert(sessionStore.getSessionDetails, 'getSessionDetails function exists');
});

// Test 2: Metadata DB Module
test('Metadata DB module loads', () => {
  const metadataDb = require('../dist/main/main/metadata-db.js');
  assert(metadataDb.initDb, 'initDb function exists');
  assert(metadataDb.getAnnotation, 'getAnnotation function exists');
  assert(metadataDb.setAnnotation, 'setAnnotation function exists');
  assert(metadataDb.toggleFavorite, 'toggleFavorite function exists');
});

// Test 3: Launcher Module
test('Launcher module loads', () => {
  const launcher = require('../dist/main/main/launcher.js');
  assert(launcher.continueSession, 'continueSession function exists');
  assert(launcher.newSession, 'newSession function exists');
});

// Test 4: Claude Projects Directory
test('Claude projects directory exists', () => {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects');
  assert(fs.existsSync(projectsDir), `Projects dir exists at ${projectsDir}`);
});

// Test 5: Get All Projects
test('Can retrieve projects', () => {
  const sessionStore = require('../dist/main/main/session-store.js');
  const projects = sessionStore.getAllProjects();
  assert(Array.isArray(projects), 'Projects is an array');
  console.log(`  ${YELLOW}Found ${projects.length} projects${RESET}`);
});

// Test 6: Get Sessions
test('Can retrieve sessions', () => {
  const sessionStore = require('../dist/main/main/session-store.js');
  const sessions = sessionStore.getSessions(undefined, 30, 10);
  assert(Array.isArray(sessions), 'Sessions is an array');
  console.log(`  ${YELLOW}Found ${sessions.length} sessions (last 30 days, limit 10)${RESET}`);

  if (sessions.length > 0) {
    const first = sessions[0];
    assert(first.sessionId, 'Session has sessionId');
    assert(first.projectDisplay, 'Session has projectDisplay');
    assert(first.timestamp, 'Session has timestamp');
    console.log(`  ${YELLOW}Latest session: ${first.sessionId.slice(0, 8)}... from ${first.projectDisplay}${RESET}`);
  }
});

// Test 7: Initialize Database
test('Can initialize metadata database', () => {
  const metadataDb = require('../dist/main/main/metadata-db.js');
  try {
    metadataDb.initDb();
  } catch (error) {
    if (isNativeAbiMismatch(error)) {
      skip('Can initialize metadata database', 'Skipped under Node because better-sqlite3 is currently built for Electron. Launching the app rebuilds it for Electron automatically.');
      return;
    }
    throw error;
  }

  const dbPath = path.join(PROJECT_ROOT, 'data', 'zedui.db');
  assert(fs.existsSync(dbPath), `Database created at ${dbPath}`);
});

// Test 8: Database Operations
test('Can perform database operations', () => {
  const metadataDb = require('../dist/main/main/metadata-db.js');

  // Test set/get annotation
  const testId = 'test-session-' + Date.now();
  let annotation;
  try {
    annotation = metadataDb.setAnnotation(testId, {
      userSummary: 'Test summary',
      notes: 'Test notes',
      type: 'test-type'
    });
  } catch (error) {
    if (isNativeAbiMismatch(error)) {
      skip('Can perform database operations', 'Skipped under Node because better-sqlite3 is currently built for Electron. Launching the app rebuilds it for Electron automatically.');
      return;
    }
    throw error;
  }

  assert(annotation, 'Annotation created');
  assert(annotation.userSummary === 'Test summary', 'Summary matches');
  assert(annotation.type === 'test-type', 'Type matches');

  // Test toggle favorite
  const isFavorite = metadataDb.toggleFavorite(testId);
  assert(isFavorite === true, 'Favorite toggled on');

  const isFavorite2 = metadataDb.toggleFavorite(testId);
  assert(isFavorite2 === false, 'Favorite toggled off');

  // Test tags
  const tags = metadataDb.addTags(testId, ['tag1', 'tag2']);
  assert(tags.includes('tag1'), 'Tag1 added');
  assert(tags.includes('tag2'), 'Tag2 added');

  // Cleanup
  metadataDb.deleteAnnotation(testId);
});

// Test 9: Renderer Build
test('Renderer build exists', () => {
  const rendererDir = path.join(PROJECT_ROOT, 'dist', 'renderer');
  assert(fs.existsSync(rendererDir), 'Renderer dist directory exists');
  assert(fs.existsSync(path.join(rendererDir, 'index.html')), 'index.html exists');
});

// Test 10: Main Process Build
test('Main process build exists', () => {
  const mainDir = path.join(PROJECT_ROOT, 'dist', 'main', 'main');
  assert(fs.existsSync(mainDir), 'Main dist directory exists');
  assert(fs.existsSync(path.join(mainDir, 'index.js')), 'index.js exists');
  assert(fs.existsSync(path.join(mainDir, 'preload.js')), 'preload.js exists');
});

// Summary
console.log('\n=== Test Summary ===');
console.log(`${GREEN}Passed: ${passed}${RESET}`);
if (failed > 0) {
  console.log(`${RED}Failed: ${failed}${RESET}`);
} else {
  console.log(`${GREEN}All tests passed!${RESET}`);
}
console.log('');

process.exit(failed > 0 ? 1 : 0);
