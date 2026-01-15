/**
 * Detects patterns across multiple failure explanations.
 * Groups similar failures to identify systemic issues.
 */

import type { FailureExplanation, FailurePattern } from './types.js';
import { getLearningConfig, type LearningConfig } from './config.js';

/**
 * Simple text similarity using Jaccard index on word sets
 */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Calculates similarity between two failure explanations
 */
function explanationSimilarity(a: FailureExplanation, b: FailureExplanation): number {
  // If categories don't match, low similarity
  if (a.explanation.patternCategory !== b.explanation.patternCategory) {
    return 0.2;
  }

  // Compare root causes
  const rootCauseSim = textSimilarity(
    a.explanation.rootCause,
    b.explanation.rootCause
  );

  // Compare what went wrong
  const whatWrongSim = textSimilarity(
    a.explanation.whatWentWrong,
    b.explanation.whyItFailed
  );

  // Compare suggested fixes
  const fixSim = textSimilarity(
    a.explanation.suggestedFix,
    b.explanation.suggestedFix
  );

  // Weighted average: root cause is most important
  return rootCauseSim * 0.5 + whatWrongSim * 0.25 + fixSim * 0.25;
}

/**
 * Generates a pattern ID from a category and common words
 */
function generatePatternId(
  category: string,
  explanations: FailureExplanation[]
): string {
  // Extract common words from root causes
  const allWords = explanations
    .flatMap(e => e.explanation.rootCause.toLowerCase().split(/\s+/))
    .filter(w => w.length > 3);

  const wordCounts = new Map<string, number>();
  for (const word of allWords) {
    wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
  }

  // Get top 2 most common words
  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([word]) => word);

  const suffix = topWords.length > 0 ? `-${topWords.join('-')}` : '';
  return `${category}${suffix}-${Date.now().toString(36)}`;
}

/**
 * Generates a human-readable pattern name
 */
function generatePatternName(
  category: string,
  explanations: FailureExplanation[]
): string {
  // Use the most common affected component if available
  const components = explanations
    .map(e => e.explanation.affectedComponent)
    .filter(Boolean);

  const componentCounts = new Map<string, number>();
  for (const comp of components) {
    if (comp) {
      componentCounts.set(comp, (componentCounts.get(comp) || 0) + 1);
    }
  }

  const topComponent = [...componentCounts.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  const categoryName = category.replace(/-/g, ' ');

  if (topComponent) {
    return `${categoryName} in ${topComponent}`;
  }

  return `${categoryName} pattern`;
}

/**
 * Extracts common root causes from a group of explanations
 */
function extractCommonRootCauses(explanations: FailureExplanation[]): string[] {
  // Collect all root causes
  const rootCauses = explanations.map(e => e.explanation.rootCause);

  // Find unique-ish causes (not too similar to each other)
  const uniqueCauses: string[] = [];

  for (const cause of rootCauses) {
    const isDuplicate = uniqueCauses.some(
      existing => textSimilarity(existing, cause) > 0.7
    );
    if (!isDuplicate) {
      uniqueCauses.push(cause);
    }
  }

  return uniqueCauses.slice(0, 5); // Max 5 causes
}

export class PatternDetector {
  private config: LearningConfig;

  constructor(config?: Partial<LearningConfig>) {
    this.config = getLearningConfig(config);
  }

  /**
   * Detects patterns in a set of failure explanations
   */
  detectPatterns(explanations: FailureExplanation[]): FailurePattern[] {
    if (explanations.length === 0) {
      return [];
    }

    // First, group by category
    const byCategory = new Map<string, FailureExplanation[]>();
    for (const exp of explanations) {
      const category = exp.explanation.patternCategory;
      if (!byCategory.has(category)) {
        byCategory.set(category, []);
      }
      byCategory.get(category)!.push(exp);
    }

    const patterns: FailurePattern[] = [];

    // Process each category
    for (const [category, categoryExplanations] of byCategory) {
      // Skip if not enough failures to form a pattern
      if (categoryExplanations.length < this.config.minFailuresForPattern) {
        continue;
      }

      // Cluster within category using similarity
      const clusters = this.clusterExplanations(
        categoryExplanations,
        this.config.similarityThreshold
      );

      // Convert clusters to patterns
      for (const cluster of clusters) {
        if (cluster.length >= this.config.minFailuresForPattern) {
          patterns.push(this.createPattern(category, cluster));
        }
      }
    }

    // Sort by frequency (most common patterns first)
    return patterns.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Clusters explanations by similarity
   */
  private clusterExplanations(
    explanations: FailureExplanation[],
    threshold: number
  ): FailureExplanation[][] {
    const clusters: FailureExplanation[][] = [];
    const assigned = new Set<string>();

    for (const exp of explanations) {
      if (assigned.has(exp.id)) {
        continue;
      }

      // Start a new cluster
      const cluster = [exp];
      assigned.add(exp.id);

      // Find similar explanations
      for (const other of explanations) {
        if (assigned.has(other.id)) {
          continue;
        }

        // Check similarity against all cluster members
        const avgSimilarity =
          cluster.reduce(
            (sum, member) => sum + explanationSimilarity(member, other),
            0
          ) / cluster.length;

        if (avgSimilarity >= threshold) {
          cluster.push(other);
          assigned.add(other.id);
        }
      }

      clusters.push(cluster);
    }

    return clusters;
  }

  /**
   * Creates a FailurePattern from a cluster of explanations
   */
  private createPattern(
    category: string,
    explanations: FailureExplanation[]
  ): FailurePattern {
    // Calculate average similarity within cluster
    let totalSim = 0;
    let pairCount = 0;
    for (let i = 0; i < explanations.length; i++) {
      for (let j = i + 1; j < explanations.length; j++) {
        totalSim += explanationSimilarity(explanations[i], explanations[j]);
        pairCount++;
      }
    }
    const avgSimilarity = pairCount > 0 ? totalSim / pairCount : 1;

    // Collect affected components
    const components = new Set<string>();
    for (const exp of explanations) {
      if (exp.explanation.affectedComponent) {
        components.add(exp.explanation.affectedComponent);
      }
    }

    return {
      patternId: generatePatternId(category, explanations),
      patternName: generatePatternName(category, explanations),
      category,
      failures: explanations,
      frequency: explanations.length,
      affectedComponents: [...components],
      commonRootCauses: extractCommonRootCauses(explanations),
      similarityScore: avgSimilarity,
      detectedAt: new Date().toISOString(),
    };
  }

  /**
   * Merges similar patterns across different runs
   */
  mergeWithExisting(
    newPatterns: FailurePattern[],
    existingPatterns: FailurePattern[]
  ): FailurePattern[] {
    const merged: FailurePattern[] = [...existingPatterns];

    for (const newPattern of newPatterns) {
      // Find existing pattern with same category and high similarity
      const existingIndex = merged.findIndex(
        existing =>
          existing.category === newPattern.category &&
          this.patternsAreSimilar(existing, newPattern)
      );

      if (existingIndex >= 0) {
        // Merge into existing pattern
        const existing = merged[existingIndex];
        merged[existingIndex] = {
          ...existing,
          failures: [...existing.failures, ...newPattern.failures],
          frequency: existing.frequency + newPattern.frequency,
          affectedComponents: [
            ...new Set([
              ...existing.affectedComponents,
              ...newPattern.affectedComponents,
            ]),
          ],
          commonRootCauses: extractCommonRootCauses([
            ...existing.failures,
            ...newPattern.failures,
          ]),
        };
      } else {
        // Add as new pattern
        merged.push(newPattern);
      }
    }

    return merged;
  }

  /**
   * Checks if two patterns are similar enough to merge
   */
  private patternsAreSimilar(a: FailurePattern, b: FailurePattern): boolean {
    // Compare root causes
    const aCauses = a.commonRootCauses.join(' ');
    const bCauses = b.commonRootCauses.join(' ');

    return textSimilarity(aCauses, bCauses) > 0.6;
  }

  /**
   * Gets pattern statistics
   */
  getStats(patterns: FailurePattern[]): {
    totalPatterns: number;
    totalFailures: number;
    avgPatterSize: number;
    byCategory: Record<string, number>;
  } {
    const totalPatterns = patterns.length;
    const totalFailures = patterns.reduce((sum, p) => sum + p.frequency, 0);
    const avgPatterSize =
      totalPatterns > 0 ? totalFailures / totalPatterns : 0;

    const byCategory: Record<string, number> = {};
    for (const pattern of patterns) {
      byCategory[pattern.category] =
        (byCategory[pattern.category] || 0) + pattern.frequency;
    }

    return {
      totalPatterns,
      totalFailures,
      avgPatterSize,
      byCategory,
    };
  }
}

export default PatternDetector;
