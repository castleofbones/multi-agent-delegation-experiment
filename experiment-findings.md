
# Milestone 8: Single-Agent vs Multi-Agent Experiment

**Project:** Multi-Agent Playground  
**Date:** 26 October 2026  
**Status:** Evaluation complete; Experiment B recommended for merge  
**Repository:** https://github.com/castleofbones/multi-agent-delegation-experiment

## Executive Summary

Milestone 8 compared single-agent and multi-agent AI software development using the same feature request, model family, codebase and acceptance criteria.

The task was to add destination URL editing to the existing URL shortener application.

Both approaches successfully implemented the feature and passed all reported automated verification checks.

**Key findings:**

- **Experiment A (single agent)** completed implementation in 3m 15s.
- **Experiment B (multi-agent)** completed implementation in 6m 53s, including approximately one minute waiting for user confirmation.
- Both implementations passed unit, component, integration and real-browser E2E verification.
- Independent code comparison narrowly preferred Experiment B for its validation, error handling and API response checks.
- Experiment B received a subsequent UI refinement, completed in 1m 17s.
- The final Experiment B implementation passed 35 frontend/backend tests and one Playwright E2E test.
- OpenRouter reported $0.257 of GPT-6 Luna usage across approximately three days of project experimentation. Individual experiment costs were unavailable.

**Overall conclusion:** Multi-agent orchestration worked successfully and produced a slightly preferred implementation, but did not demonstrate a substantial quality or efficiency advantage over the single-agent approach.

The experiment supports retaining both approaches and selecting between them according to task complexity and experimental goals.

---

## 1. Experiment Objectives

The experiment was designed to investigate:

1. Whether a single capable AI agent could independently deliver a complete full-stack feature.
2. Whether specialist delegation improved implementation quality.
3. The execution-time overhead associated with multi-agent coordination.
4. Whether independent specialist review identified meaningful issues.
5. Whether both approaches could satisfy identical acceptance criteria without human implementation intervention.
6. Whether multi-agent orchestration remained practical for a personal hobby project.

This was an exploratory engineering experiment, not a statistically rigorous benchmark.

## 2. Environment and Experimental Setup

### 2.1 Application

The existing URL shortener used:

- TypeScript
- React and Vite
- Node.js and Express
- SQLite using `node:sqlite`
- npm workspaces
- Playwright with Chromium for browser E2E testing
- Docker for production deployment

Development and verification took place on Hermes, a Raspberry Pi 5 running Linux ARM64.

The multi-agent report confirmed:

- Node.js v24.22.1
- npm v11.19.1

The production application and production SQLite database were outside the scope of both experiments.

### 2.2 Model Configuration

Both approaches used:

**GPT-6 Luna via OpenRouter floor routing**

The intention was to hold the model constant while varying the development workflow.

### 2.3 Experiment Isolation

Two separate Git worktrees were created from the same intended baseline:

| Property | Experiment A | Experiment B |
|---|---|---|
| Approach | Single agent | Multi-agent |
| Primary agent | Build | Coordinator |
| Branch | `experiment/m8-single` | `experiment/m8-multi` |
| Worktree | `m8-single` | `m8-multi` |
| Delegation | Disabled | Enabled |
| Model | GPT-6 Luna | GPT-6 Luna |

Each run was instructed to:

- Work only within its own worktree.
- Avoid inspecting the competing implementation.
- Implement the same functional requirements.
- Run the same verification commands.
- Report results and available execution metrics.
- Avoid commits, pushes, merges and deployments.
- Avoid changes to production services or data.

The experiment used separate implementations rather than sequential modifications of the same working tree.

## 3. Feature Specification

Both approaches were tasked with adding the ability to edit the destination URL of an existing short link.

### Functional Requirements

1. Allow editing from the dashboard.
2. Prepopulate the editing form with the current destination URL.
3. Allow a valid replacement URL to be saved.
4. Allow cancellation without modifying the stored destination.
5. Reuse existing HTTP/HTTPS URL validation.
6. Reject invalid URLs without changing stored data.
7. Handle nonexistent aliases appropriately.
8. Preserve the short alias.
9. Preserve the existing visit count.
10. Persist the updated destination in SQLite.
11. Redirect future visits to the updated destination.
12. Update the dashboard after a successful save.
13. Preserve existing create, search, copy, redirect and delete behaviour.

### Verification Requirements

Both implementations were required to run:

```bash
npm test
npm run test:e2e
npm run typecheck
npm run build
git diff --check
```

Browser E2E verification was required to exercise the new feature through a real Chromium browser.

## 4. Experiment A: Single Agent

### 4.1 Execution

**Primary agent:** Build  
**Reported duration:** 3m 15s  
**Delegation:** None  
**Human implementation intervention:** None reported

The single agent independently implemented the backend API, database update, dashboard editing interface and associated tests.

### 4.2 Implementation

The backend introduced:

```http
PUT /api/links/:alias
Content-Type: application/json

{
  "url": "https://example.com/new-destination"
}
```

The route reused existing URL validation and returned:

- `200` for a successful update.
- `400` for invalid input.
- `404` for a nonexistent alias.

A single SQLite update changed only `destination_url`, preserving the alias and visit count.

The frontend added an Edit destination action, an editing form, Save and Cancel controls, and error feedback.

### 4.3 Files Modified

- `backend/src/app.ts`
- `backend/test/app.test.ts`
- `frontend/src/App.tsx`
- `frontend/src/App.test.tsx`
- `frontend/src/App.css`
- `e2e/dashboard.spec.ts`

The pre-existing OpenCode configuration change was left untouched.

### 4.4 Verification

| Check | Result |
|---|---|
| Frontend tests | 16 passed |
| Backend tests | 17 passed |
| Total frontend/backend tests | 33 passed |
| Playwright E2E | 1 passed |
| Typecheck | Passed |
| Production build | Passed |
| `git diff --check` | Passed |

No unresolved implementation issues were reported.

An existing backend test intentionally exercising exhausted alias retries produced an expected error log while passing.

## 5. Experiment B: Multi-Agent

### 5.1 Execution

**Primary agent:** Coordinator  
**Reported duration:** 6m 53s  
**Human confirmation delay:** Approximately one minute  
**Human implementation intervention:** None reported

Experiment B used the configured specialist-agent workflow.

### 5.2 Delegation Record

| Agent | Responsibility |
|---|---|
| Architect | Recommended API design and persistence approach |
| Node.js Specialist | Implemented backend route and tests |
| React Specialist | Implemented dashboard editing and frontend/E2E tests |
| Tester | Audited acceptance coverage |
| Code Reviewer | Reviewed integrated implementation |
| Coordinator | Integrated changes, inspected results and ran verification |

The Architect recommended a PATCH endpoint, reuse of existing validation and an update restricted to the destination field.

The Tester reported no realistic functional coverage gaps.

The Code Reviewer reported no findings.

The Coordinator reported no coordination rework.

### 5.3 Implementation

The backend introduced:

```http
PATCH /api/links/:alias
Content-Type: application/json

{
  "url": "https://example.com/new-destination"
}
```

The route returned:

- `200` for a successful update.
- `400` for invalid input.
- `404` for a nonexistent alias.

A single SQLite update modified only `destination_url`.

Backend tests verified:

- Successful destination replacement.
- Invalid input leaving the stored row unchanged.
- Missing alias handling.
- Preservation of alias and visit count.
- Persistence after reopening the database.
- Redirects using the updated destination.

The frontend provided destination editing, validation feedback, save error handling and cancellation.

### 5.4 Files Modified

- `backend/src/app.ts`
- `backend/test/app.test.ts`
- `frontend/src/App.tsx`
- `frontend/src/App.css`
- `frontend/src/App.test.tsx`
- `e2e/dashboard.spec.ts`

### 5.5 Initial Verification

| Check | Result |
|---|---|
| Frontend tests | 17 passed |
| Backend tests | 17 passed |
| Total frontend/backend tests | 34 passed |
| Playwright E2E | 1 passed |
| Typecheck | Passed |
| Production build | Passed |
| `git diff --check` | Passed |

No unresolved defects or verification failures were reported.

The browser test used a temporary SQLite database and local fixture rather than production services.

## 6. Independent Implementation Comparison

Following both runs, the implementation diffs were compared against the same functional requirements.

### 6.1 Comparison Results

| Dimension | Experiment A | Experiment B | Assessment |
|---|---|---|---|
| API method | PUT | PATCH | Slight preference for B |
| SQLite update | Destination only | Destination only | Equivalent |
| Backend validation | Existing HTTP/HTTPS rules | Existing HTTP/HTTPS rules | Equivalent |
| Persistence | Verified | Verified | Equivalent |
| Redirect behaviour | Verified | Verified | Equivalent |
| Frontend validation | Browser/server validation | Explicit HTTP/HTTPS validation | B preferred |
| Error presentation | Shared action error | Edit-specific error | B preferred |
| API response validation | Validates link structure | Validates structure and alias identity | B preferred |
| UI complexity | Slightly simpler | Slightly more detailed | A preferred |
| Browser E2E | Passed | Passed | Equivalent |

### 6.2 Reasons for Preferring B

**Explicit client-side validation**

Experiment B checks whether the replacement is a valid HTTP/HTTPS URL before sending the request.

This provides more consistent validation feedback.

**Edit-specific error handling**

Experiment B associates errors with the editing form rather than relying on the application's shared action error state.

This makes the feedback more closely related to the operation that failed.

**API response identity checking**

Experiment B verifies that the server response refers to the alias being edited, in addition to checking the returned data structure.

**PATCH semantics**

PATCH is a natural choice for modifying one field of an existing resource.

However, the use of PUT in Experiment A was not treated as a functional defect.

### 6.3 Initial Review Finding

Experiment B initially left Edit and Delete actions available while a link was being edited.

This permitted potentially conflicting interactions, particularly deletion of a link with an active editing form.

The issue was classified as a minor UX refinement rather than a significant implementation defect.

## 7. Final Multi-Agent Refinement

A follow-up task was given to the Coordinator.

The chosen interaction behaviour was:

- **Copy:** Remains visible and enabled.
- **Edit:** Remains visible but disabled while editing that link.
- **Delete:** Remains visible but disabled while editing that link.
- **Save and Cancel:** Retain their existing behaviour.
- **Other links:** Remain unaffected.
- **After save or cancellation:** Normal actions are restored.

This design preserves the dashboard layout and allows useful non-conflicting actions without permitting deletion during editing.

### 7.1 Execution

**Agent:** Coordinator  
**Duration:** 1m 17s  
**Delegation:** None

The Coordinator handled the small change directly, consistent with the project's preference for selective rather than automatic delegation.

### 7.2 Files Changed

- `frontend/src/App.tsx`
- `frontend/src/App.test.tsx`

Other previously modified files were left unchanged.

### 7.3 Tests

The Coordinator updated existing tests to verify action availability during editing and restoration after cancellation or saving.

An additional focused test verified that Copy remained functional and other links' actions were unaffected.

### 7.4 Final Verification

| Check | Result |
|---|---|
| Frontend tests | 18 passed |
| Backend tests | 17 passed |
| Total frontend/backend tests | 35 passed |
| Playwright E2E | 1 passed |
| Typecheck | Passed |
| Production build | Passed |
| `git diff --check` | Passed |

No failures, skipped checks or remaining issues were reported.

This refinement was applied only to Experiment B after the initial comparison. It must therefore be distinguished from the original controlled experiment.

## 8. Execution Time Analysis

### 8.1 Initial Runs

| Metric | Experiment A | Experiment B |
|---|---:|---:|
| Reported session duration | 3m 15s | 6m 53s |
| Duration in seconds | 195 | 413 |
| Approximate confirmation wait | None reported | ~60s |
| Approximate adjusted duration | 195s | 353s |
| Relative adjusted duration | 1.00x | 1.81x |

Experiment A completed the initial implementation faster.

The initial multi-agent run took approximately 2m 38s longer after subtracting the estimated confirmation wait.

### 8.2 Including B's Refinement

| Metric | Duration |
|---|---:|
| Experiment A implementation | 3m 15s |
| Experiment B initial implementation | 6m 53s |
| Experiment B refinement | 1m 17s |
| B combined reported duration | 8m 10s |
| B combined duration excluding estimated wait | ~7m 10s |

The refinement was a subsequent quality-improvement activity, not part of the initial like-for-like run.

The durations are session-level observations. Detailed active-execution telemetry was unavailable, so these figures should not be interpreted as precise model compute time.

## 9. Cost Analysis

### 9.1 Model Pricing

The OpenRouter GPT-6 Luna usage view displayed:

| Metric | Value |
|---|---:|
| Input price | $0.10 per million tokens |
| Output price | $0.50 per million tokens |
| Context capacity | 1 million tokens |

### 9.2 Observed Spending

The OpenRouter screenshot reported:

| Metric | Value |
|---|---:|
| Selected-range usage | $0.257 |
| Current-period usage | $0.248 |
| Percentage of overall usage | 20.8% |

The selected range covered approximately three days during which the user was using OpenCode for this project.

The usage included development experimentation beyond the isolated Milestone 8 A/B runs.

### 9.3 Attribution Limitations

Neither experiment report supplied:

- Input token count.
- Output token count.
- Cache-read token count.
- Billed cost per run.
- Detailed active execution time.

Consequently, the experiment cannot establish whether the single-agent or multi-agent implementation was cheaper.

The aggregate usage demonstrates that the broader development experimentation incurred low reported model charges, but should not be represented as the isolated cost of Milestone 8.

## 10. Findings

### 10.1 Single-Agent Capability

Experiment A demonstrated that a single capable agent could independently complete a modest full-stack feature, including:

- Backend API changes.
- SQLite persistence.
- React UI development.
- Automated tests.
- Real-browser E2E verification.

It completed the initial implementation faster than the multi-agent approach.

### 10.2 Multi-Agent Orchestration

Experiment B demonstrated successful coordination across architecture, backend development, frontend development, testing and review.

No integration rework or unresolved review findings were reported.

The workflow operated successfully without human implementation intervention, although a prompt confirmation delayed the session.

### 10.3 Implementation Quality

The independent comparison narrowly preferred Experiment B.

The preference was based on specific implementation details rather than agent count.

Both implementations satisfied the reported functional requirements.

The observed quality difference was modest and does not establish that multi-agent development generally produces better software.

### 10.4 Selective Delegation

The Coordinator completed the final refinement directly without specialist delegation.

This is consistent with a useful orchestration principle:

**Delegate when specialization or independent review adds value, not merely because specialist agents are available.**

### 10.5 Economics

Aggregate model spending was sufficiently low that marginal execution cost was not the dominant concern for this hobby experiment.

Nevertheless, without per-run cost data, no cost-efficiency winner can be established.

## 11. Experimental Limitations

The findings are subject to several limitations:

1. **Single sample:** Each approach was executed only once.
2. **Small feature:** Destination editing was a well-scoped change, potentially favouring single-agent execution.
3. **Missing cost telemetry:** Individual run costs and token counts were unavailable.
4. **Timing uncertainty:** Experiment B included approximately one minute waiting for user confirmation.
5. **Asymmetric refinement:** Only B received a subsequent UI improvement.
6. **Different implementation decisions:** PUT versus PATCH and frontend validation strategies differed.
7. **Test counts are not coverage metrics:** One additional test does not necessarily establish superior quality.
8. **No long-term observations:** Maintainability and production defect rates were not measured.
9. **No statistical significance:** One comparison cannot support general claims about agent architectures.

This experiment is best understood as a practical case study.

## 12. Conclusions

### Functional Outcome

**Tie.**

Both approaches implemented the feature and passed all reported acceptance checks.

### Initial Execution Speed

**Experiment A wins.**

The single agent completed the implementation substantially faster.

### Independent Implementation Review

**Experiment B wins narrowly.**

Its explicit validation, edit-specific error handling and API response checks were preferred.

### Orchestration

**Experiment B successfully demonstrated the intended multi-agent workflow.**

The Coordinator delegated specialist tasks, integrated the results and verified the complete implementation.

### Cost Efficiency

**Undetermined.**

Individual experiment costs were unavailable.

### Overall Recommendation

Retain both execution modes:

- Prefer a single capable agent for small, clearly bounded implementation tasks.
- Use the Coordinator and specialists for work benefiting from decomposition, independent review or deliberate orchestration experiments.
- Allow the Coordinator to complete small refinements directly when delegation would add unnecessary overhead.

**Experiment B is the recommended implementation for merging into `main`.**

At the time of this report, the available evidence confirms successful verification but does not confirm that the merge has occurred.

## 13. Future Experiments

A future comparison would benefit from:

- Recording per-run billed cost and token counts.
- Recording cache reads separately from input and output tokens.
- Measuring execution time without human confirmation delays.
- Using several tasks rather than one.
- Including tasks of different sizes and levels of coupling.
- Applying the same independent review criteria to both implementations.
- Recording post-review defects and rework.
- Keeping subsequent refinements separate from the initial comparison.

A larger feature involving multiple interdependent components may provide a more meaningful test of specialist delegation.

The objective should remain understanding when multi-agent development adds value, rather than proving that one approach must always win.

---

## Final Assessment

| Dimension | Result |
|---|---|
| Functional correctness | Both passed reported checks |
| Initial speed | Single agent |
| Independent code review | Multi-agent, narrowly |
| Coordination effectiveness | Multi-agent demonstrated successfully |
| Cost efficiency | Inconclusive |
| Recommended implementation | Experiment B |
| General superiority established | No |

**The single agent was faster. The multi-agent team produced a narrowly preferred implementation and demonstrated effective specialist coordination. Both approaches were successful.**

For Multi-Agent Playground, the experiment validates multi-agent orchestration as a practical and enjoyable development approach while reinforcing the value of using the simplest workflow appropriate to the task.
