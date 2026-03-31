# Chatbot Implementation Tracker

Last updated: 2026-04-08

## Backend endpoints status
- POST /api/chat: Done
- GET /api/chat/history: Done

## Frontend widget status
- Floating launcher button: Done
- Chat panel UI + message list: Done
- Input + send flow: Done
- Quick actions: Done
- Typing indicator + loading states: Done
- Citations/tool call display: Done
- Session persistence (localStorage): Done
- History load on open: Done
- Dashboard AI chat hero section: Done
- Navigation AI Assistant entry: Done
- Enhanced AI-themed launcher styling + animation: Done

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
- [ ] Dashboard Ask PropAI section opens full chat
- [ ] Example chips open chat and send message
- [ ] Navigation AI Assistant link opens chat

## Known issues / blockers
- API build fails because vitest.config.ts is included outside tsconfig rootDir (pre-existing).
- Web lint fails due to eslint config import error (eslint package exports).
