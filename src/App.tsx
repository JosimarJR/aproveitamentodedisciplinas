import React, { useState, useEffect } from 'react';
import './App.css';
import { parseExcelCurriculum, parsePdfToText, CourseData } from './utils/parsers';
import { predictEquivalence, PredictionResult, normalize } from './utils/algorithm';
import * as XLSX from 'xlsx';

// --- ICONS (SVG Components for portability) ---
const Icons = {
  Logo: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
      <path d="M6 12v5c3 3 9 3 12 0v-5" />
    </svg>
  ),
  Upload: () => (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  FileText: () => (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <polyline points="10 9 9 9 8 9" />
    </svg>
  ),
  CheckCircle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  AlertCircle: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  Download: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  Zap: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  ThumbsUp: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
    </svg>
  ),
  ThumbsDown: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  ),
  Trash: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  )
};

// --- CONFIGURATION ---
const AVAILABLE_CURRICULA = [
  { label: "Currículo 224 (Padrão)", filename: process.env.PUBLIC_URL + "/curricula/224.xlsx" },
  { label: "Currículo 2024 (Novo)", filename: process.env.PUBLIC_URL + "/curricula/2024.xlsx" },
];

function App() {
  // --- STATE ---
  const [selectedCurriculumFile, setSelectedCurriculumFile] = useState(AVAILABLE_CURRICULA[0].filename);
  const [curriculum, setCurriculum] = useState<CourseData[]>([]);
  const [transcriptText, setTranscriptText] = useState<string>("");
  const [results, setResults] = useState<PredictionResult[]>([]);
  
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState("");
  const [useOCR, setUseOCR] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, 'Approved' | 'Rejected'>>({});
  const [pendingFeedbackMap, setPendingFeedbackMap] = useState<Record<string, 'Approved' | 'Rejected'>>({});

  // --- EFFECTS ---
  useEffect(() => {
    const loadDefaultCurriculum = async () => {
      try {
        const data = await parseExcelCurriculum(selectedCurriculumFile);
        setCurriculum(data);
        setError("");
      } catch (err) {
        console.error(err);
        const errorMessage = err instanceof Error ? err.message : "Erro desconhecido";
        setError(`Erro ao ler ${selectedCurriculumFile}: ${errorMessage}`);
      }
    };
    loadDefaultCurriculum();

    // Load feedback from local storage
    const savedFeedback = localStorage.getItem('equivalence_feedback');
    if (savedFeedback) {
      try {
        setFeedbackMap(JSON.parse(savedFeedback));
      } catch (e) {
        console.error("Erro ao carregar feedback salvo:", e);
      }
    }
  }, [selectedCurriculumFile]);

  // --- HANDLERS ---
  const processFile = async (file: File, enableOCR: boolean) => {
    setLoading(true);
    setLoadingMessage(enableOCR ? "Processando OCR (pode demorar)..." : "Lendo PDF...");
    setError("");

    try {
      const text = await parsePdfToText(file, enableOCR);
      setTranscriptText(text);
      setLoadingMessage("Arquivo lido com sucesso!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido ao ler arquivo");
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    await processFile(file, useOCR);
  };

  const handlePredict = () => {
    if (!transcriptText) {
      setError("Por favor, faça o upload do histórico escolar primeiro.");
      return;
    }
    if (curriculum.length === 0) {
      setError("Dados da grade curricular não foram carregados.");
      return;
    }

    setLoading(true);
    setLoadingMessage("Analisando compatibilidade...");
    
    setTimeout(() => {
      try {
        const predictions = predictEquivalence(transcriptText, curriculum, feedbackMap);
        setResults(predictions);
        if (predictions.length === 0) {
          setError("Nenhuma correspondência encontrada. Tente marcar a opção 'Habilitar OCR'.");
        }
      } catch (err) {
        setError("Erro durante o algoritmo de predição.");
      }
      setLoading(false);
    }, 800); // Slight delay for UX
  };

  const handleFeedback = (studentName: string, targetName: string, type: 'Approved' | 'Rejected') => {
    const key = `${normalize(studentName)}|${normalize(targetName)}`;
    setPendingFeedbackMap(prev => {
      const newState = { ...prev };
      // Se clicar na mesma ação já selecionada, remove (toggle off)
      if (newState[key] === type) {
        delete newState[key];
      } else {
        newState[key] = type;
      }
      return newState;
    });
  };

  const confirmFeedback = () => {
    if (Object.keys(pendingFeedbackMap).length === 0) return;

    const newMap = { ...feedbackMap, ...pendingFeedbackMap };
    setFeedbackMap(newMap);
    setPendingFeedbackMap({});
    localStorage.setItem('equivalence_feedback', JSON.stringify(newMap));

    if (transcriptText && curriculum.length > 0) {
      const predictions = predictEquivalence(transcriptText, curriculum, newMap);
      setResults(predictions);
    }
  };

  const clearFeedback = () => {
    if (window.confirm("Tem certeza que deseja limpar todo o aprendizado do sistema?")) {
      setFeedbackMap({});
      setPendingFeedbackMap({});
      localStorage.removeItem('equivalence_feedback');
      handlePredict(); // Re-run to reset
    }
  };

  const exportToExcel = () => {
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Resultados");
    XLSX.writeFile(wb, "equivalencia_resultados.xlsx");
  };

  // --- RENDER HELPERS ---
  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'var(--success)';
    if (score >= 0.6) return 'var(--warning)';
    return 'var(--danger)';
  };

  return (
    <div className="app-container">
      {/* 1. NAVIGATION BAR */}
      <nav className="navbar">
        <div className="nav-brand">
          <div className="nav-logo-icon">
            <Icons.Logo />
          </div>
          <span>AcademicMatch</span>
        </div>
        <div className="nav-links">
          <a href="#" className="nav-link active">Início</a>
          <a href="#" className="nav-link">Sobre</a>
          <a href="#" className="nav-link">Ajuda</a>
        </div>
      </nav>

      <main className="main-content">
        {/* HEADER */}
        <header style={{ marginBottom: '40px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '2.5rem', fontWeight: '800', color: 'var(--primary)', marginBottom: '10px' }}>
            Preditor de Equivalência
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', maxWidth: '600px', margin: '0 auto' }}>
            Ferramenta inteligente para análise automática de aproveitamento de disciplinas acadêmicas.
          </p>
        </header>

        {/* ERROR BANNER */}
        {error && (
          <div className="alert alert-error">
            <Icons.AlertCircle />
            <span>{error}</span>
            <button onClick={() => setError("")} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* WIZARD STEPS */}
        <div className="wizard-grid">
          
          {/* STEP 1: CONFIGURATION */}
          <div className="step-card">
            <div className="step-header">
              <div className="step-number">1</div>
              <div className="step-title">Configuração</div>
            </div>
            
            <div className="form-group">
              <label className="form-label">Grade Curricular Alvo</label>
              <select 
                className="custom-select"
                value={selectedCurriculumFile}
                onChange={(e) => setSelectedCurriculumFile(e.target.value)}
              >
                {AVAILABLE_CURRICULA.map((opt, idx) => (
                  <option key={idx} value={opt.filename}>{opt.label}</option>
                ))}
              </select>
            </div>

            <div className="status-indicator" style={{ marginTop: '20px', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
              {curriculum.length > 0 ? (
                <>
                  <span style={{ color: 'var(--success)' }}><Icons.CheckCircle /></span>
                  <span className="text-muted">Grade carregada: <strong>{curriculum.length} disciplinas</strong></span>
                </>
              ) : (
                <span className="text-muted">Carregando grade...</span>
              )}
            </div>
          </div>

          {/* STEP 2: UPLOAD */}
          <div className="step-card">
            <div className="step-header">
              <div className="step-number">2</div>
              <div className="step-title">Histórico Escolar</div>
            </div>

            <label className="upload-box">
              <input type="file" accept=".pdf" onChange={handleFileUpload} />
              <div className="upload-icon"><Icons.Upload /></div>
              <div className="upload-text">Clique ou arraste o PDF aqui</div>
              <div className="upload-subtext">Suporta arquivos PDF de históricos</div>
            </label>

            <div style={{ marginTop: '16px' }}>
              <label className="toggle-label">
                <input 
                  type="checkbox" 
                  className="toggle-input"
                  checked={useOCR} 
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setUseOCR(checked);
                    if (selectedFile) {
                      processFile(selectedFile, checked);
                    }
                  }} 
                />
                <span className="text-sm font-bold">Habilitar OCR Avançado</span>
              </label>
              <p className="text-sm text-muted" style={{ marginTop: '4px', marginLeft: '4px' }}>
                Use para arquivos escaneados ou fotos.
              </p>
            </div>

            {transcriptText && !loading && (
              <div className="alert alert-success" style={{ marginTop: '16px', padding: '10px', marginBottom: 0 }}>
                <Icons.FileText />
                <span className="text-sm">PDF processado com sucesso!</span>
              </div>
            )}
          </div>

          {/* STEP 3: ACTION */}
          <div className="step-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="step-header">
              <div className="step-number">3</div>
              <div className="step-title">Análise</div>
            </div>
            
            <p className="text-sm text-muted" style={{ marginBottom: '24px' }}>
              O sistema irá comparar as disciplinas extraídas com a grade selecionada usando algoritmos de similaridade.
            </p>

            <button 
              className="analyze-btn"
              onClick={handlePredict}
              disabled={!transcriptText || loading || curriculum.length === 0}
            >
              {loading ? (
                <span>Processando...</span>
              ) : (
                <>
                  <Icons.Zap /> Analisar Equivalências
                </>
              )}
            </button>
          </div>
        </div>

        {/* LOADING STATE */}
        {loading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>{loadingMessage}</p>
          </div>
        )}

        {/* RESULTS SECTION */}
        {results.length > 0 && !loading && (
          <div className="results-section">
            <div className="results-header-bar">
              <div className="results-title">
                <h2>Resultados da Análise</h2>
                <span className="text-sm text-muted">{results.length} correspondências encontradas</span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {Object.keys(pendingFeedbackMap).length > 0 && (
                  <button 
                    className="export-btn" 
                    onClick={confirmFeedback} 
                    style={{ borderColor: 'var(--primary)', color: 'var(--primary)', backgroundColor: '#e0e7ff', fontWeight: 'bold' }}
                    title="Aplicar alterações pendentes"
                  >
                    <Icons.CheckCircle /> Salvar Treino ({Object.keys(pendingFeedbackMap).length})
                  </button>
                )}
                <button className="export-btn" onClick={clearFeedback} title="Limpar aprendizado">
                  <Icons.Trash /> Limpar Treino
                </button>
                <button className="export-btn" onClick={exportToExcel}>
                  <Icons.Download /> Exportar Excel
                </button>
              </div>
            </div>
            
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: '30%' }}>Disciplina do Aluno</th>
                    <th style={{ width: '30%' }}>Equivalência na Grade</th>
                    <th style={{ width: '15%' }}>Confiança</th>
                    <th style={{ width: '10%' }}>Decisão</th>
                    <th style={{ width: '15%', textAlign: 'center' }}>O sistema acertou?</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, idx) => {
                    const key = `${normalize(row.cleanStudentName)}|${normalize(row.targetCourse)}`;
                    const pendingAction = pendingFeedbackMap[key];
                    const committedAction = feedbackMap[key];
                    const isApproved = pendingAction === 'Approved' || (!pendingAction && committedAction === 'Approved');
                    const isRejected = pendingAction === 'Rejected' || (!pendingAction && committedAction === 'Rejected');

                    return (
                    <tr key={idx}>
                      <td>
                        <div className="font-bold">{row.studentCourse}</div>
                        {/* Optional: Show original line tooltip or small text if needed */}
                      </td>
                      <td>{row.targetCourse}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="font-bold">{(row.finalScore * 100).toFixed(0)}%</span>
                        </div>
                        <div className="confidence-bar-bg">
                          <div 
                            className="confidence-bar-fill" 
                            style={{ 
                              width: `${row.finalScore * 100}%`,
                              backgroundColor: getConfidenceColor(row.finalScore)
                            }}
                          ></div>
                        </div>
                      </td>
                      <td>
                        <span className={`status-badge ${row.decision === 'Provável Aprovação' ? 'success' : 'danger'}`}>
                          {row.decision === 'Provável Aprovação' ? 'Aprovado' : 'Reprovado'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                          <button 
                            onClick={() => handleFeedback(row.cleanStudentName, row.targetCourse, 'Approved')}
                            className={`feedback-btn ${isApproved ? 'active-success' : ''} ${isRejected ? 'dimmed' : ''}`}
                            title="Sim, acertou (Confirmar)"
                          >
                            <Icons.ThumbsUp />
                          </button>
                          <button 
                            onClick={() => handleFeedback(row.cleanStudentName, row.targetCourse, 'Rejected')}
                            className={`feedback-btn ${isRejected ? 'active-danger' : ''} ${isApproved ? 'dimmed' : ''}`}
                            title="Não, errou (Rejeitar)"
                          >
                            <Icons.ThumbsDown />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
