import stringSimilarity from 'string-similarity';

// Helper to clean text (remove accents, lowercase)
export const normalize = (text: string) => {
  let clean = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  
  // Expand common academic abbreviations to improve matching
  clean = clean
    .replace(/\bsup\.?\b/g, "supervisionado")
    .replace(/\bser\.?\b/g, "servicos")
    .replace(/\bfar\.?\b/g, "farmaceuticos")
    .replace(/\bdis\.?\b/g, "dispensacao")
    .replace(/\bcom\.?\b/g, "comunitaria")
    .replace(/\bprat\.?\b/g, "praticas")
    .replace(/\btec\.?\b/g, "tecnologia")
    .replace(/\bint\.?\b/g, "integrado")
    .replace(/\best\.?\b/g, "estagio")
    .replace(/\bdesenv\.?\b/g, "desenvolvimento")
    .replace(/\bfor\.?\b/g, "formulacoes")
    .replace(/\bform\.?\b/g, "formulacoes")
    .replace(/\bgalenic[a-z]*\b/g, "galenica")
    // OCR Fixes
    .replace(/\|/g, "i") // Replace pipe | with i (common OCR error for I)
    .replace(/!/g, "i"); // Replace ! with i (common OCR error)

  return clean;
};

export interface PredictionResult {
  studentCourse: string;
  cleanStudentName: string; // New field for feedback key generation
  targetCourse: string;
  nameSimilarity: number;
  workloadMatch: boolean;
  syllabusSimilarity: number;
  finalScore: number;
  decision: 'Provável Aprovação' | 'Provável Reprovação';
}

export const predictEquivalence = (
  transcriptText: string, 
  curriculum: any[],
  feedbackMap: Record<string, 'Approved' | 'Rejected'> = {} // New parameter
): PredictionResult[] => {
  
  // 1. Intelligent Course Extraction
  // Expanded regex to support:
  // - Estacio: ARA1234
  // - Uninassau: 20152 033100 (Semester + Numeric Code)
  // - Generic: PST 220800
  // Regex groups: 1=Semester(optional), 2=Code, 3=Rest
  const courseRegex = /(?:^|\s)(?:(\d{4,5}|PST)\s+)?([A-Z0-9.-]{5,15})\s+(.*)/i;
  const allLines = transcriptText.split('\n');
  const studentCourses: { originalLine: string; name: string; failed: boolean }[] = [];

  // Helper to clean course name
  const cleanCourseName = (text: string) => {
    // Remove Grade/Status patterns
    let name = text.replace(/(\d{1,3}\s*h?|\d+[.,]\d+)\s*(AP|RP|APROVADO|REPROVADO|MATRICULADO|CUMPRIU|DISPENSADO|DISP|CANC|TRANCADO|ANOS).*$/i, '');
    // Remove trailing single letters
    name = name.replace(/\s+[A-Z0-9]$/, '');
    
    // Remove leading noise (symbols, punctuation from OCR)
    // e.g. ": : “+ ANATOMIA" -> "ANATOMIA"
    name = name.replace(/^[:\s"“+.\-_]+/, '');

    return name.trim();
  };

  // Helper to check failure status
  const checkFailure = (line: string) => {
    return /(REPROVADO|REP\.|TRANCADO|CANC\.|CANCELADO)/i.test(line);
  };

  for (const line of allLines) {
    const match = line.match(courseRegex);
    if (match && match[2] && match[3]) {
      const code = match[2];
      const rest = match[3];

      // Validation: Code must contain at least one digit to avoid matching random words
      if (!/\d/.test(code)) continue;

      const courseName = cleanCourseName(rest);
      if (courseName.length > 2) {
        studentCourses.push({ 
          originalLine: line, 
          name: courseName,
          failed: checkFailure(line)
        });
      }
    }
  }

  // FALLBACK: If regex found few/no courses (scanned file or different format without codes)
  if (studentCourses.length < 3) {
    for (const line of allLines) {
      const trimmed = line.trim();
      // Skip headers/short lines
      if (trimmed.length < 10 || /histórico|nome|curso|página|data|hora|universidade|faculdade/i.test(trimmed)) continue;
      
      // If not already added
      if (studentCourses.some(c => c.originalLine === line)) continue;

      // Heuristic: Look for lines ending with status/grade patterns common in transcripts
      if (/(\d{1,3}\s*h?|\d+[.,]\d+)\s*(AP|RP|APROVADO|REPROVADO|CUMPRIU)/i.test(trimmed)) {
         const courseName = cleanCourseName(trimmed);
         if (courseName.length > 2) {
           studentCourses.push({ 
             originalLine: line, 
             name: courseName,
             failed: checkFailure(trimmed)
           });
         }
      }
    }
  }

  const results: PredictionResult[] = [];

  // Now, we loop through only the clean courses we found
  for (const studentCourse of studentCourses) {
    let bestMatch: PredictionResult | null = null;
    let highestScore = 0;

    for (const targetCourse of curriculum) {
      // A. Name Similarity (Fuzzy Match)
      let nameSim = stringSimilarity.compareTwoStrings(
        normalize(studentCourse.name), 
        normalize(targetCourse.name)
      );

      // Boost for prefix match (Truncation handling)
      // e.g. "BASES DE BIOLOGIA..." vs "BASES DE BIOLOGIA... E GENETICA"
      const normStudent = normalize(studentCourse.name);
      const normTarget = normalize(targetCourse.name);
      
      // If the student course is a prefix of the target (and is at least 10 chars long to avoid small matches)
      if (normStudent.length > 10 && normTarget.startsWith(normStudent)) {
        nameSim = Math.max(nameSim, 0.95);
      }

      // Reverse check: If the target course is a prefix of the student course (e.g. student text has professor name at end)
      // e.g. Student: "QUIMICA BIOLOGICA WANDERSON", Target: "QUIMICA BIOLOGICA"
      if (normTarget.length > 5 && normStudent.startsWith(normTarget)) {
         // Ensure it's a whole word match (next char is space or end of string)
         // This prevents matching "BIO" to "BIOLOGIA"
         const nextChar = normStudent[normTarget.length];
         if (!nextChar || nextChar === ' ') {
            nameSim = Math.max(nameSim, 0.95);
         }
      }

      // B. Workload Check (Simple tolerance)
      // We look for hours in the original, full line from the transcript
      const studentHoursMatch = studentCourse.originalLine.match(/(\d+)\s*(h|hours)/i);
      const studentHours = studentHoursMatch ? parseInt(studentHoursMatch[1]) : 0;
      
      // Allow 20% difference
      const workloadMatch = studentHours > 0 
        ? (Math.abs(studentHours - targetCourse.workload) / targetCourse.workload) <= 0.2
        : true; // If we can't find hours, we ignore this check (neutral)

      // C. Syllabus Similarity (Cosine-like using string similarity on summaries)
      // Note: Real semantic embedding is too heavy for a beginner browser demo.
      // We use string-similarity as a proxy for word overlap.
      const syllabusSim = targetCourse.syllabus 
        ? stringSimilarity.compareTwoStrings(normalize(studentCourse.name), normalize(targetCourse.syllabus))
        : 0.5; // Default if no syllabus

      // D. Calculate Final Score (Weighted Average)
      // REVISED WEIGHTS: Name is critical (80%), Workload (20%). 
      // Syllabus removed from score calculation to avoid noise.
      let score = (nameSim * 0.8) + (workloadMatch ? 0.2 : 0);

      // --- FEEDBACK OVERRIDE ---
      // Check if user has manually approved/rejected this specific pair
      const feedbackKey = `${normalize(studentCourse.name)}|${normalize(targetCourse.name)}`;
      if (feedbackMap[feedbackKey] === 'Approved') {
        score = 1.0; // Force perfect score
      } else if (feedbackMap[feedbackKey] === 'Rejected') {
        score = 0.0; // Force zero score (this allows the loop to find the NEXT best match if any)
      }
      // -------------------------
      
      if (score > highestScore) {
        highestScore = score;
        bestMatch = {
          studentCourse: studentCourse.originalLine.substring(0, 50), // Show the original line for context
          cleanStudentName: studentCourse.name,
          targetCourse: targetCourse.name,
          nameSimilarity: parseFloat(nameSim.toFixed(2)),
          workloadMatch,
          syllabusSimilarity: parseFloat(syllabusSim.toFixed(2)),
          finalScore: parseFloat(score.toFixed(2)),
          // Decision logic: Must meet score threshold AND not be failed
          decision: (score >= 0.60 && !studentCourse.failed) ? 'Provável Aprovação' : 'Provável Reprovação'
        };
      }
    }

    if (bestMatch && bestMatch.finalScore > 0.3) {
      results.push(bestMatch);
    }
  }

  return results;
};
