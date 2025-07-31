import React, { useState, useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Container, Row, Col, Button, Form, Alert, ListGroup, Card, Stack
} from 'react-bootstrap';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

type Question = {
  question: string;
  options: string[];
};

type Score = {
  name: string;
  score: number;
};

const QuizLobby: React.FC = () => {
  const socketRef = useRef<Socket | null>(null);
  const [sessionCode, setSessionCode] = useState('');
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [isFacilitator, setIsFacilitator] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  const [questionIndex, setQuestionIndex] = useState<number>(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [quizStarted, setQuizStarted] = useState(false);
  const [results, setResults] = useState<Score[] | null>(null);
  const [alert, setAlert] = useState<{ variant: string; message: string } | null>(null);
  const [timer, setTimer] = useState<number | null>(null);
  const [timeUp, setTimeUp] = useState(false);
  const [participants, setParticipants] = useState<Array<{ id: string; name: string; answered: boolean; isFacilitator: boolean }>>([]);
  const [questionCount, setQuestionCount] = useState<number>(8);
  const [difficulty, setDifficulty] = useState<string>('mixed');
  const [category, setCategory] = useState<number>(0); // 0 means any category

  useEffect(() => {
    socketRef.current = io(SERVER_URL);
    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!socketRef.current) return;
    socketRef.current.on('participantJoined', ({ name }: { name: string }) => {
      setAlert({ variant: 'info', message: `${name} joined the session!` });
    });
    socketRef.current.on('quizStarted', ({ totalQuestions }: { totalQuestions?: number }) => {
      setQuizStarted(true);
      setResults(null);
      if (totalQuestions) {
        setQuestionCount(totalQuestions);
      }
      setAlert({ variant: 'success', message: 'Quiz started!' });
    });
    socketRef.current.on('question', (q: { index: number; question: string; options: string[] }) => {
      setQuestion({ question: q.question, options: q.options });
      setQuestionIndex(q.index);
      setSelectedAnswer(null);
    });
    socketRef.current.on('quizEnded', () => {
      setQuestion(null);
      setAlert({ variant: 'info', message: 'Quiz ended!' });
    });
    socketRef.current.on('results', ({ scores }: { scores: Score[] }) => {
      setResults(scores);
      setAlert({ variant: 'success', message: 'Results are in!' });
    });
    socketRef.current.on('timer', ({ timeLeft }: { timeLeft: number }) => {
      setTimer(timeLeft);
      setTimeUp(timeLeft === 0);
    });
    socketRef.current.on('participantStatus', ({ participants }: { participants: Array<{ id: string; name: string; answered: boolean; isFacilitator: boolean }> }) => {
      setParticipants(participants);
      // Sync facilitator status with backend data
      const currentUser = participants.find(p => p.id === socketRef.current?.id);
      if (currentUser) {
        setIsFacilitator(currentUser.isFacilitator);
        console.log(`User ${currentUser.name} - isFacilitator: ${currentUser.isFacilitator}`);
      }
      // Debug: Log all facilitators
      const facilitators = participants.filter(p => p.isFacilitator);
      console.log(`Total facilitators: ${facilitators.length}`, facilitators.map(f => f.name));
    });
    return () => {
      socketRef.current?.off('participantJoined');
      socketRef.current?.off('quizStarted');
      socketRef.current?.off('question');
      socketRef.current?.off('quizEnded');
      socketRef.current?.off('results');
      socketRef.current?.off('timer');
      socketRef.current?.off('participantStatus');
    };
  }, []);

  useEffect(() => {
    // Reset timeUp and selectedAnswer when a new question arrives
    setTimeUp(false);
    setSelectedAnswer(null);
  }, [questionIndex]);

  const handleCreateSession = () => {
    socketRef.current?.emit('createSession', {}, ({ sessionCode }: { sessionCode: string }) => {
      setSessionCode(sessionCode);
      setIsFacilitator(true);
      setJoined(true);
      setAlert({ variant: 'success', message: `Session created! Code: ${sessionCode}` });
    });
  };

  const handleJoinSession = () => {
    socketRef.current?.emit('joinSession', { sessionCode, name }, (response: { error?: string }) => {
      if (response.error) {
        setAlert({ variant: 'danger', message: response.error });
      } else {
        setJoined(true);
        setIsFacilitator(false);
        setAlert({ variant: 'success', message: 'Joined session!' });
      }
    });
  };

  const handleStartQuiz = () => {
    socketRef.current?.emit('startQuiz', { 
      sessionCode: sessionCode as string, 
      questionCount: questionCount,
      difficulty: difficulty,
      category: category
    }, (response: { error?: string }) => {
      if (response.error) setAlert({ variant: 'danger', message: response.error });
    });
  };

  const handleNextQuestion = () => {
    socketRef.current?.emit('nextQuestion', { sessionCode: sessionCode as string }, (response: { finished?: boolean }) => {
      if (response?.finished) setAlert({ variant: 'info', message: 'Quiz finished!' });
    });
  };

  const handleSubmitAnswer = () => {
    if (selectedAnswer === null) return;
    socketRef.current?.emit('submitAnswer', { sessionCode, answerIndex: selectedAnswer }, (response: { error?: string }) => {
      if (response.error) setAlert({ variant: 'danger', message: response.error });
      else setAlert({ variant: 'success', message: 'Answer submitted!' });
    });
  };

  const handleShowResults = () => {
    socketRef.current?.emit('showResults', { sessionCode }, (response: { error?: string }) => {
      if (response.error) setAlert({ variant: 'danger', message: response.error });
    });
  };

  return (
    <Container className="d-flex align-items-center justify-content-center min-vh-100" style={{ background: '#f8f9fa' }}>
      <Row className="w-100 justify-content-center">
        <Col xs={12} md={8} lg={6}>
          <Card className="shadow-lg">
            <Card.Header className="text-center bg-dark text-white py-3">
              <h4 className="mb-1">Autodesk</h4>
              <div className="small text-info">ADP Product Analytics</div>
              <div className="small text-light">Team Retro Quiz</div>
            </Card.Header>
            <Card.Body>
              <Stack gap={3}>
                <div className="text-center">
                  <h2 className="mb-2">Team Quiz</h2>
                  <p className="text-muted small">Interactive ice breaker for our retro session</p>
                </div>
                {alert && <Alert variant={alert.variant} onClose={() => setAlert(null)} dismissible>{alert.message}</Alert>}
                {!joined && (
                  <Stack gap={2}>
                    <Button variant="primary" onClick={handleCreateSession} className="w-100">Create Session (Facilitator)</Button>
                    <Form.Control placeholder="Session Code" value={sessionCode} onChange={(e: ChangeEvent<HTMLInputElement>) => setSessionCode(e.target.value)} />
                    <Form.Control placeholder="Your Name" value={name} onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)} />
                    <Button variant="success" onClick={handleJoinSession} className="w-100">Join Session</Button>
                  </Stack>
                )}
                {joined && (
                  <div>
                    <div className="d-flex justify-content-between mb-2">
                      <span><b>Session Code:</b> {sessionCode}</span>
                      <span><b>Name:</b> {name}</span>
                    </div>
                    {/* Participant grid */}
                    {participants.length > 0 && (
                      <div className="mb-3">
                        <div className="fw-bold mb-1">Participants</div>
                        <div className="d-flex flex-wrap gap-2">
                          {participants.map((p) => (
                            <div
                              key={p.id}
                              className={`border rounded px-2 py-1 small d-flex align-items-center ${p.answered ? 'bg-success text-white' : 'bg-light'} ${p.isFacilitator ? 'border-primary' : ''}`}
                              style={{ minWidth: 80, maxWidth: 120, justifyContent: 'center' }}
                              title={p.isFacilitator ? 'Facilitator' : ''}
                            >
                              <span className="text-truncate" style={{ maxWidth: 70 }}>{p.name}</span>
                              {p.answered && <span className="ms-1">✔️</span>}
                              {p.isFacilitator && <span className="ms-1" title="Facilitator">⭐</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {!quizStarted && (
                      <>
                        {isFacilitator ? (
                          <div className="mb-3">
                            <Form.Group className="mb-3">
                              <Form.Label><strong>Number of Questions</strong></Form.Label>
                              <Form.Select 
                                value={questionCount} 
                                onChange={(e) => setQuestionCount(Number(e.target.value))}
                                className="mb-2"
                              >
                                <option value={5}>5 questions (~2 minutes)</option>
                                <option value={8}>8 questions (~3 minutes)</option>
                                <option value={10}>10 questions (~4 minutes)</option>
                                <option value={15}>15 questions (~5 minutes)</option>
                                <option value={20}>20 questions (~7 minutes)</option>
                              </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                              <Form.Label><strong>Category</strong></Form.Label>
                              <Form.Select 
                                value={category} 
                                onChange={(e) => setCategory(Number(e.target.value))}
                                className="mb-2"
                              >
                                <option value={0}>Mixed Categories</option>
                                <option value={9}>General Knowledge</option>
                                <option value={17}>Science & Nature</option>
                                <option value={18}>Computer Science</option>
                                <option value={19}>Mathematics</option>
                                <option value={21}>Sports</option>
                                <option value={23}>History</option>
                                <option value={24}>Politics</option>
                                <option value={25}>Art</option>
                                <option value={27}>Animals</option>
                                <option value={28}>Vehicles</option>
                              </Form.Select>
                            </Form.Group>
                            <Form.Group className="mb-3">
                              <Form.Label><strong>Difficulty Level</strong></Form.Label>
                              <Form.Select 
                                value={difficulty} 
                                onChange={(e) => setDifficulty(e.target.value)}
                                className="mb-2"
                              >
                                <option value="mixed">Mixed (All Levels)</option>
                                <option value="easy">Easy (Relaxed Fun)</option>
                                <option value="medium">Medium (Balanced)</option>
                                <option value="hard">Hard (Challenge Mode)</option>
                              </Form.Select>
                            </Form.Group>
                            <Button variant="primary" onClick={handleStartQuiz} className="w-100">
                              ⭐ Start {category === 0 ? 'Mixed' : 'Themed'} {difficulty !== 'mixed' ? `${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)} ` : ''}Quiz ({questionCount} Questions)
                            </Button>
                          </div>
                        ) : (
                          participants.length > 0 && (
                            <Alert variant="info" className="text-center">
                              Waiting for facilitator to start the quiz...
                            </Alert>
                          )
                        )}
                      </>
                    )}
                    {quizStarted && question && (
                      <div className="mt-3">
                        <h5>Question {questionIndex + 1} of {questionCount}</h5>
                        <p>{question.question}</p>
                        {timer !== null && (
                          <Alert variant={timer > 5 ? 'info' : 'danger'} className="text-center">
                            Time left: <b>{timer}</b> seconds
                          </Alert>
                        )}
                        <Form>
                          <Stack gap={2}>
                            {question.options.map((opt, idx) => (
                              <Form.Check
                                key={idx}
                                type="radio"
                                name="answer"
                                label={opt}
                                value={idx}
                                checked={selectedAnswer === idx}
                                onChange={() => setSelectedAnswer(idx)}
                                disabled={isFacilitator || timeUp}
                              />
                            ))}
                          </Stack>
                        </Form>
                        {timeUp && (
                          <Alert variant="warning" className="mt-2 text-center">Time is up!</Alert>
                        )}
                        <div className="d-flex gap-2 mt-3">
                          {!isFacilitator && (
                            <Button variant="success" onClick={handleSubmitAnswer} disabled={selectedAnswer === null || timeUp}>Submit Answer</Button>
                          )}
                          {isFacilitator && (
                            <Button variant="secondary" onClick={handleNextQuestion}>Next Question</Button>
                          )}
                        </div>
                      </div>
                    )}
                    {isFacilitator && quizStarted && (
                      <Button variant="warning" className="w-100 mt-3" onClick={handleShowResults}>Show Results</Button>
                    )}
                    {results && (
                      <div className="mt-4">
                        <Alert variant="success"><b>Results</b></Alert>
                        <ListGroup>
                          {results.map((s, i) => (
                            <ListGroup.Item key={i}>{s.name}: <b>{s.score}</b></ListGroup.Item>
                          ))}
                        </ListGroup>
                      </div>
                    )}
                  </div>
                )}
              </Stack>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default QuizLobby; 