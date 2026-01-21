# Failure Analysis

Analyze the following eval failure and identify the root cause.

## Eval Details
- **Name**: {{evalName}}
- **Category**: {{category}}
- **Description**: {{description}}

## Input
**Prompt given to the agent:**
```
{{prompt}}
```

**Expected Behavior:**
{{expectedBehavior}}

## Agent Response
**Tool Calls Made:**
{{toolCalls}}

**Agent Output:**
```
{{output}}
```

{{#if error}}
**Error:**
```
{{error}}
```
{{/if}}

## Judge Results
{{judgeResults}}

## Your Task

Analyze this failure and provide a JSON response with the following structure:

```json
{
  "whatWentWrong": "Concrete description of what the agent did wrong",
  "whyItFailed": "Underlying reason for the failure",
  "rootCause": "Systemic issue (missing instruction, unclear guidance, wrong tool selection, etc.)",
  "suggestedFix": "What instruction or change would prevent this failure",
  "patternCategory": "Category of failure (tool-selection, missing-capability, wrong-approach, validation-error, etc.)",
  "affectedComponent": "Which agent component is affected (optional)",
  "confidence": 0.85
}
```

Focus on identifying systemic issues that could be fixed by adding or clarifying instructions in the agent's system prompt.
