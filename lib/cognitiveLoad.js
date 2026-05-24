
// ============================================================
//  FILE: lib/cognitiveLoad.js
//  Rule-based cognitive load analyzer.
//  Runs on extracted concepts + raw text. No AI needed.
// ============================================================
 
export function analyzeCognitiveLoad(concepts, rawText = '') {
  const issues = []
  let loadScore = 0
 
  // ── Rule 1: Term overload (Intrinsic load)
  const allKeywords = concepts.flatMap((c) => c.keywords ?? [])
  const uniqueTerms  = new Set(allKeywords.map((k) => k.toLowerCase()))
 
  if (uniqueTerms.size > 20) {
    loadScore += 4
    issues.push({
      type:     'term_overload',
      severity: 'high',
      detail:   `${uniqueTerms.size} unique technical terms detected`,
      fix:      `Split into ${Math.ceil(uniqueTerms.size / 8)} sessions. Master 8 terms at a time.`,
    })
  } else if (uniqueTerms.size > 12) {
    loadScore += 2
    issues.push({
      type:     'term_overload',
      severity: 'medium',
      detail:   `${uniqueTerms.size} unique terms — approaching overload threshold`,
      fix:      `Review prerequisite concepts before this session.`,
    })
  }
 
  // ── Rule 2: Complex concepts with no prerequisites (Germane load gap)
  const orphanedComplex = concepts.filter(
    (c) => (c.complexity ?? 3) >= 4 && (c.prerequisite_temp_ids ?? []).length === 0
  )
  orphanedComplex.forEach((c) => {
    loadScore += 2
    issues.push({
      type:     'missing_prerequisite',
      severity: 'medium',
      detail:   `"${c.title}" is complexity ${c.complexity}/5 with no prerequisites`,
      fix:      `Study foundational concepts before tackling "${c.title}"`,
    })
  })
 
  // ── Rule 3: Too many high-complexity concepts in one session
  const highComplexConcepts = concepts.filter((c) => (c.complexity ?? 3) >= 4)
  const ratio = concepts.length > 0 ? highComplexConcepts.length / concepts.length : 0
  if (ratio > 0.6) {
    loadScore += 3
    issues.push({
      type:     'complexity_density',
      severity: 'high',
      detail:   `${Math.round(ratio * 100)}% of concepts are high-complexity (≥4/5)`,
      fix:      'Interleave with simpler review concepts. Don\'t stack hard concepts.',
    })
  }
 
  // ── Rule 4: Too many concepts in one session
  if (concepts.length > 8) {
    loadScore += 2
    issues.push({
      type:     'session_too_long',
      severity: 'medium',
      detail:   `${concepts.length} concepts in one session exceeds working memory capacity`,
      fix:      `Split into ${Math.ceil(concepts.length / 4)} sessions of 4 concepts each.`,
    })
  }
 
  // ── Rule 5: Flesch-Kincaid readability (Extraneous load)
  let readabilityScore = 60 // default: average
  if (rawText.length > 200) {
    const sentences = rawText.split(/[.!?]+/).filter((s) => s.trim().length > 5)
    const words     = rawText.split(/\s+/).filter((w) => w.length > 0)
    const syllables = words.reduce((n, w) => {
      return n + Math.max(1, w.toLowerCase().replace(/[^aeiouy]/g, '').length)
    }, 0)
 
    if (sentences.length > 0 && words.length > 0) {
      readabilityScore = Math.round(
        206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length)
      )
      readabilityScore = Math.max(0, Math.min(100, readabilityScore))
    }
 
    if (readabilityScore < 30) {
      loadScore += 2
      issues.push({
        type:     'low_readability',
        severity: 'medium',
        detail:   `Text readability score: ${readabilityScore}/100 (very dense academic prose)`,
        fix:      'Use "Simplified" transform mode for all concepts in this session.',
      })
    }
  }
 
  const clampedScore = Math.min(loadScore, 10)
  const level =
    clampedScore <= 3 ? 'optimal' : clampedScore <= 6 ? 'moderate' : 'high'
 
  return {
    load_score:        clampedScore,
    level,
    readability_score: readabilityScore,
    new_terms_count:   uniqueTerms.size,
    issues,
    recommendation:
      level === 'high'
        ? `Split into ${Math.ceil(concepts.length / 3)} sessions. Start with lowest-complexity concepts.`
        : level === 'moderate'
        ? 'Manageable load. Tackle high-complexity concepts first when your mind is fresh.'
        : 'Well-structured session. Proceed with confidence.',
  }
}