# Getting tasks into ToDoApp from an AI tool

ToDoApp accepts tasks in a simple, forgiving JSON format. It works with any AI (Microsoft Copilot, ChatGPT, Claude and so on). The formal definition is in [`intake.schema.json`](intake.schema.json).

## The format

One task, a list of tasks, or an object with a `tasks` list:

```json
{
  "tasks": [
    { "title": "Send NDA to Sam", "project": "Line 4 Bid", "task_type": "quick", "due_date": "2026-11-20" },
    { "title": "Book the review room" }
  ]
}
```

- `title` is the only required field.
- Optional fields are `project` (a project name), `project_id`, `description`, `task_type` (`urgent`, `quick`, `general` or `objective`; shown as "Task type" in the app), `due_date` (`YYYY-MM-DD`) and `status` (`not_started`, `in_progress`, `blocked` or `done`). Anything else is ignored.
- Project names are matched case-insensitively against your active projects. If a name matches nothing, the task lands in Unsorted so it is never lost.
- Missing or unrecognised values fall back to defaults (`general`, `not_started`, no due date).

## Two ways in

1. **The `inbox/` folder.** Drop a `.json` file (any filename) into the `inbox/` folder inside your data folder. The app imports every valid task and moves the file to `inbox/processed/` with a timestamp. Items without a title are skipped and listed under "File problems" against the processed file until you remove that file. A file that can't be read, or has no usable tasks, stays in `inbox/` untouched and is listed under "File problems". This suits tools that can write files, such as agent-mode assistants and scripts.
2. **The Paste tasks button.** Paste the AI's whole reply into the box. ToDoApp finds the JSON even when it is wrapped in a code block or surrounded by chatter, shows a preview, and imports when you click Import. This suits tools that can't write to your disk, such as Copilot in Teams or the browser.

## A ready-to-paste prompt

Replace `[your project names]` with your project names, then paste the meeting transcript (or notes) below the prompt.

> From the meeting transcript below, list every action for me as JSON matching this schema. Use these project names exactly: [your project names]. Use task_type 'quick' for small one-off actions such as emails and chasers, 'urgent' for anything due this week, otherwise 'general'. Reply with only the JSON.

Paste the contents of `intake.schema.json` after the prompt as well if the AI needs the schema spelled out.
