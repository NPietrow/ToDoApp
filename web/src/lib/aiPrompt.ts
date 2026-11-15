// The prompt the "Copy AI prompt" button puts on the clipboard, and the worked example in Paste
// tasks. AI_PROMPT mirrors docs/ai-intake/README.md, section "A ready-to-paste prompt": keep the
// two in step. The shape line is appended so the prompt works without intake.schema.json.
import { addDays } from './dates'

const PROJECT_PLACEHOLDER = '[your project names]'

export const AI_PROMPT =
  `From the meeting transcript below, list every action for me as JSON matching this schema. ` +
  `Use these project names exactly: ${PROJECT_PLACEHOLDER}. ` +
  `Use task_type 'quick' for small one-off actions such as emails and chasers, 'urgent' for ` +
  `anything due this week, otherwise 'general'. Reply with only the JSON.`

const SHAPE =
  `The schema is a JSON array of objects. "title" is required; "project" (one of the names above), ` +
  `"task_type" (urgent, quick, general or objective), "due_date" (YYYY-MM-DD) and "description" are optional. ` +
  `For example: [{"title": "Send revised costings", "project": "Twin Pilot", "task_type": "quick", ` +
  `"due_date": "2026-11-27"}]`

/** The prompt with the active project names filled in. */
export function buildAiPrompt(projectNames: string[]): string {
  const names = projectNames.length > 0 ? projectNames.join(', ') : 'none yet, so leave "project" out'
  return `${AI_PROMPT.replace(PROJECT_PLACEHOLDER, names)}\n\n${SHAPE}`
}

/** A small reply that would really import: the first active project, a due date a fortnight out. */
export function buildExample(firstProject: string | undefined, today: string): string {
  const project = JSON.stringify(firstProject ?? 'Twin Pilot')
  const due = JSON.stringify(addDays(today, 14))
  return [
    'Here are your actions:',
    '[',
    `  {"title": "Send revised costings", "project": ${project}, "task_type": "quick"},`,
    `  {"title": "Book the site visit", "due_date": ${due}}`,
    ']',
  ].join('\n')
}
