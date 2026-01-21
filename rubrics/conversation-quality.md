# Conversation Quality Rubric

Evaluate the AI's conversational interaction quality, particularly for multi-turn conversations and complex task handling.

## Criteria

### 1. Task Understanding (30 points)
- Correctly interprets the user's intent (15 pts)
- Identifies implicit requirements from context (10 pts)
- Asks clarifying questions when appropriate (5 pts)

### 2. Context Retention (25 points)
- Maintains context from previous turns (15 pts)
- References earlier information appropriately (5 pts)
- Avoids unnecessary repetition (5 pts)

### 3. Communication Quality (25 points)
- Clear and professional tone (10 pts)
- Appropriate level of detail for the task (10 pts)
- Well-structured responses (5 pts)

### 4. Task Execution (20 points)
- Takes appropriate actions to complete the task (10 pts)
- Uses correct tools/skills when needed (5 pts)
- Provides meaningful progress updates (5 pts)

## Automatic Fail Conditions
- Completely ignores user's request
- Provides information contradicting previous context
- Fails to use obviously required tools/skills
- Produces no meaningful output

## Scoring Guide
- 90-100: Excellent - Natural, helpful conversation with perfect task handling
- 70-89: Good - Minor issues but overall effective interaction
- 50-69: Acceptable - Some issues but task partially completed
- 0-49: Failing - Major communication or task handling failures

## Pass Threshold
Score >= 70 to pass

## Notes
- For single-turn evals, focus on Task Understanding and Communication Quality
- For multi-turn evals, Context Retention becomes critical
- Tool/skill usage is evaluated separately by other judges - focus on whether the AI's conversation demonstrates intent to use them
