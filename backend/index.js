const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Database = require('better-sqlite3');
// Use dynamic import for node-fetch in CommonJS
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || ['http://localhost:5173', 'http://localhost:3000'],
    methods: ['GET', 'POST']
  }
});

const db = new Database('quiz.db');

db.exec(`
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  facilitator TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  name TEXT,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  participant_id TEXT,
  name TEXT,
  score INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);

function saveSession(sessionCode, facilitator) {
  db.prepare('INSERT OR IGNORE INTO sessions (id, facilitator) VALUES (?, ?)').run(sessionCode, facilitator);
}
function saveParticipant(sessionCode, id, name) {
  db.prepare('INSERT OR IGNORE INTO participants (id, session_id, name) VALUES (?, ?, ?)').run(id, sessionCode, name);
}
function saveResults(sessionCode, scores) {
  const stmt = db.prepare('INSERT INTO results (session_id, participant_id, name, score) VALUES (?, ?, ?, ?)');
  for (const s of scores) {
    stmt.run(sessionCode, s.id, s.name, s.score);
  }
}

app.use(cors({
  origin: process.env.FRONTEND_URL || ['http://localhost:5173', 'http://localhost:3000']
}));
app.use(express.json());

app.get('/', (req, res) => {
  res.send('Quiz backend is running!');
});

// In-memory session storage
const sessions = {}; // { sessionCode: { facilitator: socket.id, participants: [], quizState: {} } }

function generateSessionCode(length = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Example quiz questions (in a real app, these would be dynamic or from DB)
const sampleQuestions = [
  { question: 'What is the capital of France?', options: ['Paris', 'London', 'Berlin', 'Rome'], answer: 0 },
  { question: 'What is 2 + 2?', options: ['3', '4', '5', '6'], answer: 1 },
  { question: 'What color is the sky?', options: ['Blue', 'Green', 'Red', 'Yellow'], answer: 0 },
];

const QUESTION_TIMER_SECONDS = 20;

// Store timers per session
const sessionTimers = {};

function startQuestionTimer(sessionCode) {
  const session = sessions[sessionCode];
  if (!session || !session.quizState) return;
  let timeLeft = QUESTION_TIMER_SECONDS;
  // Clear any existing timer
  if (sessionTimers[sessionCode]) {
    clearInterval(sessionTimers[sessionCode]);
  }
  // Emit initial timer value
  io.to(sessionCode).emit('timer', { timeLeft });
  sessionTimers[sessionCode] = setInterval(() => {
    timeLeft--;
    io.to(sessionCode).emit('timer', { timeLeft });
    if (timeLeft <= 0) {
      clearInterval(sessionTimers[sessionCode]);
      // Auto-advance to next question or end quiz
      const quiz = session.quizState;
      quiz.currentQuestion++;
      if (quiz.currentQuestion >= quiz.questions.length) {
        io.to(sessionCode).emit('quizEnded');
      } else {
        const q = quiz.questions[quiz.currentQuestion];
        io.to(sessionCode).emit('question', {
          index: quiz.currentQuestion,
          question: q.question,
          options: q.options,
        });
        // Reset participant status for new question
        emitParticipantStatus(sessionCode);
        startQuestionTimer(sessionCode);
      }
    }
  }, 1000);
}

// Helper to emit participant list with answer status
function emitParticipantStatus(sessionCode) {
  const session = sessions[sessionCode];
  if (!session) return;
  const quiz = session.quizState;
  const answeredIds = quiz && quiz.answers ? Object.keys(quiz.answers).filter(id => quiz.answers[id][quiz.currentQuestion] !== undefined) : [];
  const participants = session.participants.map(p => ({
    id: p.id,
    name: p.name,
    answered: answeredIds.includes(p.id),
    isFacilitator: session.facilitator === p.id,
  }));
  io.to(sessionCode).emit('participantStatus', { participants });
}

// Helper function to decode HTML entities
function decodeHtml(html) {
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'",
    '&#x27;': "'",
    '&ldquo;': '"',
    '&rdquo;': '"',
    '&lsquo;': "'",
    '&rsquo;': "'",
  };
  return html.replace(/&[#\w]+;/g, (entity) => entities[entity] || entity);
}

// Proper shuffle function
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

async function fetchTriviaQuestions(amount = 5, difficulty = 'mixed') {
  let apiUrl = `https://opentdb.com/api.php?amount=${amount}&type=multiple`;
  
  // Add difficulty parameter if not mixed
  if (difficulty !== 'mixed') {
    apiUrl += `&difficulty=${difficulty}`;
  }
  
  const res = await fetch(apiUrl);
  const data = await res.json();
  return data.results.map(q => {
    // Decode HTML entities for question and all answers
    const decodedQuestion = decodeHtml(q.question);
    const decodedCorrectAnswer = decodeHtml(q.correct_answer);
    const decodedIncorrectAnswers = q.incorrect_answers.map(decodeHtml);
    
    // Create and shuffle options
    const allAnswers = [...decodedIncorrectAnswers, decodedCorrectAnswer];
    const shuffledOptions = shuffleArray(allAnswers);
    
    return {
      question: decodedQuestion,
      options: shuffledOptions,
      answer: shuffledOptions.indexOf(decodedCorrectAnswer),
    };
  });
}

io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Facilitator creates a session
  socket.on('createSession', (data, callback) => {
    let sessionCode;
    do {
      sessionCode = generateSessionCode();
    } while (sessions[sessionCode]);
    sessions[sessionCode] = {
      facilitator: socket.id,
      participants: [],
      quizState: {},
    };
    socket.join(sessionCode);
    saveSession(sessionCode, socket.id);
    if (callback) callback({ sessionCode });
    console.log(`Session created: ${sessionCode} by ${socket.id}`);
    emitParticipantStatus(sessionCode);
  });

  // Participant joins a session
  socket.on('joinSession', ({ sessionCode, name }, callback) => {
    const session = sessions[sessionCode];
    if (!session) {
      if (callback) callback({ error: 'Session not found' });
      return;
    }
    session.participants.push({ id: socket.id, name });
    socket.join(sessionCode);
    saveParticipant(sessionCode, socket.id, name);
    if (callback) callback({ success: true });
    // Notify facilitator/others
    io.to(sessionCode).emit('participantJoined', { name, id: socket.id });
    console.log(`${name} joined session ${sessionCode}`);
    emitParticipantStatus(sessionCode);
  });

  // Facilitator starts the quiz
  socket.on('startQuiz', async ({ sessionCode, questionCount = 5, difficulty = 'mixed' }, callback) => {
    const session = sessions[sessionCode];
    if (!session || session.facilitator !== socket.id) {
      if (callback) callback({ error: 'Invalid session or permissions' });
      return;
    }
    // Validate question count
    const numQuestions = Math.min(Math.max(questionCount, 3), 25); // Min 3, Max 25
    // Fetch dynamic questions
    const dynamicQuestions = await fetchTriviaQuestions(numQuestions, difficulty);
    session.quizState = {
      started: true,
      currentQuestion: 0,
      questions: dynamicQuestions,
      answers: {}, // { socketId: [answerIndex, ...] }
    };
    io.to(sessionCode).emit('quizStarted', { totalQuestions: numQuestions });
    // Send first question
    io.to(sessionCode).emit('question', {
      index: 0,
      question: dynamicQuestions[0].question,
      options: dynamicQuestions[0].options,
    });
    // Reset participant status for first question
    emitParticipantStatus(sessionCode);
    startQuestionTimer(sessionCode);
    if (callback) callback({ success: true });
    console.log(`Quiz started for session ${sessionCode} with ${numQuestions} ${difficulty} questions`);
  });

  // Facilitator sends next question
  socket.on('nextQuestion', ({ sessionCode }, callback) => {
    const session = sessions[sessionCode];
    if (!session || session.facilitator !== socket.id) {
      if (callback) callback({ error: 'Invalid session or permissions' });
      return;
    }
    const quiz = session.quizState;
    if (!quiz || !quiz.started) {
      if (callback) callback({ error: 'Quiz not started' });
      return;
    }
    quiz.currentQuestion++;
    if (quiz.currentQuestion >= quiz.questions.length) {
      io.to(sessionCode).emit('quizEnded');
      if (callback) callback({ finished: true });
      return;
    }
    const q = quiz.questions[quiz.currentQuestion];
    io.to(sessionCode).emit('question', {
      index: quiz.currentQuestion,
      question: q.question,
      options: q.options,
    });
    // Reset participant status for new question
    emitParticipantStatus(sessionCode);
    startQuestionTimer(sessionCode);
    if (callback) callback({ success: true });
    console.log(`Sent question ${quiz.currentQuestion} to session ${sessionCode}`);
  });

  // Participant submits answer
  socket.on('submitAnswer', ({ sessionCode, answerIndex }, callback) => {
    const session = sessions[sessionCode];
    if (!session || !session.quizState || !session.quizState.started) {
      if (callback) callback({ error: 'Quiz not started or session not found' });
      return;
    }
    const quiz = session.quizState;
    if (!quiz.answers[socket.id]) {
      quiz.answers[socket.id] = [];
    }
    quiz.answers[socket.id][quiz.currentQuestion] = answerIndex;
    if (callback) callback({ success: true });
    console.log(`Answer received from ${socket.id} for question ${quiz.currentQuestion}: ${answerIndex}`);
    emitParticipantStatus(sessionCode);
  });

  // Facilitator shows results
  socket.on('showResults', ({ sessionCode }, callback) => {
    const session = sessions[sessionCode];
    if (!session || session.facilitator !== socket.id) {
      if (callback) callback({ error: 'Invalid session or permissions' });
      return;
    }
    const quiz = session.quizState;
    if (!quiz) {
      if (callback) callback({ error: 'Quiz not started' });
      return;
    }
    // Calculate scores
    const scores = session.participants.map(p => {
      const answers = quiz.answers[p.id] || [];
      let score = 0;
      quiz.questions.forEach((q, i) => {
        if (answers[i] === q.answer) score++;
      });
      return { name: p.name, score };
    });
    io.to(sessionCode).emit('results', { scores });
    saveResults(sessionCode, session.participants.map(p => ({ id: p.id, name: p.name, score: scores.find(s => s.name === p.name)?.score || 0 })));
    if (callback) callback({ success: true, scores });
    console.log(`Results sent for session ${sessionCode}`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // Optionally: remove from sessions/participants
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
}); 