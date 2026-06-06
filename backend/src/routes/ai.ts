/**
 * AI assistant — "Ask MITS" endpoint.
 *
 * Wraps askAi() with a MITS-specific system prompt so answers stay grounded
 * in the user's role + the tool's vocabulary. The system prompt includes:
 *   • Who the user is (name + role) — so the AI tailors guidance
 *   • Quick map of pages they have access to and what each does
 *   • Reminder to answer in 2-4 sentences max so it's useful, not noisy
 *
 * No client data is sent to the LLM by default. If we later want grounded
 * answers ("how's my pipeline today?") we'd attach a context object here
 * — for now it's a generic helper / search / draft-message assistant.
 */
import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../lib/auth';
import { askAi, getConfiguredProvider } from '../lib/aiProvider';

export const aiRouter = Router();
aiRouter.use(requireAuth);

// Surface whether AI is enabled so the frontend can hide the button when it isn't.
aiRouter.get('/status', async (_req, res) => {
  const cfg = getConfiguredProvider();
  res.json({
    enabled: !!cfg,
    provider: cfg?.provider || null,
    model: cfg?.model || null,
  });
});

function buildSystemPrompt(user: { name: string; role: string }): string {
  const roleDescriptions: Record<string, string> = {
    founder:           'Vaibhav (founder) — sees everything, ultimate decisions on stage moves, payments, leverage.',
    manager:           'Mitali (manager) — owns service delivery post-handover, manages account managers.',
    demo_lead:         'Samita (demo lead) — runs feedback queue, decides demo outcomes, hands off to Roshni.',
    demo_intake:       'Anjali / Taran (demo intake) — collect intake from leads, send to recruiters, schedule demos.',
    recruiter:         'Aman / Kanchan (recruiters) — propose trainers for sourcing requests, gather availability + skills.',
    sales_closer:      'Roshni (sales closer) — moves clients from positive demo to paid/JBT outcomes via the 7-step wizard.',
    account_manager:   'Muskan / Kashish (account managers) — own ongoing client delivery post-handover.',
    accounts:          'Areena / Ashok (accounts) — record payments, send invoices.',
    payment_processor: 'Malika (payments) — processes incoming client payments, reconciles bank.',
    lead:              'Bhavneet (lead) — backs up the manager, owns delivery cadence.',
  };
  const roleLine = roleDescriptions[user.role] || `User in role: ${user.role}`;
  return `You are the in-app assistant for the MITS Consulting Hub, an internal tool used by the MITS team to run their training-and-sales operation.

The user asking is: ${user.name}. Their role: ${roleLine}

The tool covers the full client lifecycle:
  Lead → IntakeReceived → WithRecruiters (Aman / Kanchan propose trainers) → VerificationPending → TrainerMatched → DemoScheduled → DemoDone → FeedbackPending → SaleClosing (Roshni's 7-step close-out: checklist → engagement letter → payment WA → record payment → confirmation → group rename → Mitali handover) → SaleWon → Active → Completed.
  Side states: Dormant, Hold, Churned, InternalSearch.

Roshni's 4 win outcomes are: Training-Paid, JBT-Paid, Training-EmployerLater, JBT-EmployerLater. Plus CP (closure pending, silent client) and C (not starting, lost).

Be brief and direct (2-4 sentences). Speak as a helpful colleague who knows the tool inside-out. Suggest specific pages or actions when relevant. If asked about real client data, say you don't have access to live records — suggest where to look in the tool.`;
}

aiRouter.post('/ask', async (req: AuthedRequest, res) => {
  const { message, history } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (message.length > 4000) {
    return res.status(400).json({ error: 'message too long (max 4000 chars)' });
  }
  const cfg = getConfiguredProvider();
  if (!cfg) {
    return res.status(503).json({
      error: 'AI is not configured yet. Ask Vaibhav to set XAI_API_KEY / ANTHROPIC_API_KEY / OPENAI_API_KEY in Render env.',
      code: 'NO_AI_PROVIDER',
    });
  }
  try {
    const r = await askAi({
      systemPrompt: buildSystemPrompt({ name: req.user!.name, role: req.user!.role }),
      question: message,
      history: Array.isArray(history) ? history.slice(-10) : undefined,
      maxTokens: 600,
    });
    res.json({ answer: r.answer, provider: r.provider, model: r.model });
  } catch (e: any) {
    res.status(502).json({ error: 'AI request failed: ' + (e.message || String(e)), code: e.code });
  }
});
