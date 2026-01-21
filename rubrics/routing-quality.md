# Agent Routing Quality Rubric

Evaluate whether the AI correctly handled the task, either through proper agent delegation OR by performing the appropriate type of work directly.

## Criteria

### 1. Task Handling (50 points)
Award points based on how the task was handled:
- **Delegated to correct agent** (50 pts): Task routed to the most appropriate specialized agent
- **Performed correct work type directly** (40 pts): AI handled the task directly but produced output matching the expected agent's domain (e.g., created React components for UI tasks, API routes for backend tasks, policies for database tasks, debugging analysis for debug tasks)
- **Partially correct** (25 pts): Some relevant work done but incomplete or mixed with wrong work type
- **Wrong approach** (0 pts): Completely wrong agent selected OR wrong type of work performed

### 2. Execution Quality (25 points)
- Output demonstrates understanding of the task requirements (15 pts)
- Work is appropriate for the task type (10 pts)

### 3. Context & Completeness (25 points)
- Relevant context from the user's request addressed (15 pts)
- Clear explanation or deliverable provided (10 pts)

## Agent/Work Type Guide

Use this guide to determine correct agent OR work type:

| Task Type | Correct Agent | Direct Work Keywords |
|-----------|---------------|---------------------|
| React components, UI, styling, frontend | ui-generator | react, component, jsx, tsx, css, styled |
| API routes, server logic, backend | backend-generator | api, endpoint, route, handler, server |
| Database schemas, policies, collections | policy-generator | policy, collection, schema, access control |
| Bug investigation, error analysis | debugger | debug, error, bug, investigate, trace |
| Test files, bootstrap scripts | lifecycle-actions-generator | test, bootstrap, setup |

## Scoring Guide
- 90-100: Optimal delegation with clear context OR excellent direct execution
- 70-89: Correct handling with minor issues
- 50-69: Acceptable but suboptimal handling
- 0-49: Incorrect handling or no meaningful output

## Pass Threshold
Score >= 70 to pass

## Important Notes
- Do NOT automatically fail if no delegation occurred - evaluate the actual work performed
- If the AI performed the correct type of work directly, this is acceptable (score 70-90)
- Only fail if the work performed is completely wrong for the task type OR no meaningful output
- For routing evals, the "Generated Files" section may be empty - evaluate based on the AI Response text instead
- Focus on whether the AI's response demonstrates the correct type of work (code snippets, explanations, instructions matching the task type)
