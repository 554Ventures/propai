# Chatbot Implementation Tracker

Last updated: 2026-04-07

## Backend endpoints status
- POST /api/chat: Done
- GET /api/chat/history: Done

## Frontend widget status
- Floating launcher button: Not started
- Chat panel UI + message list: Not started
- Input + send flow: Not started
- Quick actions: Not started
- Typing indicator + loading states: Not started
- Citations/tool call display: Not started
- Session persistence (localStorage): Not started
- History load on open: Not started

## Function calling tools status
- getRentCollected: Done
- getOutstandingRent: Done
- listProperties: Done
- getPropertyExpenses: Done
- getLeaseEnding: Done
- findDocument: Done

## Testing checklist
- [ ] "How much rent did I collect last month?" calls getRentCollected
- [ ] "List my properties" calls listProperties
- [ ] "Show me expenses for Oak Street" calls getPropertyExpenses
- [ ] Quick action buttons work
- [ ] Chat history persists across page refreshes
- [ ] Multiple conversations don’t cross-contaminate

## Known issues / blockers
- API build fails because vitest.config.ts is included outside tsconfig rootDir (pre-existing).
